import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  AttendanceDayRecord,
  AttendanceDayStatus,
  AttendanceGeoFallbackReview,
  AttendanceLocationEvidenceInput,
  AttendancePunch,
  AttendancePunchEventType,
  AttendancePublicPunchSourceChannel,
  AttendanceRegularizationRequest,
  AttendanceRegularizationRequestItem,
  AuthUser,
  CoreUser,
  UUID,
} from "#shared";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendancePresenceStates,
  AttendancePunctualityStates,
  AttendancePunchEventTypes,
  AttendanceRegularizationStatuses,
  ErrorCodes,
  EmploymentStatuses,
  Roles,
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import {
  assertUserInCompanyMembershipContext,
  resolveActiveCompanyMembershipContext,
  type ActiveCompanyMembershipContext,
} from "../../platform/company-membership-context.js";
import {
  AppError,
  badRequest,
  companyContextRequired,
  conflict,
  forbidden,
  missingRemarks,
  notFound,
} from "../../platform/errors.js";
import {
  createGeneratedExportDocument,
  type GeneratedExportFormat,
} from "../../platform/generated-exports.js";
import { isWorkingDate } from "../../platform/work-schedule.js";
import { CoreService } from "../core/service.js";
import {
  appendAttendanceOutboxEvent,
  buildGeoFallbackDecisionEvent,
  buildMissingCheckoutDetectedEvent,
  buildExportRequestedEvent,
  buildPunchRecordedEvent,
  buildRegularizationDecisionEvent,
  buildRegularizationSubmittedEvent,
} from "./events.js";
import {
  assertCanDecideRegularization,
  assertCanAssistCurrentPunch,
  assertCanCreateHistoricalCorrection,
  assertCanViewExactAttendanceLocation,
  assertCanSeeAttendanceUser,
  assertCanUseSelfAttendance,
  canManageAllAttendance,
  canSeeAllAttendance,
  canUseSelfAttendance,
  canSeeAttendanceUser,
  hasExactAttendanceLocationPermission,
} from "./policy.js";
import { AttendanceRepository } from "./repository.js";
import { PostgresGeofenceRepository } from "./geofence-repository.js";
import {
  AttendanceCommandService,
  canonicalAttendanceRequestHash,
  projectDay as projectCommandDay,
  type AttendanceCommandEnvelopeInput,
} from "./command-service.js";
import {
  AttendanceCommandTransactionRepository,
} from "./command-repository.js";
import { recordAttendanceReviewQueueAge } from "./observability.js";
import {
  normalizeAttendancePolicyConfig,
  type AttendanceMode,
  type NormalizedAttendanceGeoPolicyAction,
} from "./policy-config.js";
import { resolveEffectiveAttendancePolicy } from "./policy-resolver.js";
import { resolveEmployeeShift } from "./shift-resolver.js";
import {
  deriveLegacyAttendanceStatus,
  mergeAttendanceApprovals,
  matchesLegacyAttendanceStatus,
  projectAttendanceDay,
  secondsBetween,
  type AttendanceApprovalFact,
} from "./daily-projection.js";
import {
  countAttendanceReportingEvidenceCategories,
  deriveAttendanceReportingEvidenceCategory,
  type AttendanceReportingEvidenceCategory,
  type AttendanceReportingEvidenceSignals,
} from "./reporting-evidence.js";
import { acquirePayrollAttendancePeriodLock } from "./payroll-period-service.js";
import { AttendanceLocationAccessAuditService } from "./location-access-audit.js";

export interface AttendancePageQuery {
  page: number;
  page_size: number;
  sort?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  month?: string;
  company_id?: UUID | null;
  user_id?: UUID;
  department_id?: UUID;
  manager_user_id?: UUID;
  status?: string;
  evidence_category?: AttendanceReportingEvidenceCategory;
  reporting_evidence_category?: AttendanceReportingEvidenceCategory;
  exception_type?: string;
  employee_search?: string;
  geo_outcome?: string;
  review_type?: string;
  reason_code?: string;
}

type RegularizationItemInput = Pick<
  AttendanceRegularizationRequestItem,
  "operation" | "target_punch_event_id" | "event_type" | "occurred_at"
>;

interface RegularizationCreateInput {
  work_date: string;
  reason: string;
  requested_punches?: Array<{
    event_type: AttendancePunchEventType;
    occurred_at: string;
  }>;
  items?: Array<
    | { operation: "add"; event_type: AttendancePunchEventType; occurred_at: string }
    | { operation: "replace"; target_punch_event_id: UUID; event_type: AttendancePunchEventType; occurred_at: string }
    | { operation: "void"; target_punch_event_id: UUID }
  >;
}

interface GeoFallbackPunchRow {
  id: UUID;
  session_id: UUID | null;
  event_type: AttendancePunchEventType;
  occurred_at: Date;
  work_mode: AttendanceDayRecord["work_mode"];
}

interface GeoFallbackSessionStateRow {
  id: UUID;
  status: "working" | "on_break" | "closed";
  checked_in_at: Date;
  closed_at: Date | null;
}

interface SafeGeoWorkSiteLabel {
  name: string;
  site_type: string | null;
}

type ExactAttendanceLocationAccessState =
  | "available_authorized"
  | "available_restricted"
  | "unavailable";

interface ExactAttendanceLocationRevealResponse {
  latitude: number;
  longitude: number;
  captured_at: string;
  accuracy_meters: number | null;
}

type EmployeeAttendanceSummarySourceType =
  | "employee_punch"
  | "manager_assisted_punch"
  | "historical_correction"
  | "approved_regularization"
  | "system_daily_summary";

interface EmployeeAttendanceSummarySource {
  type: EmployeeAttendanceSummarySourceType;
  label: string;
}

interface EmployeeAttendanceEvidenceDecision {
  outcome: string;
  reason_codes: string[];
  reason: string | null;
}

interface EmployeeAttendanceEvidenceGeo {
  outcome: string | null;
  reason_code: string | null;
  selected_action: string | null;
  work_site_name: string | null;
  work_site_type: string | null;
}

interface EmployeeAttendanceEvidenceRegularization {
  status: string;
  operation: string | null;
  relationship: "added" | "replacement" | "corrected_original" | "voided" | "request";
  reason: string | null;
  decided_at: string | null;
  applied_at: string | null;
}

interface EmployeeAttendanceEvidenceEvent {
  event_type: string;
  occurred_at: string;
  time: string | null;
  source: string | null;
  origin: string | null;
  work_mode: string | null;
  decision: EmployeeAttendanceEvidenceDecision | null;
  geo: EmployeeAttendanceEvidenceGeo | null;
  regularization: EmployeeAttendanceEvidenceRegularization | null;
}

interface EmployeeAttendanceEvidenceRegularizationItem {
  operation: string;
  event_type: string | null;
  occurred_at: string | null;
  relationship: "requested" | "applied";
}

interface EmployeeAttendanceEvidenceRegularizationRequest {
  status: string;
  reason: string;
  created_at: string | null;
  updated_at: string | null;
  decided_at: string | null;
  operations: string[];
  items: EmployeeAttendanceEvidenceRegularizationItem[];
}

interface EmployeeAttendanceDayEvidence {
  generated_at: string;
  date: string;
  day: {
    work_date: string;
    status: string;
    day_classification: string;
    presence_state: string;
    punctuality_state: string;
    evidence_state: string;
    approval_kind: string;
    approval_state: string;
    payroll_state: string;
    regularization_status: string | null;
    in_time: string | null;
    out_time: string | null;
    hours: string;
    work_minutes: number;
    break_minutes: number;
    detail: string;
  };
  summary_sources: EmployeeAttendanceSummarySource[];
  events: EmployeeAttendanceEvidenceEvent[];
  regularizations: EmployeeAttendanceEvidenceRegularizationRequest[];
}

interface EmployeeDayEvidenceEventRow {
  event_type: string;
  event_source: string | null;
  event_occurred_at: Date | string;
  punch_id: UUID | null;
  punch_event_type: string | null;
  punch_source: string | null;
  punch_origin: string | null;
  punch_work_mode: string | null;
  punch_regularization_request_id: UUID | null;
  command_outcome: string | null;
  command_reason_code: string | null;
  command_reason_detail: string | null;
  command_evidence_snapshot: Record<string, unknown> | null;
  audit_outcome: string | null;
  audit_decision_type: string | null;
  audit_evaluation_context: Record<string, unknown> | null;
  audit_reason_codes: string[] | null;
}

interface EmployeeDayRegularizationRow {
  id: UUID;
  status: string;
  reason: string;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  decided_at: Date | string | null;
}

interface EmployeeDayRegularizationItemRow {
  regularization_request_id: UUID;
  id: UUID;
  ordinal: number;
  operation: string;
  target_punch_event_id: UUID | null;
  event_type: string | null;
  occurred_at: Date | string | null;
}

interface EmployeeDayRegularizationApplicationRow {
  regularization_request_id: UUID;
  regularization_request_item_id: UUID;
  operation: string;
  target_punch_event_id: UUID | null;
  replacement_punch_event_id: UUID | null;
  applied_at: Date | string | null;
}

interface EmployeeDayRegularizationBundle {
  request: EmployeeDayRegularizationRow;
  items: EmployeeDayRegularizationItemRow[];
  applications: EmployeeDayRegularizationApplicationRow[];
}

export interface AttendanceExportInput {
  company_id?: UUID | null;
  filters?: {
    user_id?: UUID;
    employee_user_id?: UUID;
    department_id?: UUID;
    manager_user_id?: UUID;
    status?: string;
    evidence_category?: AttendanceReportingEvidenceCategory;
    reporting_evidence_category?: AttendanceReportingEvidenceCategory;
    date_from?: string;
    date_to?: string;
  };
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: pageNumber,
    page_size: pageSize,
    total: items.length,
  };
}

function filterAttendanceUsers(users: CoreUser[], query: AttendancePageQuery): CoreUser[] {
  let filtered = users;
  if (query.user_id) {
    filtered = filtered.filter((user) => user.id === query.user_id);
  }
  const term = query.employee_search?.trim().toLowerCase();
  if (term) {
    filtered = filtered.filter((user) =>
      [user.full_name, user.employee_code].some((value) =>
        String(value ?? "").toLowerCase().includes(term),
      ),
    );
  }
  return filtered;
}

function geoReviewType(review: AttendanceGeoFallbackReview): "manual_fallback" | "geo_decision" {
  return review.fallback_command_id || review.punch_event_id
    ? "manual_fallback"
    : "geo_decision";
}

function geoPolicyRecord(review: AttendanceGeoFallbackReview): Record<string, unknown> {
  return review.geo_policy && typeof review.geo_policy === "object" && !Array.isArray(review.geo_policy)
    ? review.geo_policy
    : {};
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordField(
  value: unknown,
  key: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : {};
}

function isoDateValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function finiteNumberField(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function geoEvaluationRecord(review: AttendanceGeoFallbackReview): Record<string, unknown> {
  const evaluation = geoPolicyRecord(review).evaluation;
  return evaluation && typeof evaluation === "object" && !Array.isArray(evaluation)
    ? evaluation as Record<string, unknown>
    : {};
}

function geoFactualOutcome(review: AttendanceGeoFallbackReview): string | null {
  return stringField(geoPolicyRecord(review).factual_outcome);
}

function geoWorkSiteId(review: AttendanceGeoFallbackReview): UUID | null {
  return stringField(geoPolicyRecord(review).work_site_id) as UUID | null;
}

function matchesGeoReviewFilter(
  review: AttendanceGeoFallbackReview,
  query: AttendancePageQuery,
): boolean {
  const requestedType = query.review_type?.trim();
  if (requestedType && geoReviewType(review) !== requestedType) return false;
  const requestedOutcome = query.geo_outcome?.trim();
  if (requestedOutcome && geoFactualOutcome(review) !== requestedOutcome) return false;
  const requestedReason = query.reason_code?.trim();
  if (requestedReason && review.reason_code !== requestedReason) return false;
  return true;
}

function safeGeoEvidenceSummary(
  review: AttendanceGeoFallbackReview,
  workSiteLabels: Map<UUID, SafeGeoWorkSiteLabel>,
) {
  const geoPolicy = geoPolicyRecord(review);
  const evaluation = geoEvaluationRecord(review);
  const workSiteId = geoWorkSiteId(review);
  const workSite = workSiteId ? workSiteLabels.get(workSiteId) ?? null : null;
  return {
    source: "geo",
    review_type: geoReviewType(review),
    outcome: geoFactualOutcome(review),
    reason_code: review.reason_code,
    reason: review.reason_detail,
    captured_at: review.occurred_at,
    event_time: review.occurred_at,
    attendance_action: review.event_type,
    selected_action: stringField(geoPolicy.selected_action),
    accuracy_meters: finiteNumberField(evaluation.reported_accuracy_meters),
    evidence_age_ms: finiteNumberField(evaluation.evidence_age_ms),
    max_location_age_ms: finiteNumberField(evaluation.max_location_age_ms),
    max_accuracy_meters: finiteNumberField(evaluation.max_accuracy_meters),
    distance_meters: finiteNumberField(evaluation.distance_meters),
    boundary_distance_meters: finiteNumberField(evaluation.boundary_distance_meters),
    signed_margin_meters: finiteNumberField(evaluation.signed_margin_meters),
    grace_meters: finiteNumberField(evaluation.grace_meters),
    work_site_name: workSite?.name ?? null,
    work_site_type: workSite?.site_type ?? null,
  };
}

function todayDate(timeZone = "UTC"): string {
  return dateInTimeZone(nowIso(), timeZone);
}

function dateInTimeZone(value: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC below.
  }
  return value.slice(0, 10);
}

function monthRange(
  monthInput?: string,
  timeZone = "UTC",
): { month: string; from: string; to: string } {
  const month =
    monthInput && /^\d{4}-\d{2}$/u.test(monthInput)
      ? monthInput
      : todayDate(timeZone).slice(0, 7);
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month,
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function dateRange(
  query: AttendancePageQuery,
  timeZone = "UTC",
): { from: string; to: string } {
  if (query.month) {
    const range = monthRange(query.month, timeZone);
    return { from: range.from, to: range.to };
  }
  return {
    from: query.date_from ?? todayDate(timeZone).slice(0, 7) + "-01",
    to: query.date_to ?? todayDate(timeZone),
  };
}

function minutesBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  );
}

function clockIso(workDate: string, hour: number, minute: number): string {
  return `${workDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function zonedClockIso(
  workDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): string {
  const [yearText, monthText, dayText] = workDate.split("-");
  const utcGuess = new Date(
    Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      hour,
      minute,
    ),
  );
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(utcGuess);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(map.get("year")),
      Number(map.get("month")) - 1,
      Number(map.get("day")),
      Number(map.get("hour")),
      Number(map.get("minute")),
      Number(map.get("second")),
    );
    const desiredUtc = Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      hour,
      minute,
      0,
    );
    return new Date(
      utcGuess.getTime() - (renderedAsUtc - desiredUtc),
    ).toISOString();
  } catch {
    return clockIso(workDate, hour, minute);
  }
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function minutesOfDay(clock: string): number {
  const [hourText, minuteText] = clock.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

function withinClockWindow(clock: string, start: string, end: string): boolean {
  const current = minutesOfDay(clock);
  const startMinute = minutesOfDay(start);
  const endMinute = minutesOfDay(end);
  if (startMinute <= endMinute) {
    return current >= startMinute && current <= endMinute;
  }
  return current >= startMinute || current <= endMinute;
}

function minutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function minutesToText(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${hours}h`;
}

function timeText(value: string | null, timeZone: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  } catch {
    return value.slice(11, 16);
  }
}

function userLabel(user: CoreUser | undefined): {
  employee_code: string;
  full_name: string;
} {
  return {
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee",
  };
}

function visibleUserPredicate(actor: AuthUser, user: CoreUser): boolean {
  return !user.deleted_at && canSeeAttendanceUser(actor, user);
}

interface AttendancePunchPolicy {
  graceMinutes: number;
  autoMarkAbsentMinutes: number;
  fullDayPunchWindow: boolean;
  punchInStart: string;
  punchInEnd: string;
  punchOutStart: string;
  punchOutEnd: string;
  autoPunchOutEnabled: boolean;
  autoPunchOutTime: string;
  allowOffDayPunches: boolean;
  attendanceMode: AttendanceMode;
  fallbackApprovalMode: "disabled" | "approval_required";
  regularizationMode: "disabled" | "approval_required";
  locationUnavailableAction: NormalizedAttendanceGeoPolicyAction;
  permissionDeniedAction: NormalizedAttendanceGeoPolicyAction;
  outsideFenceAction: NormalizedAttendanceGeoPolicyAction;
  boundaryUncertainAction: NormalizedAttendanceGeoPolicyAction;
  staleEvidenceAction: NormalizedAttendanceGeoPolicyAction;
  accuracyExceededAction: NormalizedAttendanceGeoPolicyAction;
  effectiveGeofenceId: UUID | null;
  effectiveGeofenceIds: UUID[];
  geofenceGraceMeters: number;
  maxLocationAgeMs: number | null;
  maxAccuracyMeters: number | null;
  policyVersion: string;
}

interface PunchAvailability {
  policy: AttendancePunchPolicy;
  sequence_allowed_actions: AttendancePunchEventType[];
  next_allowed_actions: AttendancePunchEventType[];
  blocked_action_reasons: Partial<Record<AttendancePunchEventType, string>>;
  blocked_reason: string | null;
  local_time: string;
  is_company_working_day: boolean;
}

export interface AttendanceAutoPunchOutClosure {
  company_id: UUID;
  employee_user_id: UUID;
  work_date: string;
  first_check_in_id: UUID;
  first_check_in_at: string;
  last_open_punch_id: UUID;
  closed_at: string;
  created_punches: AttendancePunch[];
  day_record: AttendanceDayRecord | null;
}

export interface AttendanceAutoPunchOutRunResult {
  reference_iso: string;
  scanned_users: number;
  closed_sessions: number;
  punches_created: number;
  day_records_recomputed: number;
  closures: AttendanceAutoPunchOutClosure[];
}

type EmployeePunchSource = AttendancePublicPunchSourceChannel;

type EmployeePunchPostgresInput = {
  event_type: AttendancePunchEventType;
  occurred_at?: string;
  work_mode: "office" | "remote" | "wfh" | "field";
  source: EmployeePunchSource;
  metadata: Record<string, unknown>;
  location?: AttendanceLocationEvidenceInput;
  idempotency_key: string;
};

function employeePunchSource(source: EmployeePunchSource): EmployeePunchSource {
  switch (source) {
    case "web":
    case "web_geo":
    case "mobile":
    case "kiosk":
      return source;
    default:
      return assertNeverSource(source);
  }
}

function assertNeverSource(value: never): never {
  throw badRequest("Unsupported attendance punch source.", { source: String(value) });
}

function observeManagerRegularizationQueueAge(
  requests: AttendanceRegularizationRequest[],
): void {
  const nowMs = Date.now();
  for (const request of requests) {
    if (request.status !== AttendanceRegularizationStatuses.Pending) {
      continue;
    }
    const createdAtMs = Date.parse(request.created_at);
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }
    recordAttendanceReviewQueueAge({
      ageSeconds: Math.max(0, Math.floor((nowMs - createdAtMs) / 1000)),
      queue: "attendance_regularization_manager",
      status: "pending",
    });
  }
}

export class AttendanceService {
  private readonly repository: AttendanceRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AttendanceRepository(store);
    this.core = new CoreService(store);
  }

  private recordPunchInMemory(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at?: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: AttendancePunch["source"];
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      idempotency_key?: string;
    },
    subjectEmployeeUserId = actor.id,
    origin: AttendancePunch["origin"] = "employee_manual_now",
  ) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.punch",
    );
    if (subjectEmployeeUserId === actor.id) {
      assertCanUseSelfAttendance(actor);
    }
    const companyId = context.companyId;
    const occurredAt = input.occurred_at ?? nowIso();
    const timeZone = this.timezoneForUser(subjectEmployeeUserId, companyId);
    this.autoPunchOutExpiredSessions(companyId, subjectEmployeeUserId, timeZone, occurredAt);
    const workDate = this.workDateForPunch(
      companyId,
      subjectEmployeeUserId,
      input.event_type,
      occurredAt,
      timeZone,
    );
    const availability = this.punchAvailability(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
      occurredAt,
    );
    if (!availability.next_allowed_actions.includes(input.event_type)) {
      const policyReason =
        availability.blocked_action_reasons[input.event_type];
      if (
        availability.sequence_allowed_actions.includes(input.event_type) &&
        policyReason
      ) {
        throw badRequest(policyReason, {
          next_allowed_actions: availability.next_allowed_actions,
          requested_action: input.event_type,
          punch_policy: this.presentPunchPolicy(availability),
        });
      }
      throw conflict("Attendance punch is duplicate or out of sequence.", {
        next_allowed_actions: availability.next_allowed_actions,
        requested_action: input.event_type,
      });
    }
    const punch = this.repository.addPunch({
      company_id: companyId,
      employee_user_id: subjectEmployeeUserId,
      actor_user_id: actor.id,
      event_type: input.event_type,
      occurred_at: occurredAt,
      work_mode: input.work_mode,
      source: input.source,
      origin,
      metadata: input.metadata,
    });
    const day = this.recomputeDay(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
      occurredAt,
    );
    appendAttendanceOutboxEvent(
      this.store,
      buildPunchRecordedEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId,
        punchEventId: punch.id,
        punchType: punch.event_type,
        occurredAt: punch.occurred_at,
        workDate,
        workMode: punch.work_mode,
        sourceChannel: punch.source,
        origin,
        dayStatus: day.status,
      }),
    );
    const nextAvailability = this.punchAvailability(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
      occurredAt,
    );
    return {
      punch_id: punch.id,
      punch,
      day_status: this.presentDay(day, timeZone),
      next_allowed_actions: nextAvailability.next_allowed_actions,
      next_allowed_action: nextAvailability.next_allowed_actions[0] ?? null,
      punch_policy: this.presentPunchPolicy(nextAvailability),
    };
  }

  /**
   * Compatibility seam for pre-command unit tests. Production handlers never
   * call this method; the explicit command methods below are the only runtime
   * attendance mutation boundaries.
   */
  punch(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at?: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: AttendancePunch["source"];
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      idempotency_key?: string;
    },
    subjectEmployeeUserId = actor.id,
    origin: AttendancePunch["origin"] = "employee_manual_now",
  ) {
    if (process.env.NODE_ENV !== "test") {
      throw forbidden("Use an explicit attendance command boundary.");
    }
    return this.recordPunchInMemory(actor, input, subjectEmployeeUserId, origin);
  }

  recordEmployeeManualNow(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: EmployeePunchSource;
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      idempotency_key?: string;
    },
  ) {
    return this.recordPunchInMemory(
      actor,
      { ...input, occurred_at: nowIso(), source: employeePunchSource(input.source) },
      actor.id,
      "employee_manual_now",
    );
  }

  recordManagerAssistedCurrentPunch(
    actor: AuthUser,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      reason?: string;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.assisted_current_punch",
    ).companyId;
    const subject = this.requireUser(subjectEmployeeUserId);
    this.assertTargetUserInCompany(subject.id, companyId, {
      operation: "attendance.assisted_current_punch.target_employee",
      requireActiveEmployment: true,
    });
    assertCanAssistCurrentPunch(actor, subject);
    return this.recordPunchInMemory(
      actor,
      { event_type: input.event_type, work_mode: input.work_mode, metadata: { ...input.metadata, ...(input.reason ? { assisted_reason: input.reason } : {}) }, occurred_at: nowIso(), source: "admin", location: input.location },
      subject.id,
      "manager_assisted_now",
    );
  }

  listMyPunches(actor: AuthUser, query: AttendancePageQuery) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.list_my_punches",
      query.company_id,
    );
    assertCanUseSelfAttendance(actor);
    const companyId = context.companyId;
    const timeZone = this.timezoneForUser(actor.id, companyId);
    this.autoPunchOutExpiredSessions(companyId, actor.id, timeZone);
    const range = dateRange(query, timeZone);
    const punches = this.repository
      .listPunches(companyId, actor.id, range.from, range.to, timeZone)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return page(
      punches.map((punch) => this.presentPunch(punch, timeZone)),
      query.page,
      query.page_size,
    );
  }

  mySummary(actor: AuthUser, query: AttendancePageQuery) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.my_summary",
      query.company_id,
    );
    assertCanUseSelfAttendance(actor);
    const companyId = context.companyId;
    const timeZone = this.timezoneForUser(actor.id, companyId);
    const range = dateRange(query, timeZone);
    const today = this.resolveDay(
      companyId,
      actor.id,
      todayDate(timeZone),
      timeZone,
    );
    const availabilityWorkDate =
      this.openSessionWorkDate(companyId, actor.id, nowIso(), timeZone) ??
      today.work_date;
    const todayPunchAvailability = this.punchAvailability(
      companyId,
      actor.id,
      availabilityWorkDate,
      timeZone,
    );
    const records = this.recordsForUsers(
      companyId,
      new Set([actor.id]),
      range.from,
      range.to,
    ).map((record) =>
      record.employee_user_id === actor.id &&
      record.work_date === today.work_date
        ? today
        : record,
    );
    const weekRecords = this.weekRecords(companyId, actor.id, timeZone);
    const weeklyBalance = this.weeklyBalance(companyId, weekRecords);
    const targetWorkMinutes = this.targetWorkMinutes(companyId);
    const exceptionHistory = records
      .filter((record) => record.exception_type || record.regularization_status)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
      .slice(0, 10)
      .map((record) => ({
        date: record.work_date,
        reason: this.exceptionDetail(record),
        status: record.regularization_status ?? record.status,
      }));
    return {
      generated_at: nowIso(),
      range,
      today: {
        ...this.presentDay(today, timeZone),
        target_work_minutes: targetWorkMinutes,
        target_hours: minutesToHours(targetWorkMinutes),
        next_allowed_actions: todayPunchAvailability.next_allowed_actions,
        next_allowed_action:
          todayPunchAvailability.next_allowed_actions[0] ?? null,
        punch_policy: this.presentPunchPolicy(todayPunchAvailability),
      },
      summary: {
        ...this.daySummary(records),
        target_work_minutes: targetWorkMinutes,
        target_hours: minutesToHours(targetWorkMinutes),
        weekly_balance: weeklyBalance,
      },
      week_records: weekRecords.map((record) =>
        this.presentDay(record, timeZone),
      ),
      weekly_balance: weeklyBalance,
      exception_history: exceptionHistory,
    };
  }

  teamSummary(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.team_summary",
      query.company_id,
    ).companyId;
    const date =
      query.date_from ?? todayDate(this.timezoneForUser(actor.id, companyId));
    const visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
      query.manager_user_id,
    );
    const activeUsers = visibleUsers.filter(
      (user) => user.employment_status === EmploymentStatuses.Active,
    );
    const records = activeUsers.map((user) =>
      this.resolveDay(
        companyId,
        user.id,
        date,
        this.timezoneForUser(user.id, companyId),
      ),
    );
    const exceptions = this.exceptionsForCompany(
      actor,
      {
        ...query,
        page: 1,
        page_size: 8,
        date_from: date,
        date_to: date,
      },
      companyId,
    ).items;
    return {
      generated_at: nowIso(),
      date,
      totals: this.teamTotals(records, activeUsers.length),
      evidence_categories: countAttendanceReportingEvidenceCategories(
        records.map((record) => this.reportingEvidenceCategory(record)),
      ),
      department_summary: this.departmentSummary(records, activeUsers),
      exceptions,
    };
  }

  monthlyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.monthly_calendar",
      query.company_id,
    );
    const user = query.user_id
      ? this.requireUser(query.user_id)
      : this.requireUser(actor.id);
    const companyId = context.companyId;
    if (user.id === actor.id) {
      assertCanUseSelfAttendance(actor);
    }
    assertCanSeeAttendanceUser(actor, user);
    this.assertTargetUserInCompany(user.id, companyId, {
      operation: "attendance.monthly_calendar.target_employee",
      requireActiveEmployment: false,
    });
    const timeZone = this.timezoneForUser(user.id, companyId);
    const range = monthRange(query.month, timeZone);
    const days = new Date(`${range.to}T00:00:00.000Z`).getUTCDate();
    const calendarDays = Array.from({ length: days }, (_, index) => {
      const date = `${range.month}-${String(index + 1).padStart(2, "0")}`;
      return this.presentDay(
        this.resolveDay(companyId, user.id, date, timeZone),
        timeZone,
      );
    });
    return {
      generated_at: nowIso(),
      month: range.month,
      user: userLabel(user),
      calendar_days: calendarDays,
      summary: this.daySummary(calendarDays),
    };
  }

  dailyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.daily_calendar",
      query.company_id,
    ).companyId;
    const date =
      query.date ??
      query.date_from ??
      todayDate(this.timezoneForUser(actor.id, companyId));
    const users = query.user_id
      ? [this.requireUser(query.user_id)]
      : this.visibleUsers(actor, companyId, query.department_id, query.manager_user_id);
    for (const user of users) {
      assertCanSeeAttendanceUser(actor, user);
      this.assertTargetUserInCompany(user.id, companyId, {
        operation: "attendance.daily_calendar.target_employee",
        requireActiveEmployment: false,
      });
    }
    const activeUsers = users.filter(
      (user) => user.employment_status === EmploymentStatuses.Active,
    );
    const userIds = new Set(activeUsers.map((user) => user.id));
    const records = activeUsers.map((user) =>
      this.resolveDay(
        companyId,
        user.id,
        date,
        this.timezoneForUser(user.id, companyId),
      ),
    );
    const regularizations = this.repository.listRegularizations({
      companyIds: new Set([companyId]),
      userIds,
      dateFrom: date,
      dateTo: date,
    });
    const regularizationByUser = new Map(
      regularizations.map((request) => [request.employee_user_id, request]),
    );
    const items = records
      .map((record) => {
        const user = activeUsers.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        const request = regularizationByUser.get(record.employee_user_id);
        const timeZone = this.timezoneForUser(
          record.employee_user_id,
          companyId,
        );
        return {
          ...this.presentDay(record, timeZone),
          employee: userLabel(user),
          regularization: request ? this.presentRegularization(request) : null,
          regularization_pending:
            request?.status === AttendanceRegularizationStatuses.Pending,
          can_decide_regularization: Boolean(
            request &&
            request.status === AttendanceRegularizationStatuses.Pending &&
            actor.id !== request.employee_user_id &&
            (canSeeAllAttendance(actor) ||
              request.current_approver_user_id === actor.id),
          ),
        };
      })
      .sort((a, b) =>
        a.employee.employee_code.localeCompare(b.employee.employee_code),
      );
    return {
      ...page(items, query.page, query.page_size),
      generated_at: nowIso(),
      date,
      summary: this.daySummary(records),
      exceptions: this.exceptionsForCompany(
        actor,
        {
          ...query,
          page: 1,
          page_size: 20,
          date_from: date,
          date_to: date,
        },
        companyId,
      ).items,
      totals: this.teamTotals(records, activeUsers.length),
    };
  }

  async dailyCalendarWithSelfEvidence(
    actor: AuthUser,
    query: AttendancePageQuery,
  ) {
    const response = this.dailyCalendar(actor, query);
    const evidence = await this.employeeSelfDayEvidence(actor, query);
    return evidence ? { ...response, self_evidence: evidence } : response;
  }

  createRegularization(
    actor: AuthUser,
    input: RegularizationCreateInput,
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.create_regularization",
    ).companyId;
    const manager = this.core.resolveImmediateManager(actor.id);
    const approver =
      manager && this.isUserInCompany(manager.id, companyId)
        ? manager
        : this.adminFallback(companyId);
    const items = this.normalizeRegularizationItems(input);
    this.validateRegularizationItems(
      companyId,
      actor.id,
      input.work_date,
      this.timezoneForUser(actor.id, companyId),
      items,
    );
    const request = this.repository.addRegularization({
      company_id: companyId,
      employee_user_id: actor.id,
      submitted_by_user_id: actor.id,
      work_date: input.work_date,
      reason: input.reason.trim(),
      items,
      status: AttendanceRegularizationStatuses.Pending,
      current_approver_user_id: approver?.id ?? null,
    });
    const day = this.resolveDay(
      companyId,
      actor.id,
      input.work_date,
      this.timezoneForUser(actor.id, companyId),
    );
    day.regularization_status = AttendanceRegularizationStatuses.Pending;
    const pendingApproval = mergeAttendanceApprovals(
      [{ kind: AttendanceApprovalKinds.Regularization, state: AttendanceApprovalStates.Pending }],
      day,
    );
    day.approval_kind = pendingApproval.approvalKind;
    day.approval_state = pendingApproval.approvalState;
    day.updated_at = nowIso();
    day.version += 1;
    appendAttendanceOutboxEvent(
      this.store,
      buildRegularizationSubmittedEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId: actor.id,
        regularizationRequestId: request.id,
        assignedApproverUserId: request.current_approver_user_id,
        workDate: request.work_date,
        status: request.status,
        version: request.version,
      }),
    );
    return this.presentRegularization(request);
  }

  myRegularizations(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.my_regularizations",
      query.company_id,
    ).companyId;
    const range = dateRange(query, this.timezoneForUser(actor.id, companyId));
    const requests = this.repository.listRegularizations({
      companyIds: new Set([companyId]),
      userIds: new Set([actor.id]),
      status: query.status,
      dateFrom: range.from,
      dateTo: range.to,
    });
    return page(
      requests.map((request) => this.presentRegularization(request)),
      query.page,
      query.page_size,
    );
  }

  managerRegularizationQueue(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.manager_regularization_queue",
      query.company_id,
    ).companyId;
    if (
      !canSeeAllAttendance(actor) &&
      !this.hasVisibleSubordinates(actor, companyId)
    ) {
      throw forbidden(
        "Only managers, HR, Admin, or Auditor users can read attendance regularization queues.",
      );
    }
    const range = dateRange(query, this.timezoneForUser(actor.id, companyId));
    let visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
      query.manager_user_id,
    ).filter((user) => user.id !== actor.id);
    visibleUsers = filterAttendanceUsers(visibleUsers, query);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const geoSpecificFilter =
      Boolean(query.geo_outcome?.trim()) ||
      Boolean(query.review_type?.trim()) ||
      Boolean(query.reason_code?.trim());
    const scoped = geoSpecificFilter
      ? []
      : this.repository
          .listRegularizations({
            companyIds: new Set([companyId]),
            userIds: visibleUserIds,
            dateFrom: range.from,
            dateTo: range.to,
          })
          .filter(
            (request) =>
              canSeeAllAttendance(actor) ||
              request.current_approver_user_id === actor.id,
          );
    const status = query.status ?? AttendanceRegularizationStatuses.Pending;
    const filtered = scoped.filter(
      (request) => !status || request.status === status,
    );
    observeManagerRegularizationQueueAge(scoped);
    return {
      ...page(
        filtered.map((request) => this.presentRegularization(request)),
        query.page,
        query.page_size,
      ),
      queue_counts: this.regularizationQueueCounts(scoped),
    };
  }

  async submitGeoFallback(
    actor: AuthUser,
    decisionId: UUID,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.submit_geo_fallback",
    ).companyId;
    assertCanUseSelfAttendance(actor);
    const manager = this.core.resolveImmediateManager(actor.id);
    const approver =
      manager && this.isUserInCompany(manager.id, companyId)
        ? manager
        : this.adminFallback(companyId);
    if (this.store.kind !== "postgres") {
      throw conflict("Geo fallback submission requires command persistence.");
    }
    return new AttendanceCommandService(this.store).submitGeoFallback({
      actor,
      companyId,
      decisionId,
      idempotencyKey,
      timeZone: this.timezoneForUser(actor.id, companyId),
      currentApproverUserId: approver?.id ?? null,
      isWorkingDayFor: (workDate) => this.isWorkingDay(companyId, workDate),
    });
  }

  async managerGeoFallbackQueue(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.manager_geo_fallback_queue",
      query.company_id,
    ).companyId;
    if (
      !canSeeAllAttendance(actor) &&
      !actor.roles.includes(Roles.Reviewer)
    ) {
      throw forbidden(
        "Only managers, HR, Admin, or Auditor users can read attendance geo fallback queues.",
      );
    }
    const range = dateRange(query, this.timezoneForUser(actor.id, companyId));
    let visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
      query.manager_user_id,
    );
    visibleUsers = filterAttendanceUsers(visibleUsers, query);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const requestedStatus = query.status ?? "pending";
    let reviews: AttendanceGeoFallbackReview[];
    if (this.store.kind === "postgres" && this.store.pgPool) {
      const result = await this.store.pgPool.query<AttendanceGeoFallbackReview>(
        `SELECT id, company_id, employee_user_id, submitted_by_user_id,
            current_approver_user_id, original_command_id, original_decision_id,
            fallback_command_id, punch_event_id, event_type, work_date::text,
            occurred_at::text, reason_code, reason_detail, geo_policy, status,
            decision_remarks, decided_by_user_id, decided_at::text, version,
            created_at::text, updated_at::text, deleted_at::text
         FROM attendance.geo_fallback_reviews
         WHERE company_id = $1
           AND employee_user_id = ANY($2::uuid[])
           AND work_date BETWEEN $3::date AND $4::date
           AND deleted_at IS NULL
         ORDER BY created_at DESC, id`,
        [companyId, Array.from(visibleUserIds), range.from, range.to],
      );
      reviews = result.rows;
    } else {
      reviews = this.store.attendanceGeoFallbackReviews.filter(
        (review) =>
          review.company_id === companyId &&
          visibleUserIds.has(review.employee_user_id) &&
          review.work_date >= range.from &&
          review.work_date <= range.to &&
          !review.deleted_at,
      );
    }
    const scoped = reviews.filter(
      (review) =>
        canSeeAllAttendance(actor) ||
        review.current_approver_user_id === actor.id,
    );
    const workSiteLabels =
      this.store.kind === "postgres" && this.store.pgPool
        ? await this.geoFallbackWorkSiteLabels(companyId, scoped)
        : new Map<UUID, SafeGeoWorkSiteLabel>();
    const filtered = scoped.filter(
      (review) =>
        review.status === requestedStatus &&
        matchesGeoReviewFilter(review, query),
    );
    const exactLocationStates = await this.geoFallbackExactLocationAccessStates(
      actor,
      companyId,
      filtered,
    );
    return {
      ...page(
        filtered.map((review) =>
          this.presentGeoFallbackReview(
            review,
            workSiteLabels,
            exactLocationStates.get(review.id) ?? "unavailable",
          ),
        ),
        query.page,
        query.page_size,
      ),
      queue_counts: this.geoFallbackQueueCounts(
        scoped.filter((review) => matchesGeoReviewFilter(review, query)),
      ),
    };
  }

  async revealManagerGeoFallbackExactLocation(
    actor: AuthUser,
    id: UUID,
  ): Promise<ExactAttendanceLocationRevealResponse> {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.manager_geo_fallback_exact_location",
    ).companyId;
    if (!this.store.pgPool) {
      throw conflict("Exact attendance location requires location evidence persistence.");
    }

    const review = await this.findGeoFallbackReview(companyId, id);
    if (!review) {
      throw notFound("Geo fallback review was not found.");
    }
    this.assertCanAccessGeoFallbackReview(actor, companyId, review);
    assertCanViewExactAttendanceLocation(actor, this.store.rbacRolePermissions);

    const locationEvidenceId = await this.resolveGeoFallbackLocationEvidenceId(
      companyId,
      review.id,
    );
    if (!locationEvidenceId) {
      throw notFound("Exact coordinate evidence was not found for this review.");
    }

    const evidence = await new AttendanceLocationAccessAuditService(
      this.store.pgPool,
    ).withAuditedExactCoordinateView({
      companyId,
      actorUserId: actor.id,
      locationEvidenceId,
      reasonCode: "manager_review_exact_location",
      operationContext: "attendance.manager_geo_fallback.exact_location",
      metadata: {
        audit_scope: "exact_coordinate_view",
        request_scope: "geo_fallback_review",
        ui_surface: "manager_attendance_review",
        work_date: review.work_date,
      },
    });

    if (evidence.employeeUserId !== review.employee_user_id) {
      throw forbidden("Exact coordinate evidence does not belong to this attendance review.");
    }

    return {
      latitude: Number(evidence.latitude),
      longitude: Number(evidence.longitude),
      captured_at: evidence.capturedAt,
      accuracy_meters:
        evidence.accuracyMeters === null ? null : Number(evidence.accuracyMeters),
    };
  }

  async decideGeoFallback(
    actor: AuthUser,
    id: UUID,
    input: {
      decision: "approve" | "reject" | "return";
      remarks?: string;
      expected_version: number;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.decide_geo_fallback",
    ).companyId;
    if (this.store.kind === "postgres" && this.store.pgPool) {
      const client = await this.store.pgPool.connect();
      try {
        await client.query("BEGIN");
        const locked = (
          await client.query<AttendanceGeoFallbackReview>(
            `SELECT id, company_id, employee_user_id, submitted_by_user_id,
                current_approver_user_id, original_command_id, original_decision_id,
                fallback_command_id, punch_event_id, event_type, work_date::text,
                occurred_at::text, reason_code, reason_detail, geo_policy, status,
                decision_remarks, decided_by_user_id, decided_at::text, version,
                created_at::text, updated_at::text, deleted_at::text
             FROM attendance.geo_fallback_reviews
             WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
             FOR UPDATE`,
            [id, companyId],
          )
        ).rows[0];
        if (!locked) throw notFound("Geo fallback review was not found.");
        if (locked.version !== input.expected_version || locked.status !== "pending") {
          throw conflict("Only the expected pending geo fallback review can be decided.");
        }
        assertCanDecideRegularization(actor, locked);
        if ((input.decision === "reject" || input.decision === "return") && !input.remarks?.trim()) {
          throw missingRemarks(input.decision);
        }
        const previousStatus = locked.status;
        const nextStatus =
          input.decision === "approve"
            ? "approved"
            : input.decision === "return"
              ? "returned"
              : "rejected";
        const updated = (
          await client.query<AttendanceGeoFallbackReview>(
            `UPDATE attendance.geo_fallback_reviews
             SET status = $3,
                 decision_remarks = $4,
                 decided_by_user_id = $5,
                 decided_at = now(),
                 version = version + 1,
                 updated_at = now()
             WHERE id = $1 AND company_id = $2
             RETURNING id, company_id, employee_user_id, submitted_by_user_id,
                current_approver_user_id, original_command_id, original_decision_id,
                fallback_command_id, punch_event_id, event_type, work_date::text,
                occurred_at::text, reason_code, reason_detail, geo_policy, status,
                decision_remarks, decided_by_user_id, decided_at::text, version,
                created_at::text, updated_at::text, deleted_at::text`,
            [id, companyId, nextStatus, input.remarks?.trim() || null, actor.id],
          )
        ).rows[0]!;
        if (input.decision === "reject") {
          await this.applyRejectedGeoFallbackCorrectionPostgres(
            client,
            updated,
            actor.id,
          );
        }
        const event = buildGeoFallbackDecisionEvent({
          companyId,
          actorUserId: actor.id,
          subjectEmployeeUserId: updated.employee_user_id,
          fallbackReviewId: updated.id,
          originalDecisionId: updated.original_decision_id,
          punchEventId: updated.punch_event_id!,
          workDate: updated.work_date,
          decision: input.decision,
          previousStatus,
          nextStatus,
          version: updated.version,
          decidedAt: updated.decided_at!,
        });
        await client.query(
          `INSERT INTO platform.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
           VALUES ('attendance',$1,$2,$3::jsonb,$4)`,
          [
            event.aggregateId,
            event.eventType,
            JSON.stringify(event.payload),
            event.idempotencyKey,
          ],
        );
        await client.query("COMMIT");
        return this.presentGeoFallbackReview(updated);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    const review = this.store.attendanceGeoFallbackReviews.find(
      (candidate) =>
        candidate.id === id &&
        candidate.company_id === companyId &&
        !candidate.deleted_at,
    );
    if (!review) throw notFound("Geo fallback review was not found.");
    if (review.version !== input.expected_version || review.status !== "pending") {
      throw conflict("Only the expected pending geo fallback review can be decided.");
    }
    assertCanDecideRegularization(actor, review);
    if ((input.decision === "reject" || input.decision === "return") && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    review.status =
      input.decision === "approve"
        ? "approved"
        : input.decision === "return"
          ? "returned"
          : "rejected";
    review.decision_remarks = input.remarks?.trim() || null;
    review.decided_by_user_id = actor.id;
    review.decided_at = nowIso();
    review.version += 1;
    review.updated_at = nowIso();
    if (input.decision === "reject") {
      this.applyRejectedGeoFallbackCorrectionInMemory(review, actor.id);
    }
    return this.presentGeoFallbackReview(review);
  }

  private async applyRejectedGeoFallbackCorrectionPostgres(
    client: PoolClient,
    review: AttendanceGeoFallbackReview,
    actorUserId: UUID,
  ): Promise<void> {
    if (!review.punch_event_id || !review.decided_at) return;
    await acquirePayrollAttendancePeriodLock(client, review.company_id);
    const punch = (
      await client.query<GeoFallbackPunchRow>(
        `SELECT id, session_id, event_type, occurred_at, work_mode
           FROM attendance.punch_events
          WHERE id = $1
            AND company_id = $2
            AND employee_user_id = $3
            AND deleted_at IS NULL
          FOR UPDATE`,
        [review.punch_event_id, review.company_id, review.employee_user_id],
      )
    ).rows[0];
    if (!punch) {
      throw conflict("Geo fallback punch is unavailable for rejection correction.");
    }
    if (
      punch.event_type !== AttendancePunchEventTypes.CheckIn &&
      punch.event_type !== AttendancePunchEventTypes.CheckOut
    ) {
      throw conflict("Geo fallback punch type cannot be corrected by review rejection.");
    }
    const existingCorrection = (
      await client.query<{ id: UUID }>(
        `SELECT id
           FROM attendance.regularization_correction_applications
          WHERE company_id = $1 AND target_punch_event_id = $2
          FOR UPDATE`,
        [review.company_id, punch.id],
      )
    ).rows[0];
    if (!existingCorrection) {
      await this.createGeoFallbackVoidCorrectionPostgres(
        client,
        review,
        punch.id,
        actorUserId,
      );
    }
    if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
      if (punch.session_id) {
        await client.query(
          `UPDATE attendance.sessions
              SET deleted_at = COALESCE(deleted_at, transaction_timestamp()),
                  updated_at = transaction_timestamp(),
                  version = version + 1
            WHERE id = $1
              AND company_id = $2
              AND employee_user_id = $3
              AND deleted_at IS NULL`,
          [punch.session_id, review.company_id, review.employee_user_id],
        );
      }
    } else if (punch.session_id) {
      const reopened = await client.query(
        `UPDATE attendance.sessions session
            SET status = 'working',
                closed_at = NULL,
                last_transition_at = COALESCE((
                  SELECT max(segment.ended_at)
                    FROM attendance.break_segments segment
                   WHERE segment.company_id = session.company_id
                     AND segment.session_id = session.id
                     AND segment.ended_at IS NOT NULL
                ), session.checked_in_at),
                updated_at = transaction_timestamp(),
                version = version + 1
          WHERE session.id = $1
            AND session.company_id = $2
            AND session.employee_user_id = $3
            AND session.deleted_at IS NULL`,
        [punch.session_id, review.company_id, review.employee_user_id],
      );
      if ((reopened.rowCount ?? 0) === 0) {
        throw conflict("Geo fallback checkout session could not be restored.");
      }
    }
    await this.rebuildEmployeeCommandStatePostgres(
      client,
      review.company_id,
      review.employee_user_id,
    );
    const tx = new AttendanceCommandTransactionRepository(client);
    const projectionPolicy = await resolveEffectiveAttendancePolicy(tx, {
      companyId: review.company_id,
      subjectEmployeeUserId: review.employee_user_id,
      asOf: review.decided_at,
    });
    await projectCommandDay(
      tx,
      review.company_id,
      review.employee_user_id,
      review.work_date,
      punch.work_mode,
      projectionPolicy.graceMinutes,
      this.timezoneForUser(
        review.employee_user_id,
        review.company_id,
      ),
      review.decided_at,
    );
  }

  private async createGeoFallbackVoidCorrectionPostgres(
    client: PoolClient,
    review: AttendanceGeoFallbackReview,
    punchEventId: UUID,
    actorUserId: UUID,
  ): Promise<void> {
    const reason = `Geo fallback rejected (${review.id})`;
    const request = (
      await client.query<{ id: UUID }>(
        `INSERT INTO attendance.regularization_requests (
            company_id, employee_user_id, submitted_by_user_id, work_date,
            reason, requested_punches, status, current_approver_user_id,
            decision_remarks, decided_by_user_id, decided_at, version,
            created_at, updated_at, deleted_at
          )
          VALUES ($1,$2,$3,$4::date,$5,'[]'::jsonb,'approved',NULL,$6,$7,$8,2,transaction_timestamp(),transaction_timestamp(),NULL)
          RETURNING id`,
        [
          review.company_id,
          review.employee_user_id,
          review.submitted_by_user_id,
          review.work_date,
          reason,
          review.decision_remarks,
          actorUserId,
          review.decided_at,
        ],
      )
    ).rows[0];
    if (!request) throw new Error("Geo fallback correction request was not created.");
    const item = (
      await client.query<{ id: UUID }>(
        `INSERT INTO attendance.regularization_request_items (
            company_id, regularization_request_id, ordinal, operation,
            target_punch_event_id, event_type, occurred_at
          )
          VALUES ($1,$2,0,'void',$3,NULL,NULL)
          RETURNING id`,
        [review.company_id, request.id, punchEventId],
      )
    ).rows[0];
    if (!item) throw new Error("Geo fallback correction item was not created.");
    await client.query(
      `INSERT INTO attendance.regularization_actions (
          company_id, regularization_request_id, actor_user_id,
          subject_employee_user_id, action_kind, previous_state,
          resulting_state, remarks, resulting_version, occurred_at,
          migration_reconstructed
        )
        VALUES ($1,$2,$3,$4,'submitted',NULL,'pending',$5,1,$6,false)`,
      [
        review.company_id,
        request.id,
        review.submitted_by_user_id,
        review.employee_user_id,
        reason,
        review.created_at,
      ],
    );
    const action = (
      await client.query<{ id: UUID }>(
        `INSERT INTO attendance.regularization_actions (
            company_id, regularization_request_id, actor_user_id,
            subject_employee_user_id, action_kind, previous_state,
            resulting_state, remarks, resulting_version, occurred_at,
            migration_reconstructed
          )
          VALUES ($1,$2,$3,$4,'approved','pending','approved',$5,2,$6,false)
          RETURNING id`,
        [
          review.company_id,
          request.id,
          actorUserId,
          review.employee_user_id,
          review.decision_remarks,
          review.decided_at,
        ],
      )
    ).rows[0];
    if (!action) throw new Error("Geo fallback correction action was not created.");
    await client.query(
      `INSERT INTO attendance.regularization_correction_applications (
          company_id, regularization_request_id, regularization_request_item_id,
          regularization_action_id, operation, target_punch_event_id,
          replacement_punch_event_id, attendance_event_id, applied_by_user_id,
          applied_at
        )
        VALUES ($1,$2,$3,$4,'void',$5,NULL,NULL,$6,$7)`,
      [
        review.company_id,
        request.id,
        item.id,
        action.id,
        punchEventId,
        actorUserId,
        review.decided_at,
      ],
    );
  }

  private async rebuildEmployeeCommandStatePostgres(
    client: PoolClient,
    companyId: UUID,
    employeeUserId: UUID,
  ): Promise<void> {
    const open = (
      await client.query<GeoFallbackSessionStateRow>(
        `SELECT id, status, checked_in_at, closed_at
           FROM attendance.sessions
          WHERE company_id = $1
            AND employee_user_id = $2
            AND closed_at IS NULL
            AND deleted_at IS NULL
          ORDER BY checked_in_at DESC, id DESC
          LIMIT 1
          FOR UPDATE`,
        [companyId, employeeUserId],
      )
    ).rows[0];
    const completed = open
      ? null
      : (
          await client.query<GeoFallbackSessionStateRow>(
            `SELECT id, status, checked_in_at, closed_at
               FROM attendance.sessions
              WHERE company_id = $1
                AND employee_user_id = $2
                AND closed_at IS NOT NULL
                AND deleted_at IS NULL
              ORDER BY closed_at DESC, id DESC
              LIMIT 1
              FOR UPDATE`,
            [companyId, employeeUserId],
          )
        ).rows[0];
    const nextState = open
      ? open.status === "on_break"
        ? "on_break"
        : "working"
      : completed
        ? "completed"
        : "not_checked_in";
    const currentSessionId = open?.id ?? completed?.id ?? null;
    await client.query(
      `UPDATE attendance.employee_command_states
          SET state = $3,
              current_session_id = $4,
              version = version + 1,
              updated_at = transaction_timestamp()
        WHERE company_id = $1 AND employee_user_id = $2`,
      [companyId, employeeUserId, nextState, currentSessionId],
    );
  }

  private applyRejectedGeoFallbackCorrectionInMemory(
    review: AttendanceGeoFallbackReview,
    actorUserId: UUID,
  ): void {
    if (!review.punch_event_id || !review.decided_at) return;
    if (this.store.attendanceRegularizationCorrectionApplications.some(
      (application) =>
        application.company_id === review.company_id &&
        application.target_punch_event_id === review.punch_event_id,
    )) {
      return;
    }
    const request: AttendanceRegularizationRequest = {
      id: randomUUID(),
      company_id: review.company_id,
      employee_user_id: review.employee_user_id,
      submitted_by_user_id: review.submitted_by_user_id,
      work_date: review.work_date,
      reason: `Geo fallback rejected (${review.id})`,
      requested_punches: [],
      items: [],
      status: AttendanceRegularizationStatuses.Approved,
      current_approver_user_id: null,
      decision_remarks: review.decision_remarks,
      decided_by_user_id: actorUserId,
      decided_at: review.decided_at,
      version: 2,
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
    };
    const item: AttendanceRegularizationRequestItem = {
      id: randomUUID(),
      company_id: review.company_id,
      regularization_request_id: request.id,
      ordinal: 0,
      operation: "void",
      target_punch_event_id: review.punch_event_id,
      event_type: null,
      occurred_at: null,
      created_at: review.decided_at,
    };
    request.items = [item];
    this.store.attendanceRegularizations.push(request);
    const submittedActionId = randomUUID();
    this.store.attendanceRegularizationActions.push({
      id: submittedActionId,
      company_id: review.company_id,
      regularization_request_id: request.id,
      actor_user_id: review.submitted_by_user_id,
      subject_employee_user_id: review.employee_user_id,
      action_kind: "submitted",
      previous_state: null,
      resulting_state: AttendanceRegularizationStatuses.Pending,
      remarks: request.reason,
      resulting_version: 1,
      occurred_at: request.created_at,
      migration_reconstructed: false,
    });
    const approvedActionId = randomUUID();
    this.store.attendanceRegularizationActions.push({
      id: approvedActionId,
      company_id: review.company_id,
      regularization_request_id: request.id,
      actor_user_id: actorUserId,
      subject_employee_user_id: review.employee_user_id,
      action_kind: "approved",
      previous_state: AttendanceRegularizationStatuses.Pending,
      resulting_state: AttendanceRegularizationStatuses.Approved,
      remarks: review.decision_remarks,
      resulting_version: 2,
      occurred_at: review.decided_at,
      migration_reconstructed: false,
    });
    this.repository.addRegularizationCorrectionApplication({
      company_id: review.company_id,
      regularization_request_id: request.id,
      regularization_request_item_id: item.id,
      regularization_action_id: approvedActionId,
      operation: "void",
      target_punch_event_id: review.punch_event_id,
      replacement_punch_event_id: null,
      attendance_event_id: null,
      applied_by_user_id: actorUserId,
      applied_at: review.decided_at,
    });
    this.recomputeDay(
      review.company_id,
      review.employee_user_id,
      review.work_date,
      this.timezoneForUser(review.employee_user_id, review.company_id),
    );
  }

  exceptions(actor: AuthUser, query: AttendancePageQuery) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.exceptions",
      query.company_id,
    ).companyId;
    return this.exceptionsForCompany(actor, query, companyId);
  }

  private exceptionsForCompany(
    actor: AuthUser,
    query: AttendancePageQuery,
    companyId: UUID,
  ) {
    const actorTimeZone = this.timezoneForUser(actor.id, companyId);
    const range = {
      from: query.date_from ?? todayDate(actorTimeZone).slice(0, 7) + "-01",
      to: query.date_to ?? todayDate(actorTimeZone),
    };
    const visibleUsers = this.visibleUsers(
      actor,
      companyId,
      query.department_id,
      query.manager_user_id,
    );
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const regularizations = this.repository.listRegularizations({
      companyIds: new Set([companyId]),
      userIds: visibleUserIds,
      status: AttendanceRegularizationStatuses.Pending,
      dateFrom: range.from,
      dateTo: range.to,
    });
    const regularizationByUserDate = new Map(
      regularizations.map((request) => [
        `${request.employee_user_id}:${request.work_date}`,
        request,
      ]),
    );
    for (const user of visibleUsers) {
      const timeZone = this.timezoneForUser(user.id, companyId);
      for (const date of datesInclusive(range.from, range.to)) {
        this.resolveDay(companyId, user.id, date, timeZone);
      }
    }
    const dayExceptions = this.repository
      .listDayRecords({
        companyIds: new Set([companyId]),
        userIds: visibleUserIds,
        dateFrom: range.from,
        dateTo: range.to,
      })
      .filter(
        (record) =>
          record.exception_type ||
          record.regularization_status ===
            AttendanceRegularizationStatuses.Pending,
      )
      .map((record) =>
        this.presentException(
          record,
          regularizationByUserDate.get(
            `${record.employee_user_id}:${record.work_date}`,
          ),
          actor,
        ),
      );
    const requestExceptions = regularizations
      .filter(
        (request) =>
          !dayExceptions.some(
            (exception) => exception.request_id === request.id,
          ),
      )
      .map((request) =>
        this.presentException(
          this.resolveDay(
            companyId,
            request.employee_user_id,
            request.work_date,
          ),
          request,
          actor,
        ),
      );
    const items = [...dayExceptions, ...requestExceptions]
      .filter(
        (exception) =>
          !query.exception_type ||
          exception.exception_type === query.exception_type,
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const result = page(items, query.page, query.page_size);
    return {
      ...result,
      totals: {
        late: items.filter((item) => item.exception_type === "late").length,
        missing_punch: items.filter(
          (item) => item.exception_type === "missing_punch",
        ).length,
        absent: items.filter((item) => item.exception_type === "absent").length,
        correction: items.filter((item) => item.exception_type === "correction")
          .length,
      },
    };
  }

  decideRegularization(
    actor: AuthUser,
    id: UUID,
    input: {
      decision: "approve" | "reject" | "return";
      remarks?: string;
      expected_version: number;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.decide_regularization",
    ).companyId;
    const current = this.repository.findRegularization(
      id,
      new Set([companyId]),
    );
    this.assertTargetUserInCompany(current.employee_user_id, companyId, {
      operation: "attendance.decide_regularization.target_employee",
      requireActiveEmployment: false,
    });
    if (current.version !== input.expected_version) {
      throw conflict(
        "Attendance regularization request was modified by another actor.",
        {
          aggregate: "attendance_regularization",
          id,
        },
      );
    }
    assertCanDecideRegularization(actor, current);
    if (
      ["reject", "return"].includes(input.decision) &&
      !input.remarks?.trim()
    ) {
      throw missingRemarks(input.decision);
    }
    const previousStatus = current.status;
    if (previousStatus !== AttendanceRegularizationStatuses.Pending) {
      throw conflict(
        "Only pending attendance regularization requests can be decided.",
        {
          request_id: id,
          status: previousStatus,
        },
      );
    }
    const nextStatus =
      input.decision === "approve"
        ? AttendanceRegularizationStatuses.Approved
        : input.decision === "reject"
          ? AttendanceRegularizationStatuses.Rejected
          : AttendanceRegularizationStatuses.Returned;
    this.validateRegularizationItems(
      companyId,
      current.employee_user_id,
      current.work_date,
      this.timezoneForUser(current.employee_user_id, companyId),
      current.items,
    );
    const request = this.repository.updateRegularizationVersioned(
      id,
      new Set([companyId]),
      input.expected_version,
      (candidate) => {
        candidate.status = nextStatus;
        candidate.current_approver_user_id = null;
        candidate.decision_remarks = input.remarks?.trim() ?? null;
        candidate.decided_by_user_id = actor.id;
        candidate.decided_at = nowIso();
      },
    );
    const action = this.repository.appendRegularizationAction({
      company_id: companyId,
      regularization_request_id: request.id,
      actor_user_id: actor.id,
      subject_employee_user_id: request.employee_user_id,
      action_kind: nextStatus,
      previous_state: previousStatus,
      resulting_state: nextStatus,
      remarks: request.decision_remarks,
      resulting_version: request.version,
      occurred_at: request.decided_at!,
      migration_reconstructed: false,
    });
    if (input.decision === "approve") {
      this.applyApprovedRegularizationItems(request, action.id, actor);
    }
    const requestTimeZone = this.timezoneForUser(
      request.employee_user_id,
      companyId,
    );
    const day = this.resolveDay(
      companyId,
      request.employee_user_id,
      request.work_date,
      requestTimeZone,
    );
    day.regularization_status = nextStatus;
    const decidedApproval = mergeAttendanceApprovals(
      [{ kind: AttendanceApprovalKinds.Regularization, state: nextStatus }],
      day.approval_kind === AttendanceApprovalKinds.Regularization
        ? null
        : day,
    );
    day.approval_kind = decidedApproval.approvalKind;
    day.approval_state = decidedApproval.approvalState;
    if (
      nextStatus === AttendanceRegularizationStatuses.Approved &&
      day.exception_type
    ) {
      day.exception_type = null;
      day.note = "Regularized";
    }
    day.status = deriveLegacyAttendanceStatus({
      dayClassification: day.day_classification,
      presenceState: day.presence_state,
      punctualityState: day.punctuality_state,
      approvalKind: day.approval_kind,
      approvalState: day.approval_state,
      workMode: day.work_mode,
    });
    day.updated_at = nowIso();
    day.version += 1;
    appendAttendanceOutboxEvent(
      this.store,
      buildRegularizationDecisionEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId: request.employee_user_id,
        regularizationRequestId: request.id,
        workDate: request.work_date,
        decision: input.decision,
        previousStatus,
        nextStatus,
        version: request.version,
        decidedAt: request.decided_at!,
      }),
    );
    return {
      ...this.presentRegularization(request),
      previous_status: previousStatus,
      next_status: nextStatus,
      day_status: this.presentDay(day, requestTimeZone),
    };
  }

  async decideRegularizationPostgres(
    actor: AuthUser,
    id: UUID,
    input: {
      decision: "approve" | "reject" | "return";
      remarks?: string;
      expected_version: number;
    },
  ) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.decide_regularization",
    ).companyId;
    const current = this.repository.findRegularization(id, new Set([companyId]));
    this.assertTargetUserInCompany(current.employee_user_id, companyId, {
      operation: "attendance.decide_regularization.target_employee",
      requireActiveEmployment: false,
    });
    if (current.version !== input.expected_version) {
      throw conflict("Attendance regularization request was modified by another actor.", {
        aggregate: "attendance_regularization",
        id,
      });
    }
    if (current.status !== AttendanceRegularizationStatuses.Pending) {
      throw conflict("Only pending attendance regularization requests can be decided.", {
        request_id: id,
        status: current.status,
      });
    }
    if (["reject", "return"].includes(input.decision) && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    const timeZone = this.timezoneForUser(current.employee_user_id, companyId);
    const result = await new AttendanceCommandService(this.store).decideRegularization({
      actor,
      companyId,
      regularizationRequestId: current.id,
      employeeUserId: current.employee_user_id,
      workDate: current.work_date,
      expectedVersion: input.expected_version,
      reason: current.reason,
      remarks: input.remarks?.trim() ?? null,
      decision: input.decision,
      timeZone,
      // Re-evaluate authorization against the row locked inside the mutation
      // transaction, so approver changes cannot race the decision side effects.
      authorize: (locked) => assertCanDecideRegularization(actor, {
        employee_user_id: locked.employee_user_id,
        current_approver_user_id: locked.current_approver_user_id,
      }),
    });
    const nextStatus = input.decision === "approve"
      ? AttendanceRegularizationStatuses.Approved
      : input.decision === "reject"
        ? AttendanceRegularizationStatuses.Rejected
        : AttendanceRegularizationStatuses.Returned;
    current.status = nextStatus;
    current.current_approver_user_id = null;
    current.decision_remarks = input.remarks?.trim() ?? null;
    current.decided_by_user_id = actor.id;
    current.decided_at = result.decidedAt;
    current.version = result.version;
    current.updated_at = result.decidedAt;
    for (const applied of result.applications) {
      if (!this.store.attendanceRegularizationCorrectionApplications.some(
        (application) => application.id === applied.id,
      )) {
        this.store.attendanceRegularizationCorrectionApplications.push({
          id: applied.id,
          company_id: companyId,
          regularization_request_id: current.id,
          regularization_request_item_id: applied.regularization_request_item_id,
          regularization_action_id: applied.regularization_action_id,
          operation: applied.operation,
          target_punch_event_id: applied.target_punch_event_id,
          replacement_punch_event_id: applied.replacement_punch_event_id,
          attendance_event_id: applied.attendance_event_id,
          applied_by_user_id: actor.id,
          applied_at: applied.applied_at,
        });
      }
      if (applied.replacement_punch && applied.replacement_punch_event_id &&
          !this.store.attendancePunches.some((punch) => punch.id === applied.replacement_punch_event_id)) {
        this.store.attendancePunches.push({
          id: applied.replacement_punch_event_id,
          company_id: companyId,
          employee_user_id: current.employee_user_id,
          actor_user_id: actor.id,
          event_type: applied.replacement_punch.event_type as AttendancePunchEventType,
          occurred_at: applied.replacement_punch.occurred_at as string,
          work_mode: "office",
          source: "admin",
          origin: "approved_regularization",
          regularization_request_id: current.id,
          metadata: {
            regularization_request_item_id: applied.regularization_request_item_id,
            correction_operation: applied.operation,
            target_punch_event_id: applied.target_punch_event_id,
          },
          created_at: result.decidedAt,
          deleted_at: null,
        });
      }
    }
    const projectedDay = result.day as unknown as AttendanceDayRecord;
    const storedDay = this.repository.dayRecord(companyId, current.employee_user_id, current.work_date);
    if (storedDay) {
      Object.assign(storedDay, projectedDay);
    } else {
      this.store.attendanceDayRecords.push(projectedDay);
    }
    return {
      ...this.presentRegularization(current),
      previous_status: AttendanceRegularizationStatuses.Pending,
      next_status: nextStatus,
      day_status: this.presentDay(projectedDay, timeZone),
    };
  }

  async createExportJob(actor: AuthUser, input: AttendanceExportInput) {
    const companyId = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.create_export",
      input.company_id,
    ).companyId;
    if (!canSeeAllAttendance(actor)) {
      throw forbidden(
        "Only HR, Admin, or Auditor users can export attendance data.",
      );
    }
    for (const userId of [
      input.filters?.user_id,
      input.filters?.employee_user_id,
    ]) {
      if (userId) {
        const user = this.requireUser(userId);
        this.assertTargetUserInCompany(user.id, companyId, {
          operation: "attendance.create_export.target_employee",
          requireActiveEmployment: false,
        });
      }
    }
    const jobId = randomUUID();
    const format = input.format ?? "csv";
    const columns = input.columns?.length
      ? input.columns
      : [
          "employee_code",
          "employee",
          "date",
          "status",
          "reporting_evidence_category",
          "in_time",
          "out_time",
          "hours",
        ];
    const filters = input.filters ?? {};
    const createdAt = nowIso();
    const rows = this.exportRows(companyId, filters);
    const generated = await createGeneratedExportDocument(this.store, {
      actor,
      businessObjectType: "attendance_export",
      businessObjectId: jobId,
      reportType: "attendance",
      format: format as GeneratedExportFormat,
      rows,
      columns,
      filters,
      filePrefix: "attendance-export",
    });
    appendAttendanceOutboxEvent(
      this.store,
      buildExportRequestedEvent({
        companyId,
        actorUserId: actor.id,
        exportJobId: jobId,
        format,
        status: generated.status,
      }),
    );
    return {
      job_id: jobId,
      status: generated.status,
      format,
      filters: { ...filters, company_id: companyId },
      columns,
      requested_by_user_id: actor.id,
      created_at: createdAt,
      adapter: generated.adapter,
      download_document_id: generated.download_document_id,
      download_url: generated.download_url,
      file_name: generated.file_name,
      row_count: generated.row_count,
      size_bytes: generated.size_bytes,
      generated_at: generated.generated_at,
    };
  }

  private exportRows(
    companyId: UUID,
    filters: NonNullable<AttendanceExportInput["filters"]>,
  ): Array<Record<string, unknown>> {
    return this.store.attendanceDayRecords
      .filter((record) => record.company_id === companyId && !record.deleted_at)
      .filter(
        (record) =>
          !textFilter(filters.user_id) ||
          record.employee_user_id === textFilter(filters.user_id),
      )
      .filter(
        (record) =>
          !textFilter(filters.employee_user_id) ||
          record.employee_user_id === textFilter(filters.employee_user_id),
      )
      .filter(
        (record) =>
          !textFilter(filters.status) ||
          matchesLegacyAttendanceStatus(record, textFilter(filters.status)!),
      )
      .filter((record) => {
        const requestedCategory =
          textFilter(filters.reporting_evidence_category) ??
          textFilter(filters.evidence_category);
        return (
          !requestedCategory ||
          this.reportingEvidenceCategory(record) === requestedCategory
        );
      })
      .filter(
        (record) =>
          !textFilter(filters.date_from) ||
          record.work_date >= textFilter(filters.date_from)!,
      )
      .filter(
        (record) =>
          !textFilter(filters.date_to) ||
          record.work_date <= textFilter(filters.date_to)!,
      )
      .filter((record) => {
        const user = this.store.users.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        return (
          !textFilter(filters.department_id) ||
          user?.department_id === textFilter(filters.department_id)
        );
      })
      .filter((record) => {
        const managerId = textFilter(filters.manager_user_id);
        if (!managerId) return true;
        const user = this.store.users.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        const manager = this.store.users.find(
          (candidate) => candidate.id === managerId && !candidate.deleted_at,
        );
        return Boolean(
          user &&
            manager &&
            (user.id === manager.id ||
              user.hierarchy_path.startsWith(`${manager.hierarchy_path}.`)),
        );
      })
      .sort((left, right) => right.work_date.localeCompare(left.work_date))
      .map((record) => {
        const user = this.store.users.find(
          (candidate) => candidate.id === record.employee_user_id,
        );
        const department = user
          ? this.store.departments.find(
              (candidate) => candidate.id === user.department_id,
            )
          : null;
        const timeZone = this.timezoneForUser(
          record.employee_user_id,
          companyId,
        );
        return {
          id: record.id,
          employee_user_id: record.employee_user_id,
          employee_code: user?.employee_code ?? "",
          employee: user?.full_name ?? record.employee_user_id,
          department: department?.name ?? "",
          date: record.work_date,
          work_date: record.work_date,
          status: record.status,
          reporting_evidence_category:
            this.reportingEvidenceCategory(record) ?? "",
          day_classification: record.day_classification,
          presence_state: record.presence_state,
          punctuality_state: record.punctuality_state,
          evidence_state: record.evidence_state,
          approval_kind: record.approval_kind,
          approval_state: record.approval_state,
          payroll_state: record.payroll_state,
          in_time: timeText(record.first_check_in, timeZone) ?? "",
          out_time: timeText(record.last_check_out, timeZone) ?? "",
          hours: Math.round((record.work_seconds / 3600) * 100) / 100,
          work_seconds: record.work_seconds,
          break_seconds: record.break_seconds,
          scheduled_seconds: record.scheduled_seconds,
          late_seconds: record.late_seconds,
          early_departure_seconds: record.early_departure_seconds,
          late_minutes: record.late_minutes,
          early_out_minutes: record.early_out_minutes,
          work_mode: record.work_mode ?? "",
          exception_type: record.exception_type ?? "",
          note: record.note ?? "",
        };
      });
  }

  private nextAllowedActions(
    punches: AttendancePunch[],
  ): AttendancePunchEventType[] {
    const active = punches
      .filter((punch) => !punch.deleted_at)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const last = active.at(-1);
    if (!last) {
      return [AttendancePunchEventTypes.CheckIn];
    }
    if (
      last.event_type === AttendancePunchEventTypes.CheckIn ||
      last.event_type === AttendancePunchEventTypes.BreakEnd
    ) {
      return [
        AttendancePunchEventTypes.BreakStart,
        AttendancePunchEventTypes.CheckOut,
      ];
    }
    if (last.event_type === AttendancePunchEventTypes.BreakStart) {
      return [AttendancePunchEventTypes.BreakEnd];
    }
    return [];
  }

  private punchAvailability(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
    occurredAt = nowIso(),
  ): PunchAvailability {
    const punches = this.punchesForWorkDate(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
    const sequenceAllowedActions = this.nextAllowedActions(punches);
    const policy = this.attendancePolicy(companyId);
    const activePunches = punches.filter((punch) => !punch.deleted_at);
    const localTime =
      timeText(occurredAt, timeZone) ?? occurredAt.slice(11, 16);
    const isCompanyWorkingDay = this.isWorkingDay(companyId, workDate);
    const blockedActionReasons: Partial<
      Record<AttendancePunchEventType, string>
    > = {};
    const nextAllowedActions: AttendancePunchEventType[] = [];

    for (const action of sequenceAllowedActions) {
      const blockedReason = this.punchActionBlockedReason(action, policy, {
        activePunches: activePunches.length,
        isCompanyWorkingDay,
        localTime,
      });
      if (blockedReason) {
        blockedActionReasons[action] = blockedReason;
      } else {
        nextAllowedActions.push(action);
      }
    }

    return {
      policy,
      sequence_allowed_actions: sequenceAllowedActions,
      next_allowed_actions: nextAllowedActions,
      blocked_action_reasons: blockedActionReasons,
      blocked_reason:
        nextAllowedActions.length === 0
          ? (Object.values(blockedActionReasons)[0] ?? null)
          : null,
      local_time: localTime,
      is_company_working_day: isCompanyWorkingDay,
    };
  }

  private punchActionBlockedReason(
    action: AttendancePunchEventType,
    policy: AttendancePunchPolicy,
    context: {
      activePunches: number;
      isCompanyWorkingDay: boolean;
      localTime: string;
    },
  ): string | null {
    if (
      action === AttendancePunchEventTypes.CheckIn &&
      !policy.allowOffDayPunches &&
      !context.isCompanyWorkingDay &&
      context.activePunches === 0
    ) {
      return "Punch-in is not allowed on company off days.";
    }
    if (policy.fullDayPunchWindow) {
      return null;
    }
    if (
      action === AttendancePunchEventTypes.CheckIn &&
      !withinClockWindow(
        context.localTime,
        policy.punchInStart,
        policy.punchInEnd,
      )
    ) {
      return (
        "Punch-in is allowed between " +
        policy.punchInStart +
        " and " +
        policy.punchInEnd +
        "."
      );
    }
    if (
      action === AttendancePunchEventTypes.CheckOut &&
      !withinClockWindow(
        context.localTime,
        policy.punchOutStart,
        policy.punchOutEnd,
      )
    ) {
      return (
        "Punch-out is allowed between " +
        policy.punchOutStart +
        " and " +
        policy.punchOutEnd +
        "."
      );
    }
    return null;
  }

  private presentPunchPolicy(
    availability: PunchAvailability,
  ): Record<string, unknown> {
    return {
      punch_window_mode: availability.policy.fullDayPunchWindow
        ? "full_day"
        : "restricted",
      full_day_punch_window: availability.policy.fullDayPunchWindow,
      punch_in_start: availability.policy.punchInStart,
      punch_in_end: availability.policy.punchInEnd,
      punch_out_start: availability.policy.punchOutStart,
      punch_out_end: availability.policy.punchOutEnd,
      auto_punch_out_enabled: availability.policy.autoPunchOutEnabled,
      auto_punch_out_time: availability.policy.autoPunchOutTime,
      allow_off_day_punches: availability.policy.allowOffDayPunches,
      attendance_mode: availability.policy.attendanceMode,
      fallback_approval_mode: availability.policy.fallbackApprovalMode,
      regularization_mode: availability.policy.regularizationMode,
      location_unavailable_action: availability.policy.locationUnavailableAction,
      permission_denied_action: availability.policy.permissionDeniedAction,
      outside_fence_action: availability.policy.outsideFenceAction,
      boundary_uncertain_action: availability.policy.boundaryUncertainAction,
      stale_evidence_action: availability.policy.staleEvidenceAction,
      accuracy_exceeded_action: availability.policy.accuracyExceededAction,
      effective_geofence_id: availability.policy.effectiveGeofenceId,
      effective_geofence_ids: availability.policy.effectiveGeofenceIds,
      geofence_grace_meters: availability.policy.geofenceGraceMeters,
      max_location_age_ms: availability.policy.maxLocationAgeMs,
      max_accuracy_meters: availability.policy.maxAccuracyMeters,
      is_company_working_day: availability.is_company_working_day,
      local_time: availability.local_time,
      can_punch_now: availability.next_allowed_actions.length > 0,
      blocked_reason: availability.blocked_reason,
      blocked_action_reasons: availability.blocked_action_reasons,
    };
  }

  private autoPunchOutCutoffIso(
    workDate: string,
    firstCheckInAt: string,
    policy: AttendancePunchPolicy,
    timeZone: string,
  ): string {
    const [hourText, minuteText] = policy.autoPunchOutTime.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const sameDayCutoff = zonedClockIso(workDate, hour, minute, timeZone);
    if (Date.parse(sameDayCutoff) > Date.parse(firstCheckInAt)) {
      return sameDayCutoff;
    }
    return zonedClockIso(addDays(workDate, 1), hour, minute, timeZone);
  }

  private addAutoPunchOutIfExpired(input: {
    companyId: UUID;
    employeeUserId: UUID;
    workDate: string;
    firstCheckIn: AttendancePunch;
    lastOpenPunch: AttendancePunch;
    timeZone: string;
    referenceIso: string;
    policy: AttendancePunchPolicy;
    trigger: "api" | "worker";
  }): AttendanceAutoPunchOutClosure | null {
    const cutoffIso = this.autoPunchOutCutoffIso(
      input.workDate,
      input.firstCheckIn.occurred_at,
      input.policy,
      input.timeZone,
    );
    if (Date.parse(cutoffIso) > Date.parse(input.referenceIso)) {
      return null;
    }
    const closeAt =
      Date.parse(input.lastOpenPunch.occurred_at) > Date.parse(cutoffIso)
        ? input.lastOpenPunch.occurred_at
        : cutoffIso;
    const metadata = {
      auto_punch_out: true,
      auto_punch_out_time: input.policy.autoPunchOutTime,
      auto_punch_out_reason: "Configured attendance day-end cutoff",
      auto_punch_out_trigger: input.trigger,
    };
    const createdPunches: AttendancePunch[] = [];

    if (
      input.lastOpenPunch.event_type === AttendancePunchEventTypes.BreakStart
    ) {
      createdPunches.push(
        this.repository.addPunch({
          company_id: input.companyId,
          employee_user_id: input.employeeUserId,
          actor_user_id: input.employeeUserId,
          event_type: AttendancePunchEventTypes.BreakEnd,
          occurred_at: closeAt,
          work_mode: input.lastOpenPunch.work_mode,
          source: "admin",
          origin: "system",
          metadata,
        }),
      );
    }

    createdPunches.push(
      this.repository.addPunch({
        company_id: input.companyId,
        employee_user_id: input.employeeUserId,
        actor_user_id: input.employeeUserId,
        event_type: AttendancePunchEventTypes.CheckOut,
        occurred_at: closeAt,
        work_mode: input.lastOpenPunch.work_mode,
        source: "admin",
        origin: "system",
        metadata,
      }),
    );
    return {
      company_id: input.companyId,
      employee_user_id: input.employeeUserId,
      work_date: input.workDate,
      first_check_in_id: input.firstCheckIn.id,
      first_check_in_at: input.firstCheckIn.occurred_at,
      last_open_punch_id: input.lastOpenPunch.id,
      closed_at: closeAt,
      created_punches: createdPunches,
      day_record: null,
    };
  }

  private autoPunchOutExpiredSessions(
    companyId: UUID,
    employeeUserId: UUID,
    timeZone: string,
    referenceIso = nowIso(),
    trigger: "api" | "worker" = "api",
  ): AttendanceAutoPunchOutClosure[] {
    const punches = this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at &&
          punch.occurred_at <= referenceIso,
      )
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    let openWorkDate: string | null = null;
    let firstCheckIn: AttendancePunch | null = null;
    let lastOpenPunch: AttendancePunch | null = null;
    const policy = this.attendancePolicy(companyId);
    const closures: AttendanceAutoPunchOutClosure[] = [];
    if (!policy.autoPunchOutEnabled) {
      return closures;
    }

    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        if (openWorkDate && firstCheckIn && lastOpenPunch) {
          const closure = this.addAutoPunchOutIfExpired({
            companyId,
            employeeUserId,
            workDate: openWorkDate,
            firstCheckIn,
            lastOpenPunch,
            timeZone,
            referenceIso,
            policy,
            trigger,
          });
          if (closure) {
            closures.push(closure);
          }
        }
        openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
        firstCheckIn = punch;
        lastOpenPunch = punch;
        continue;
      }
      if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
        openWorkDate = null;
        firstCheckIn = null;
        lastOpenPunch = null;
        continue;
      }
      if (openWorkDate) {
        lastOpenPunch = punch;
      }
    }

    if (openWorkDate && firstCheckIn && lastOpenPunch) {
      const closure = this.addAutoPunchOutIfExpired({
        companyId,
        employeeUserId,
        workDate: openWorkDate,
        firstCheckIn,
        lastOpenPunch,
        timeZone,
        referenceIso,
        policy,
        trigger,
      });
      if (closure) {
        closures.push(closure);
      }
    }
    return closures;
  }

  autoPunchOutExpiredSessionsForAll(
    input: {
      referenceIso?: string;
      batchSize?: number;
      companyIds?: ReadonlySet<UUID>;
    } = {},
  ): AttendanceAutoPunchOutRunResult {
    const referenceIso = input.referenceIso ?? nowIso();
    const batchSize = Math.max(
      1,
      Math.floor(input.batchSize ?? Number.MAX_SAFE_INTEGER),
    );
    const candidateUserCompanyPairs = Array.from(
      new Map(
        this.store.attendancePunches
          .filter(
            (punch) =>
              !punch.deleted_at &&
              punch.occurred_at <= referenceIso &&
              (!input.companyIds || input.companyIds.has(punch.company_id)),
          )
          .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
          .map(
            (punch) =>
              [
                `${punch.company_id}:${punch.employee_user_id}`,
                {
                  companyId: punch.company_id,
                  employeeUserId: punch.employee_user_id,
                },
              ] as const,
          ),
      ).values(),
    );
    const closures: AttendanceAutoPunchOutClosure[] = [];
    let scannedUsers = 0;
    let dayRecordsRecomputed = 0;

    for (const { companyId, employeeUserId } of candidateUserCompanyPairs) {
      if (scannedUsers >= batchSize) {
        break;
      }
      const user = this.store.users.find(
        (candidate) => candidate.id === employeeUserId && !candidate.deleted_at,
      );
      if (!user || user.employment_status !== EmploymentStatuses.Active) {
        continue;
      }
      scannedUsers += 1;
      const timeZone = this.company(companyId).timezone;
      const userClosures = this.autoPunchOutExpiredSessions(
        companyId,
        employeeUserId,
        timeZone,
        referenceIso,
        "worker",
      );
      const affectedWorkDates = new Set(
        userClosures.map((closure) => closure.work_date),
      );
      for (const workDate of affectedWorkDates) {
        const dayRecord = this.recomputeDay(
          companyId,
          employeeUserId,
          workDate,
          timeZone,
          referenceIso,
        );
        dayRecordsRecomputed += 1;
        for (const closure of userClosures) {
          if (closure.work_date === workDate) {
            closure.day_record = dayRecord;
          }
        }
      }
      for (const closure of userClosures) {
        const checkoutPunch = closure.created_punches.find(
          (punch) => punch.event_type === AttendancePunchEventTypes.CheckOut,
        );
        if (checkoutPunch) {
          appendAttendanceOutboxEvent(
            this.store,
            buildMissingCheckoutDetectedEvent({
              companyId,
              actorUserId: employeeUserId,
              subjectEmployeeUserId: employeeUserId,
              punchEventId: checkoutPunch.id,
              workDate: closure.work_date,
              occurredAt: checkoutPunch.occurred_at,
            }),
          );
        }
        for (const punch of closure.created_punches) {
          appendAttendanceOutboxEvent(
            this.store,
            buildPunchRecordedEvent({
              companyId,
              actorUserId: employeeUserId,
              subjectEmployeeUserId: employeeUserId,
              punchEventId: punch.id,
              punchType: punch.event_type,
              occurredAt: punch.occurred_at,
              workDate: closure.work_date,
              workMode: punch.work_mode,
              sourceChannel: punch.source,
              dayStatus: closure.day_record?.status ?? null,
            }),
          );
        }
      }
      closures.push(...userClosures);
    }

    return {
      reference_iso: referenceIso,
      scanned_users: scannedUsers,
      closed_sessions: closures.length,
      punches_created: closures.reduce(
        (total, closure) => total + closure.created_punches.length,
        0,
      ),
      day_records_recomputed: dayRecordsRecomputed,
      closures,
    };
  }

  private recomputeDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
    referenceIso = nowIso(),
  ): AttendanceDayRecord {
    this.autoPunchOutExpiredSessions(
      companyId,
      employeeUserId,
      timeZone,
      referenceIso,
    );
    const punches = this.punchesForWorkDate(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
    const durationFacts = this.durationFactsFromPunches(
      punches,
      workDate === todayDate(timeZone) ? referenceIso : null,
    );
    const firstCheckIn = durationFacts.firstCheckIn;
    const lastCheckOut = durationFacts.lastCheckOut;
    const workMode =
      punches.find((punch) => punch.work_mode)?.work_mode ?? null;
    const localToday = todayDate(timeZone);
    const isPast = workDate < localToday;
    const policy = this.attendancePolicy(companyId);
    const holiday = this.holidayForDate(companyId, workDate);
    const workingDay = this.isWorkingDay(companyId, workDate);
    const shift = resolveEmployeeShift({
      company: this.company(companyId),
      employee: this.requireUser(employeeUserId),
      workDate,
      templates: [],
      versions: [],
      assignments: [],
    });
    const autoAbsentAt = addMinutes(
      shift.scheduled_start_at,
      policy.autoMarkAbsentMinutes,
    );
    const canMarkAbsentToday =
      workDate === localToday &&
      Date.parse(referenceIso) >= Date.parse(autoAbsentAt);
    const absent =
      !firstCheckIn && workingDay && !holiday && (isPast || canMarkAbsentToday);
    const existing = this.repository.dayRecord(companyId, employeeUserId, workDate);
    const approvalFacts = this.approvalFactsForDay(companyId, employeeUserId, workDate);
    const dayClassification = this.dayClassificationFor({
      workDate,
      localToday,
      holiday: Boolean(holiday),
      workingDay,
      workMode,
      approvalFacts,
    });
    const passiveNote =
      holiday && punches.length === 0
        ? `Holiday: ${holiday.name}`
        : !workingDay && punches.length === 0
          ? "Company non-working day"
          : null;
    const projection = projectAttendanceDay({
      companyId,
      employeeUserId,
      workDate,
      asOf: referenceIso,
      dayClassification,
      firstCheckIn,
      lastCheckOut,
      hasOpenSession: durationFacts.hasOpenSession,
      hasIncompleteEvidence: durationFacts.hasUnmatchedPunch,
      incompleteIsException: isPast,
      workMode,
      workSeconds: durationFacts.workSeconds,
      breakSeconds: durationFacts.breakSeconds,
      scheduledStartAt: shift.scheduled_start_at,
      scheduledEndAt: shift.scheduled_end_at,
      graceSeconds: policy.graceMinutes * 60,
      approvalFacts,
      existingApproval: existing,
      regularizationStatus: existing?.regularization_status ?? null,
      forcePresenceState: absent
        ? AttendancePresenceStates.Absent
        : !firstCheckIn && workDate === localToday
          ? AttendancePresenceStates.NotStarted
          : undefined,
      note: passiveNote,
    });
    projection.note = projection.exception_type
      ? this.exceptionDetail(projection)
      : passiveNote;
    return this.repository.upsertDayRecord(projection);
  }

  private durationFactsFromPunches(
    punches: AttendancePunch[],
    openSessionEndAt: string | null,
  ): {
    firstCheckIn: string | null;
    lastCheckOut: string | null;
    workSeconds: number;
    breakSeconds: number;
    hasOpenSession: boolean;
    hasUnmatchedPunch: boolean;
  } {
    let workSeconds = 0;
    let breakSeconds = 0;
    let sessionStartedAt: string | null = null;
    let breakStartedAt: string | null = null;
    let sessionBreakSeconds = 0;
    let firstCheckIn: string | null = null;
    let lastCheckOut: string | null = null;
    let hasUnmatchedPunch = false;
    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        if (sessionStartedAt) hasUnmatchedPunch = true;
        sessionStartedAt = punch.occurred_at;
        firstCheckIn ??= punch.occurred_at;
        sessionBreakSeconds = 0;
        breakStartedAt = null;
      } else if (punch.event_type === AttendancePunchEventTypes.BreakStart && sessionStartedAt) {
        breakStartedAt = punch.occurred_at;
      } else if (
        punch.event_type === AttendancePunchEventTypes.BreakEnd &&
        breakStartedAt
      ) {
        const seconds = secondsBetween(breakStartedAt, punch.occurred_at);
        breakSeconds += seconds;
        sessionBreakSeconds += seconds;
        breakStartedAt = null;
      } else if (punch.event_type === AttendancePunchEventTypes.CheckOut && sessionStartedAt) {
        if (breakStartedAt) {
          const seconds = secondsBetween(breakStartedAt, punch.occurred_at);
          breakSeconds += seconds;
          sessionBreakSeconds += seconds;
          breakStartedAt = null;
        }
        workSeconds += Math.max(
          0,
          secondsBetween(sessionStartedAt, punch.occurred_at) - sessionBreakSeconds,
        );
        lastCheckOut = punch.occurred_at;
        sessionStartedAt = null;
        sessionBreakSeconds = 0;
      } else if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
        hasUnmatchedPunch = true;
      }
    }
    if (sessionStartedAt && openSessionEndAt) {
      if (breakStartedAt) {
        const seconds = secondsBetween(breakStartedAt, openSessionEndAt);
        breakSeconds += seconds;
        sessionBreakSeconds += seconds;
      }
      workSeconds += Math.max(
        0,
        secondsBetween(sessionStartedAt, openSessionEndAt) - sessionBreakSeconds,
      );
    }
    return {
      firstCheckIn,
      lastCheckOut,
      workSeconds,
      breakSeconds,
      hasOpenSession: sessionStartedAt !== null,
      hasUnmatchedPunch,
    };
  }

  private resolveDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
  ): AttendanceDayRecord {
    const existing = this.repository.dayRecord(
      companyId,
      employeeUserId,
      workDate,
    );
    const punches = this.punchesForWorkDate(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
    if (
      existing &&
      punches.length === 0 &&
      this.shouldPreserveManualDay(existing)
    ) {
      return existing;
    }
    if (punches.length > 0 || workDate <= todayDate(timeZone)) {
      return this.recomputeDay(companyId, employeeUserId, workDate, timeZone);
    }
    return this.getOrSynthesizeDay(
      companyId,
      employeeUserId,
      workDate,
      timeZone,
    );
  }

  private shouldPreserveManualDay(record: AttendanceDayRecord): boolean {
    return (
      record.day_classification === AttendanceDayClassifications.Leave ||
      record.day_classification === AttendanceDayClassifications.Wfh ||
      (record.day_classification === AttendanceDayClassifications.Holiday &&
        Boolean(this.holidayForDate(record.company_id, record.work_date))) ||
      record.regularization_status === AttendanceRegularizationStatuses.Approved
    );
  }

  private getOrSynthesizeDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
  ): AttendanceDayRecord {
    const existing = this.repository.dayRecord(
      companyId,
      employeeUserId,
      workDate,
    );
    if (existing) {
      return existing;
    }
    const holiday = this.holidayForDate(companyId, workDate);
    const workingDay = this.isWorkingDay(companyId, workDate);
    const localToday = todayDate(timeZone);
    const dayClassification = holiday
      ? AttendanceDayClassifications.Holiday
      : !workingDay
        ? AttendanceDayClassifications.Weekend
        : workDate > localToday
          ? AttendanceDayClassifications.Future
          : AttendanceDayClassifications.WorkingDay;
    const shift = resolveEmployeeShift({
      company: this.company(companyId),
      employee: this.requireUser(employeeUserId),
      workDate,
      templates: [],
      versions: [],
      assignments: [],
    });
    return this.repository.upsertDayRecord(projectAttendanceDay({
      companyId,
      employeeUserId,
      workDate,
      asOf: nowIso(),
      dayClassification,
      firstCheckIn: null,
      lastCheckOut: null,
      hasOpenSession: false,
      workMode: null,
      workSeconds: 0,
      breakSeconds: 0,
      scheduledStartAt: shift.scheduled_start_at,
      scheduledEndAt: shift.scheduled_end_at,
      graceSeconds: this.attendancePolicy(companyId).graceMinutes * 60,
      note: dayClassification === AttendanceDayClassifications.WorkingDay
        ? "No punch-in recorded"
        : dayClassification === AttendanceDayClassifications.Holiday
          ? `Holiday: ${holiday?.name ?? "Company holiday"}`
          : dayClassification === AttendanceDayClassifications.Weekend
            ? "Company non-working day"
            : null,
    }));
  }

  private weekRecords(
    companyId: UUID,
    employeeUserId: UUID,
    timeZone = this.timezoneForUser(employeeUserId, companyId),
  ): AttendanceDayRecord[] {
    const localToday = todayDate(timeZone);
    const today = new Date(`${localToday}T00:00:00.000Z`);
    const start = new Date(today);
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const workDate = date.toISOString().slice(0, 10);
      return this.resolveDay(companyId, employeeUserId, workDate, timeZone);
    });
  }

  private punchesForWorkDate(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
  ): AttendancePunch[] {
    let openWorkDate: string | null = null;
    return this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at,
      )
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .filter((punch) => {
        if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
          openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
        }
        const assignedWorkDate =
          openWorkDate ?? dateInTimeZone(punch.occurred_at, timeZone);
        const include = assignedWorkDate === workDate;
        if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
          openWorkDate = null;
        }
        return include;
      });
  }

  private workDateForPunch(
    companyId: UUID,
    employeeUserId: UUID,
    eventType: AttendancePunchEventType,
    occurredAt: string,
    timeZone: string,
  ): string {
    if (eventType === AttendancePunchEventTypes.CheckIn) {
      return dateInTimeZone(occurredAt, timeZone);
    }
    return (
      this.openSessionWorkDate(
        companyId,
        employeeUserId,
        occurredAt,
        timeZone,
      ) ?? dateInTimeZone(occurredAt, timeZone)
    );
  }

  private openSessionWorkDate(
    companyId: UUID,
    employeeUserId: UUID,
    occurredAt: string,
    timeZone: string,
  ): string | null {
    let openWorkDate: string | null = null;
    const punches = this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at &&
          punch.occurred_at <= occurredAt,
      )
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.CheckIn) {
        openWorkDate = dateInTimeZone(punch.occurred_at, timeZone);
      }
      if (punch.event_type === AttendancePunchEventTypes.CheckOut) {
        openWorkDate = null;
      }
    }
    return openWorkDate;
  }

  private weeklyBalance(
    companyId: UUID,
    records: AttendanceDayRecord[],
  ): Record<string, unknown> {
    const elapsedRecords = records.filter(
      (record) =>
        record.work_date <=
        todayDate(this.timezoneForUser(record.employee_user_id, companyId)),
    );
    const targetSeconds = this.targetWorkMinutes(companyId) * 60;
    const weekdayRecords = elapsedRecords.filter(
      (record) =>
        this.isWorkingDay(companyId, record.work_date) &&
        !this.holidayForDate(companyId, record.work_date),
    );
    const offDayRecords = elapsedRecords.filter(
      (record) =>
        !this.isWorkingDay(companyId, record.work_date) ||
        Boolean(this.holidayForDate(companyId, record.work_date)),
    );
    const requiredWeekdaySeconds = weekdayRecords.length * targetSeconds;
    const weekdayWorkedSeconds = weekdayRecords.reduce(
      (total, record) => total + record.work_seconds,
      0,
    );
    const offDayWorkedSeconds = offDayRecords.reduce(
      (total, record) => total + record.work_seconds,
      0,
    );
    const weekdayShortageSeconds = Math.max(
      0,
      requiredWeekdaySeconds - weekdayWorkedSeconds,
    );
    const compensatedSeconds = Math.min(
      weekdayShortageSeconds,
      offDayWorkedSeconds,
    );
    const overtimeSeconds = Math.max(
      0,
      offDayWorkedSeconds - compensatedSeconds,
    );
    const requiredWeekdayMinutes = Math.floor(requiredWeekdaySeconds / 60);
    const weekdayWorkedMinutes = Math.floor(weekdayWorkedSeconds / 60);
    const offDayWorkedMinutes = Math.floor(offDayWorkedSeconds / 60);
    const weekdayShortageMinutes = Math.floor(weekdayShortageSeconds / 60);
    const compensatedMinutes = Math.floor(compensatedSeconds / 60);
    const overtimeMinutes = Math.floor(overtimeSeconds / 60);
    return {
      required_weekly_minutes: requiredWeekdayMinutes,
      required_weekly_hours: minutesToHours(requiredWeekdayMinutes),
      weekday_worked_minutes: weekdayWorkedMinutes,
      weekday_worked_hours: minutesToHours(weekdayWorkedMinutes),
      weekday_shortage_minutes: weekdayShortageMinutes,
      weekday_shortage_hours: minutesToHours(weekdayShortageMinutes),
      off_day_worked_minutes: offDayWorkedMinutes,
      off_day_worked_hours: minutesToHours(offDayWorkedMinutes),
      compensated_minutes: compensatedMinutes,
      compensated_hours: minutesToHours(compensatedMinutes),
      overtime_minutes: overtimeMinutes,
      overtime_hours: minutesToHours(overtimeMinutes),
    };
  }

  async punchPostgres(
    actor: AuthUser,
    input: EmployeePunchPostgresInput,
    clientEnvelope?: AttendanceCommandEnvelopeInput,
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.punch_postgres",
    );
    assertCanUseSelfAttendance(actor);
    const companyId = context.companyId;
    if (!this.store.pgPool)
      throw conflict("Attendance command service is unavailable.");
    const timeZone = this.timezoneForUser(actor.id, companyId);
    return new AttendanceCommandService(this.store).execute({
      actor,
      companyId,
      timeZone,
      idempotencyKey: input.idempotency_key,
      command: input,
      clientEnvelope,
      isWorkingDayFor: (workDate) => this.isWorkingDay(companyId, workDate),
    });
  }

  async recordEmployeeManualNowPostgres(
    actor: AuthUser,
    input: Omit<EmployeePunchPostgresInput, "idempotency_key" | "occurred_at">,
    idempotencyKey: string,
    clientEnvelope?: AttendanceCommandEnvelopeInput,
  ): Promise<Record<string, unknown>> {
    return this.punchPostgres(actor, {
      ...input,
      source: employeePunchSource(input.source),
      idempotency_key: idempotencyKey,
    }, clientEnvelope);
  }

  async publishGeofenceVersion(
    actor: AuthUser,
    geofenceId: UUID,
    versionId: UUID,
    input: { effectiveFrom: string; effectiveUntil?: string | null },
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.geofence.publish",
    );
    if (!canManageAllAttendance(actor)) {
      throw forbidden("Only HR or Admin can publish geofence versions.");
    }
    if (!this.store.pgPool) {
      throw conflict("Geofence publish service is unavailable.");
    }
    const version = await new PostgresGeofenceRepository(
      this.store.pgPool,
    ).publishDraftVersion({
      companyId: context.companyId,
      actorUserId: actor.id,
      geofenceId,
      versionId,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
    });
    return { version };
  }

  async recordManagerAssistedCurrentPunchPostgres(
    actor: AuthUser,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      location?: AttendanceLocationEvidenceInput;
      reason?: string;
    },
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.assisted_current_punch",
    );
    const subject = this.requireUser(subjectEmployeeUserId);
    this.assertTargetUserInCompany(subject.id, context.companyId, {
      operation: "attendance.assisted_current_punch.target_employee",
      requireActiveEmployment: true,
    });
    assertCanAssistCurrentPunch(actor, subject);
    if (!this.store.pgPool) throw conflict("Attendance command service is unavailable.");
    return new AttendanceCommandService(this.store).execute({
      actor,
      companyId: context.companyId,
      subjectEmployeeUserId: subject.id,
      commandKind: "manager_assisted_now",
      timeZone: this.timezoneForUser(subject.id, context.companyId),
      idempotencyKey,
      command: {
        event_type: input.event_type,
        work_mode: input.work_mode,
        source: "admin",
        metadata: { ...input.metadata, ...(input.reason ? { assisted_reason: input.reason } : {}) },
        location: input.location,
      },
      isWorkingDayFor: (workDate) => this.isWorkingDay(context.companyId, workDate),
    });
  }

  async recordHistoricalCorrection(
    actor: AuthUser,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    },
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.historical_correction",
    );
    const subject = this.requireUser(subjectEmployeeUserId);
    this.assertTargetUserInCompany(subject.id, context.companyId, {
      operation: "attendance.historical_correction.target_employee",
      requireActiveEmployment: false,
    });
    assertCanCreateHistoricalCorrection(actor);
    if (Date.parse(input.occurred_at) >= Date.parse(nowIso())) {
      throw badRequest("Historical correction occurrence time must be in the past.");
    }
    if (input.linked_regularization_request_id) {
      const request = this.repository.findRegularization(
        input.linked_regularization_request_id,
        new Set([context.companyId]),
      );
      if (request.employee_user_id !== subject.id) {
        throw forbidden("Linked regularization does not belong to the correction subject.");
      }
    }
    if (this.store.kind === "postgres") {
      if (!this.store.pgPool) throw conflict("Attendance command service is unavailable.");
      return new AttendanceCommandService(this.store).executeHistoricalCorrection({
        actor,
        principal: {
          companyId: context.companyId,
          actorUserId: actor.id,
          subjectEmployeeUserId: subject.id,
        },
        idempotencyKey,
        timeZone: this.timezoneForUser(subject.id, context.companyId),
        command: input,
        commandKind: "historical_correction",
      });
    }
    const requestHash = canonicalAttendanceRequestHash({
      company_id: context.companyId,
      actor_user_id: actor.id,
      subject_employee_user_id: subject.id,
      command_kind: "historical_correction",
      ...input,
    });
    const key = `attendance.historical_correction:${context.companyId}:${actor.id}:${subject.id}:${idempotencyKey}`;
    const entries = memoryHistoricalCorrectionIdempotency.get(this.store) ?? new Map();
    memoryHistoricalCorrectionIdempotency.set(this.store, entries);
    const existing = entries.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw conflict("Idempotency key was already used with a different correction request.");
      }
      return existing.response;
    }
    const response = this.recordHistoricalCorrectionInMemory(
      actor,
      context.companyId,
      subject.id,
      input,
      "historical_correction",
    );
    entries.set(key, { requestHash, response });
    return response;
  }

  private recordHistoricalCorrectionInMemory(
    actor: AuthUser,
    companyId: UUID,
    subjectEmployeeUserId: UUID,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at: string;
      reason: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      metadata: Record<string, unknown>;
      linked_regularization_request_id?: UUID;
    },
    origin: Extract<AttendancePunch["origin"], "historical_correction" | "approved_regularization">,
  ): Record<string, unknown> {
    const timeZone = this.timezoneForUser(subjectEmployeeUserId, companyId);
    const workDate = dateInTimeZone(input.occurred_at, timeZone);
    const punch = this.repository.addPunch({
      company_id: companyId,
      employee_user_id: subjectEmployeeUserId,
      actor_user_id: actor.id,
      event_type: input.event_type,
      occurred_at: input.occurred_at,
      work_mode: input.work_mode,
      source: "admin",
      origin,
      metadata: { ...input.metadata, correction_reason: input.reason },
      regularization_request_id: input.linked_regularization_request_id ?? null,
    });
    const day = this.recomputeDay(
      companyId,
      subjectEmployeeUserId,
      workDate,
      timeZone,
    );
    appendAttendanceOutboxEvent(
      this.store,
      buildPunchRecordedEvent({
        companyId,
        actorUserId: actor.id,
        subjectEmployeeUserId,
        punchEventId: punch.id,
        punchType: punch.event_type,
        occurredAt: punch.occurred_at,
        workDate,
        workMode: punch.work_mode,
        sourceChannel: punch.source,
        origin,
        dayStatus: day.status,
      }),
    );
    return { punch_id: punch.id, punch, day_status: this.presentDay(day, timeZone) };
  }

  private resolveAttendanceCompanyContext(
    actor: AuthUser,
    operation: string,
    requestedCompanyId?: UUID | null,
  ): ActiveCompanyMembershipContext {
    return resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      requestedCompanyId,
      operation,
      requireActiveEmployment: true,
    });
  }

  private async geoFallbackExactLocationAccessStates(
    actor: AuthUser,
    companyId: UUID,
    reviews: AttendanceGeoFallbackReview[],
  ): Promise<Map<UUID, ExactAttendanceLocationAccessState>> {
    const states = new Map<UUID, ExactAttendanceLocationAccessState>();
    if (reviews.length === 0) return states;
    const authorized = hasExactAttendanceLocationPermission(
      actor,
      this.store.rbacRolePermissions,
    );
    if (!this.store.pgPool) {
      for (const review of reviews) states.set(review.id, "unavailable");
      return states;
    }
    const availableReviewIds = await this.availableGeoFallbackExactLocationReviewIds(
      companyId,
      reviews.map((review) => review.id),
    );
    for (const review of reviews) {
      states.set(
        review.id,
        availableReviewIds.has(review.id)
          ? authorized
            ? "available_authorized"
            : "available_restricted"
          : "unavailable",
      );
    }
    return states;
  }

  private async availableGeoFallbackExactLocationReviewIds(
    companyId: UUID,
    reviewIds: UUID[],
  ): Promise<Set<UUID>> {
    if (!this.store.pgPool || reviewIds.length === 0) return new Set();
    const result = await this.store.pgPool.query<{ review_id: UUID }>(
      `SELECT DISTINCT review.id AS review_id
         FROM attendance.geo_fallback_reviews review
         JOIN attendance.attendance_events event
           ON event.company_id = review.company_id
          AND event.command_execution_id = review.original_command_id
          AND event.employee_user_id = review.employee_user_id
         JOIN attendance.location_evidence location
           ON location.company_id = event.company_id
          AND location.attendance_event_id = event.id
          AND location.employee_user_id = review.employee_user_id
        WHERE review.company_id = $1
          AND review.id = ANY($2::uuid[])
          AND review.deleted_at IS NULL
          AND location.latitude IS NOT NULL
          AND location.longitude IS NOT NULL
          AND location.coordinates_purged_at IS NULL
          AND location.coordinates_expire_at IS NOT NULL
          AND location.coordinates_expire_at > now()`,
      [companyId, reviewIds],
    );
    return new Set(result.rows.map((row) => row.review_id));
  }

  private async findGeoFallbackReview(
    companyId: UUID,
    reviewId: UUID,
  ): Promise<AttendanceGeoFallbackReview | null> {
    if (this.store.pgPool) {
      const result = await this.store.pgPool.query<AttendanceGeoFallbackReview>(
        `SELECT id, company_id, employee_user_id, submitted_by_user_id,
            current_approver_user_id, original_command_id, original_decision_id,
            fallback_command_id, punch_event_id, event_type, work_date::text,
            occurred_at::text, reason_code, reason_detail, geo_policy, status,
            decision_remarks, decided_by_user_id, decided_at::text, version,
            created_at::text, updated_at::text, deleted_at::text
         FROM attendance.geo_fallback_reviews
         WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
        [reviewId, companyId],
      );
      return result.rows[0] ?? null;
    }
    return (
      this.store.attendanceGeoFallbackReviews.find(
        (review) =>
          review.id === reviewId &&
          review.company_id === companyId &&
          !review.deleted_at,
      ) ?? null
    );
  }

  private assertCanAccessGeoFallbackReview(
    actor: AuthUser,
    companyId: UUID,
    review: AttendanceGeoFallbackReview,
  ): void {
    if (actor.id === review.employee_user_id) {
      throw forbidden("Employees cannot reveal exact attendance coordinates.");
    }
    const subject = this.store.users.find(
      (user) =>
        user.id === review.employee_user_id &&
        this.isUserInCompany(user.id, companyId),
    );
    if (!subject) {
      throw notFound("Geo fallback review employee was not found.");
    }
    assertCanSeeAttendanceUser(actor, subject);
    if (
      canSeeAllAttendance(actor) ||
      review.current_approver_user_id === actor.id
    ) {
      return;
    }
    throw forbidden(
      "Exact location access is limited to the assigned attendance reviewer, HR, Admin, or Auditor users.",
    );
  }

  private async resolveGeoFallbackLocationEvidenceId(
    companyId: UUID,
    reviewId: UUID,
  ): Promise<UUID | null> {
    if (!this.store.pgPool) return null;
    const result = await this.store.pgPool.query<{ location_evidence_id: UUID }>(
      `SELECT location.id AS location_evidence_id
         FROM attendance.geo_fallback_reviews review
         JOIN attendance.attendance_events event
           ON event.company_id = review.company_id
          AND event.command_execution_id = review.original_command_id
          AND event.employee_user_id = review.employee_user_id
         JOIN attendance.location_evidence location
           ON location.company_id = event.company_id
          AND location.attendance_event_id = event.id
          AND location.employee_user_id = review.employee_user_id
        WHERE review.company_id = $1
          AND review.id = $2
          AND review.deleted_at IS NULL
          AND location.latitude IS NOT NULL
          AND location.longitude IS NOT NULL
          AND location.coordinates_purged_at IS NULL
          AND location.coordinates_expire_at IS NOT NULL
          AND location.coordinates_expire_at > now()
        ORDER BY location.captured_at DESC, location.id
        LIMIT 1`,
      [companyId, reviewId],
    );
    return result.rows[0]?.location_evidence_id ?? null;
  }

  private company(companyId: UUID) {
    const company = this.store.companyProfiles.find(
      (candidate) =>
        candidate.id === companyId && candidate.status === "active",
    );
    if (!company) {
      throw companyContextRequired({
        company_id: companyId,
        operation: "attendance_company",
      });
    }
    return company;
  }

  private assertTargetUserInCompany(
    userId: UUID,
    companyId: UUID,
    input: { operation: string; requireActiveEmployment: boolean },
  ): void {
    assertUserInCompanyMembershipContext(this.store, {
      userId,
      companyId,
      operation: input.operation,
      requireActiveEmployment: input.requireActiveEmployment,
    });
  }

  private isUserInCompany(userId: UUID, companyId: UUID): boolean {
    try {
      this.assertTargetUserInCompany(userId, companyId, {
        operation: "attendance.company_target_filter",
        requireActiveEmployment: false,
      });
      return true;
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === ErrorCodes.Unauthorized ||
          error.code === ErrorCodes.Forbidden ||
          error.code === ErrorCodes.CompanyContextRequired)
      ) {
        return false;
      }
      throw error;
    }
  }

  private attendancePolicy(companyId: UUID): AttendancePunchPolicy {
    const policy = this.store.adminPolicies.find(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.policy_key === "attendance" &&
        candidate.status === "active" &&
        !candidate.deleted_at,
    );
    const config = normalizeAttendancePolicyConfig(policy?.config);
    return {
      ...config,
      policyVersion: policy ? String(policy.version) : "built-in-default",
    };
  }

  private isWorkingDay(companyId: UUID, workDate: string): boolean {
    return isWorkingDate(
      workDate,
      this.company(companyId).working_week,
      this.holidayDates(companyId),
    );
  }

  private holidayForDate(companyId: UUID, workDate: string) {
    return (
      this.store.holidays.find(
        (holiday) =>
          holiday.company_id === companyId &&
          holiday.holiday_date === workDate &&
          !holiday.optional &&
          !holiday.deleted_at,
      ) ?? null
    );
  }

  private holidayDates(companyId: UUID): Set<string> {
    return new Set(
      this.store.holidays
        .filter(
          (holiday) =>
            holiday.company_id === companyId &&
            !holiday.optional &&
            !holiday.deleted_at,
        )
        .map((holiday) => holiday.holiday_date),
    );
  }

  private approvalFactsForDay(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
  ): AttendanceApprovalFact[] {
    const facts: AttendanceApprovalFact[] = [];
    const regularization = this.store.attendanceRegularizations
      .filter((request) =>
        request.company_id === companyId &&
        request.employee_user_id === employeeUserId &&
        request.work_date === workDate &&
        !request.deleted_at,
      )
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
    if (regularization) {
      facts.push({
        kind: AttendanceApprovalKinds.Regularization,
        state: regularization.status,
      });
    }
    for (const request of this.store.leaveRequests) {
      if (
        request.employee_user_id !== employeeUserId ||
        request.deleted_at ||
        request.date_from > workDate ||
        request.date_to < workDate ||
        request.status === "cancelled"
      ) continue;
      facts.push({
        kind: AttendanceApprovalKinds.Leave,
        state: request.status === "pending_manager" ? AttendanceApprovalStates.Pending : request.status,
      });
    }
    for (const request of this.store.wfhRequests) {
      if (
        request.employee_user_id !== employeeUserId ||
        request.deleted_at ||
        request.date_from > workDate ||
        request.date_to < workDate ||
        request.status === "cancelled"
      ) continue;
      facts.push({
        kind: AttendanceApprovalKinds.Wfh,
        state: request.status === "pending_manager" ? AttendanceApprovalStates.Pending : request.status,
      });
    }
    return facts;
  }

  private dayClassificationFor(input: {
    workDate: string;
    localToday: string;
    holiday: boolean;
    workingDay: boolean;
    workMode: AttendanceDayRecord["work_mode"];
    approvalFacts: AttendanceApprovalFact[];
  }) {
    if (
      input.approvalFacts.some(
        (fact) =>
          fact.kind === AttendanceApprovalKinds.Leave &&
          fact.state === AttendanceApprovalStates.Approved,
      )
    ) return AttendanceDayClassifications.Leave;
    if (
      input.approvalFacts.some(
        (fact) =>
          fact.kind === AttendanceApprovalKinds.Wfh &&
          fact.state === AttendanceApprovalStates.Approved,
      )
    ) return AttendanceDayClassifications.Wfh;
    if (input.holiday) return AttendanceDayClassifications.Holiday;
    if (!input.workingDay) return AttendanceDayClassifications.Weekend;
    if (input.workMode === "wfh") return AttendanceDayClassifications.Wfh;
    if (input.workDate > input.localToday) return AttendanceDayClassifications.Future;
    return AttendanceDayClassifications.WorkingDay;
  }

  private targetWorkMinutes(companyId: UUID): number {
    return Math.max(
      0,
      Math.round(this.company(companyId).work_hours_per_day * 60),
    );
  }

  private timezoneForUser(userId: UUID, companyId: UUID): string {
    const user = this.store.users.find(
      (candidate) => candidate.id === userId && !candidate.deleted_at,
    );
    const company = this.company(companyId);
    return user?.timezone ?? company?.timezone ?? "Asia/Kolkata";
  }

  private recordsForUsers(
    companyId: UUID,
    userIds: Set<UUID>,
    from: string,
    to: string,
  ): AttendanceDayRecord[] {
    const output: AttendanceDayRecord[] = [];
    for (const userId of userIds) {
      const timeZone = this.timezoneForUser(userId, companyId);
      for (const date of datesInclusive(from, to)) {
        output.push(this.resolveDay(companyId, userId, date, timeZone));
      }
    }
    return output.sort((a, b) => a.work_date.localeCompare(b.work_date));
  }

  private daySummary(
    records: Array<
      | AttendanceDayRecord
      | {
          status: AttendanceDayStatus;
          work_minutes: number;
          late_minutes?: number;
          exception_type?: string | null;
        }
    >,
  ) {
    return {
      present: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Present),
      ).length,
      absent: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Absent),
      ).length,
      late: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Late),
      ).length,
      wfh: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Wfh),
      ).length,
      leave: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Leave),
      ).length,
      weekend: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Weekend),
      ).length,
      holiday: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Holiday),
      ).length,
      future: records.filter(
        (record) => matchesLegacyAttendanceStatus(record, AttendanceDayStatuses.Future),
      ).length,
      missing_punch: records.filter(
        (record) => record.exception_type === "missing_punch",
      ).length,
      regularized: records.filter(
        (record) =>
          "regularization_status" in record &&
          record.regularization_status ===
            AttendanceRegularizationStatuses.Approved,
      ).length,
      work_minutes: Math.floor(records.reduce(
        (total, record) => total + ("work_seconds" in record ? record.work_seconds : record.work_minutes * 60),
        0,
      ) / 60),
    };
  }

  private teamTotals(records: AttendanceDayRecord[], totalEmployees: number) {
    return {
      total: totalEmployees,
      present: records.filter(
        (record) =>
          record.presence_state === AttendancePresenceStates.Present,
      ).length,
      absent: records.filter(
        (record) => record.presence_state === AttendancePresenceStates.Absent,
      ).length,
      late: records.filter(
        (record) =>
          record.punctuality_state === AttendancePunctualityStates.Late ||
          record.punctuality_state === AttendancePunctualityStates.LateAndEarlyDeparture,
      ).length,
      early_out: records.filter((record) => record.early_departure_seconds > 0)
        .length,
      wfh: records.filter(
        (record) => record.day_classification === AttendanceDayClassifications.Wfh,
      ).length,
      on_leave: records.filter(
        (record) => record.day_classification === AttendanceDayClassifications.Leave,
      ).length,
    };
  }

  private departmentSummary(records: AttendanceDayRecord[], users: CoreUser[]) {
    return this.store.departments
      .filter((department) => !department.deleted_at)
      .map((department) => {
        const members = users.filter(
          (user) => user.department_id === department.id,
        );
        const memberIds = new Set(members.map((user) => user.id));
        const departmentRecords = records.filter((record) =>
          memberIds.has(record.employee_user_id),
        );
        const present = departmentRecords.filter(
          (record) =>
            record.presence_state === AttendancePresenceStates.Present,
        ).length;
        return {
          department_id: department.id,
          department_code: department.department_code,
          name: department.name,
          present,
          strength: members.length,
          attendance_percent:
            members.length > 0
              ? Math.round((present / members.length) * 100)
              : 0,
        };
      })
      .filter((row) => row.strength > 0);
  }

  private reportingEvidenceCategory(
    record: AttendanceDayRecord,
  ): AttendanceReportingEvidenceCategory | null {
    return deriveAttendanceReportingEvidenceCategory({
      day: record,
      signals: this.reportingEvidenceSignals(record),
    });
  }

  private reportingEvidenceSignals(
    record: AttendanceDayRecord,
  ): AttendanceReportingEvidenceSignals {
    const reviews = this.store.attendanceGeoFallbackReviews.filter(
      (review) =>
        review.company_id === record.company_id &&
        review.employee_user_id === record.employee_user_id &&
        review.work_date === record.work_date &&
        !review.deleted_at,
    );
    const offlineVerificationStatuses = this.store.outbox
      .filter(
        (event) =>
          event.event_type === "attendance.provisional.recorded" &&
          event.payload.company_id === record.company_id &&
          event.payload.subject_employee_user_id === record.employee_user_id &&
          typeof event.payload.captured_at === "string" &&
          event.payload.captured_at.slice(0, 10) === record.work_date,
      )
      .map((event) => event.payload.verification_status);
    return {
      reviewRequired: reviews.some(
        (review) => review.status === "pending" || review.status === "returned",
      ) || offlineVerificationStatuses.includes("review_required"),
      operativeRejected: offlineVerificationStatuses.includes("rejected"),
      provisional: offlineVerificationStatuses.includes("unverified"),
      hasContributingEvidence: Boolean(
        record.first_check_in ||
          record.last_check_out ||
          record.work_seconds > 0 ||
          offlineVerificationStatuses.length > 0 ||
          reviews.some((review) => review.status === "approved"),
      ),
    };
  }

  private visibleUsers(
    actor: AuthUser,
    companyId: UUID,
    departmentId?: UUID,
    managerUserId?: UUID,
  ): CoreUser[] {
    const manager = managerUserId ? this.store.users.find(
      (user) =>
        user.id === managerUserId &&
        !user.deleted_at &&
        this.isUserInCompany(user.id, companyId) &&
        canSeeAttendanceUser(actor, user),
    ) : null;
    if (managerUserId && !manager) {
      return [];
    }
    return this.store.users.filter((user) => {
      if (
        !visibleUserPredicate(actor, user) ||
        !this.isUserInCompany(user.id, companyId)
      ) {
        return false;
      }
      if (departmentId && user.department_id !== departmentId) {
        return false;
      }
      if (
        manager &&
        user.id !== manager.id &&
        !user.hierarchy_path.startsWith(`${manager.hierarchy_path}.`)
      ) {
        return false;
      }
      return true;
    });
  }

  private hasVisibleSubordinates(actor: AuthUser, companyId: UUID): boolean {
    return this.visibleUsers(actor, companyId).some(
      (user) => user.id !== actor.id,
    );
  }

  private regularizationQueueCounts(
    requests: AttendanceRegularizationRequest[],
  ) {
    return {
      total: requests.length,
      pending: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Pending,
      ).length,
      approved: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Approved,
      ).length,
      returned: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Returned,
      ).length,
      rejected: requests.filter(
        (request) =>
          request.status === AttendanceRegularizationStatuses.Rejected,
      ).length,
    };
  }

  private geoFallbackQueueCounts(requests: AttendanceGeoFallbackReview[]) {
    return {
      total: requests.length,
      pending: requests.filter((request) => request.status === "pending").length,
      approved: requests.filter((request) => request.status === "approved").length,
      returned: requests.filter((request) => request.status === "returned").length,
      rejected: requests.filter((request) => request.status === "rejected").length,
    };
  }

  private async geoFallbackWorkSiteLabels(
    companyId: UUID,
    reviews: AttendanceGeoFallbackReview[],
  ): Promise<Map<UUID, SafeGeoWorkSiteLabel>> {
    if (!this.store.pgPool) return new Map();
    const workSiteIds = [
      ...new Set(
        reviews
          .map((review) => geoWorkSiteId(review))
          .filter((id): id is UUID => Boolean(id)),
      ),
    ];
    if (workSiteIds.length === 0) return new Map();
    const result = await this.store.pgPool.query<{
      id: UUID;
      name: string;
      site_type: string | null;
    }>(
      `SELECT id, name, site_type
         FROM attendance.work_sites
        WHERE company_id = $1
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL`,
      [companyId, workSiteIds],
    );
    return new Map(
      result.rows.map((row) => [
        row.id,
        { name: row.name, site_type: row.site_type },
      ]),
    );
  }

  private requireUser(userId: UUID): CoreUser {
    const user = this.store.users.find(
      (candidate) => candidate.id === userId && !candidate.deleted_at,
    );
    if (!user) {
      throw notFound("User not found", { id: userId });
    }
    return user;
  }

  private adminFallback(companyId: UUID): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.roles.includes(Roles.Admin) &&
          user.employment_status === EmploymentStatuses.Active &&
          !user.deleted_at &&
          this.isUserInCompany(user.id, companyId),
      ) ?? null
    );
  }

  private applyApprovedRegularizationItems(
    request: AttendanceRegularizationRequest,
    regularizationActionId: UUID,
    actor: AuthUser,
  ): void {
    const timeZone = this.timezoneForUser(
      request.employee_user_id,
      request.company_id,
    );
    for (const item of request.items) {
      let replacementPunchEventId: UUID | null = null;
      if (item.operation !== "void") {
        const result = this.recordHistoricalCorrectionInMemory(
          actor,
          request.company_id,
          request.employee_user_id,
          {
            event_type: item.event_type!,
            occurred_at: item.occurred_at!,
            reason: request.reason,
            work_mode: "office",
            metadata: {
              decided_by_user_id: actor.id,
              regularization_request_item_id: item.id,
              correction_operation: item.operation,
              target_punch_event_id: item.target_punch_event_id,
            },
            linked_regularization_request_id: request.id,
          },
          "approved_regularization",
        );
        replacementPunchEventId = result.punch_id as UUID;
      }
      this.repository.addRegularizationCorrectionApplication({
        company_id: request.company_id,
        regularization_request_id: request.id,
        regularization_request_item_id: item.id,
        regularization_action_id: regularizationActionId,
        operation: item.operation,
        target_punch_event_id: item.target_punch_event_id,
        replacement_punch_event_id: replacementPunchEventId,
        attendance_event_id: null,
        applied_by_user_id: actor.id,
        applied_at: request.decided_at!,
      });
    }
    this.recomputeDay(
      request.company_id,
      request.employee_user_id,
      request.work_date,
      timeZone,
    );
  }

  private normalizeRegularizationItems(input: RegularizationCreateInput): RegularizationItemInput[] {
    if (Boolean(input.items) === Boolean(input.requested_punches)) {
      throw badRequest("Supply exactly one of items or requested_punches.");
    }
    const items: RegularizationItemInput[] = input.items
      ? input.items.map((item) => ({
          operation: item.operation,
          target_punch_event_id: item.operation === "add" ? null : item.target_punch_event_id,
          event_type: item.operation === "void" ? null : item.event_type,
          occurred_at: item.operation === "void" ? null : item.occurred_at,
        }))
      : input.requested_punches!.map((punch) => ({
          operation: "add",
          target_punch_event_id: null,
          event_type: punch.event_type,
          occurred_at: punch.occurred_at,
        }));
    if (items.length === 0 || items.length > 20) {
      throw badRequest("Regularization requests require between 1 and 20 correction items.");
    }
    return items;
  }

  private validateRegularizationItems(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
    items: RegularizationItemInput[],
  ): void {
    if (items.length === 0) {
      throw badRequest("Attendance regularization request has no normalized items.");
    }
    const targets = new Set<UUID>();
    const adds = new Set<string>();
    for (const item of items) {
      if (item.operation === "add" || item.operation === "replace") {
        if (!item.event_type || !item.occurred_at) {
          throw badRequest("ADD and REPLACE items require event_type and occurred_at.");
        }
        if (!([AttendancePunchEventTypes.CheckIn, AttendancePunchEventTypes.CheckOut] as string[]).includes(item.event_type)) {
          throw badRequest("Regularization items support only check-in and check-out events.");
        }
        if (dateInTimeZone(item.occurred_at, timeZone) !== workDate) {
          throw badRequest("Requested punch timestamps must fall on the regularization work_date.");
        }
        const logicalKey = `${item.event_type}:${item.occurred_at}`;
        if (item.operation === "add" && adds.has(logicalKey)) {
          throw badRequest("Duplicate ADD correction items are not allowed.");
        }
        if (item.operation === "add") adds.add(logicalKey);
      }
      if (item.operation === "add") {
        if (item.target_punch_event_id) throw badRequest("ADD items cannot target an existing punch.");
        continue;
      }
      if (!item.target_punch_event_id) {
        throw badRequest("REPLACE and VOID items require target_punch_event_id.");
      }
      if (targets.has(item.target_punch_event_id)) {
        throw badRequest("A target punch may be corrected only once per request.");
      }
      targets.add(item.target_punch_event_id);
      const target = this.store.attendancePunches.find((punch) =>
        punch.id === item.target_punch_event_id && !punch.deleted_at,
      );
      if (!target || target.company_id !== companyId) {
        throw badRequest("Target punch does not belong to the active company.");
      }
      if (target.employee_user_id !== employeeUserId) {
        throw badRequest("Target punch does not belong to the regularization employee.");
      }
      if (!([AttendancePunchEventTypes.CheckIn, AttendancePunchEventTypes.CheckOut] as string[]).includes(target.event_type)) {
        throw badRequest("Target punch type is not eligible for regularization correction.");
      }
      if (dateInTimeZone(target.occurred_at, timeZone) !== workDate) {
        throw badRequest("Target punch must belong to the regularization work_date.");
      }
      if (this.store.attendanceRegularizationCorrectionApplications.some(
        (application) => application.target_punch_event_id === target.id,
      )) {
        throw conflict("Target punch was already replaced or voided.");
      }
      if (item.operation === "void" && (item.event_type || item.occurred_at)) {
        throw badRequest("VOID items cannot include replacement event data.");
      }
    }
  }

  private async employeeSelfDayEvidence(
    actor: AuthUser,
    query: AttendancePageQuery,
  ): Promise<EmployeeAttendanceDayEvidence | null> {
    if (!canUseSelfAttendance(actor)) return null;
    if (query.user_id && query.user_id !== actor.id) return null;

    const context = this.resolveAttendanceCompanyContext(
      actor,
      "attendance.daily_calendar.self_evidence",
      query.company_id,
    );
    const companyId = context.companyId;
    const timeZone = this.timezoneForUser(actor.id, companyId);
    const date = query.date ?? query.date_from ?? todayDate(timeZone);
    const day = this.resolveDay(companyId, actor.id, date, timeZone);
    const regularizations = this.store.pgPool
      ? await this.employeeDayRegularizationsPostgres(companyId, actor.id, date)
      : this.employeeDayRegularizationsInMemory(companyId, actor.id, date);
    const workSiteLabels = this.store.pgPool
      ? await this.employeeDayWorkSiteLabels(companyId, actor.id, date, timeZone)
      : new Map<UUID, SafeGeoWorkSiteLabel>();
    const events = this.store.pgPool
      ? await this.employeeDayEventsPostgres(
          companyId,
          actor.id,
          date,
          timeZone,
          regularizations,
          workSiteLabels,
        )
      : this.employeeDayEventsInMemory(
          companyId,
          actor.id,
          date,
          timeZone,
          regularizations,
        );

    return {
      generated_at: nowIso(),
      date,
      day: this.presentEmployeeEvidenceDay(day, timeZone),
      summary_sources: this.employeeSummarySources(day, events, regularizations),
      events,
      regularizations: regularizations.map((bundle) =>
        this.presentEmployeeEvidenceRegularization(bundle),
      ),
    };
  }

  private presentEmployeeEvidenceDay(
    day: AttendanceDayRecord,
    timeZone: string,
  ): EmployeeAttendanceDayEvidence["day"] {
    return {
      work_date: day.work_date,
      status: day.status,
      day_classification: day.day_classification,
      presence_state: day.presence_state,
      punctuality_state: day.punctuality_state,
      evidence_state: day.evidence_state,
      approval_kind: day.approval_kind,
      approval_state: day.approval_state,
      payroll_state: day.payroll_state,
      regularization_status: day.regularization_status,
      in_time: timeText(day.first_check_in, timeZone),
      out_time: timeText(day.last_check_out, timeZone),
      hours: minutesToHours(day.work_minutes),
      work_minutes: day.work_minutes,
      break_minutes: day.break_minutes,
      detail: this.exceptionDetail(day),
    };
  }

  private async employeeDayEventsPostgres(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
    regularizations: EmployeeDayRegularizationBundle[],
    workSiteLabels: Map<UUID, SafeGeoWorkSiteLabel>,
  ): Promise<EmployeeAttendanceEvidenceEvent[]> {
    if (!this.store.pgPool) return [];
    const result = await this.store.pgPool.query<EmployeeDayEvidenceEventRow>(
      `SELECT
          event.event_type AS event_type,
          event.source AS event_source,
          event.occurred_at AS event_occurred_at,
          punch.id AS punch_id,
          punch.event_type AS punch_event_type,
          punch.source AS punch_source,
          punch.origin AS punch_origin,
          punch.work_mode AS punch_work_mode,
          punch.regularization_request_id AS punch_regularization_request_id,
          command_decision.outcome AS command_outcome,
          command_decision.reason_code AS command_reason_code,
          command_decision.reason_detail AS command_reason_detail,
          command_decision.evidence_snapshot AS command_evidence_snapshot,
          audit_decision.outcome AS audit_outcome,
          audit_decision.decision_type AS audit_decision_type,
          audit_decision.evaluation_context AS audit_evaluation_context,
          COALESCE(
            array_agg(reason.reason_code ORDER BY reason.ordinal)
              FILTER (WHERE reason.reason_code IS NOT NULL),
            ARRAY[]::text[]
          ) AS audit_reason_codes
         FROM attendance.attendance_events event
         LEFT JOIN attendance.punch_events punch
           ON punch.company_id = event.company_id
          AND punch.command_execution_id = event.command_execution_id
          AND punch.deleted_at IS NULL
         LEFT JOIN attendance.command_decisions command_decision
           ON command_decision.company_id = event.company_id
          AND command_decision.command_execution_id = event.command_execution_id
         LEFT JOIN attendance.attendance_decisions audit_decision
           ON audit_decision.company_id = event.company_id
          AND audit_decision.attendance_event_id = event.id
         LEFT JOIN attendance.decision_reasons reason
           ON reason.company_id = event.company_id
          AND reason.attendance_decision_id = audit_decision.id
        WHERE event.company_id = $1
          AND event.employee_user_id = $2
          AND to_char(event.occurred_at AT TIME ZONE $3, 'YYYY-MM-DD') = $4
        GROUP BY
          event.event_type,
          event.source,
          event.occurred_at,
          punch.id,
          punch.event_type,
          punch.source,
          punch.origin,
          punch.work_mode,
          punch.regularization_request_id,
          command_decision.outcome,
          command_decision.reason_code,
          command_decision.reason_detail,
          command_decision.evidence_snapshot,
          audit_decision.outcome,
          audit_decision.decision_type,
          audit_decision.evaluation_context
        ORDER BY event.occurred_at ASC, event.event_type ASC`,
      [companyId, employeeUserId, timeZone, workDate],
    );
    return result.rows.map((row) =>
      this.presentEmployeeEvidenceEventFromRow(
        row,
        timeZone,
        regularizations,
        workSiteLabels,
      ),
    );
  }

  private employeeDayEventsInMemory(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
    regularizations: EmployeeDayRegularizationBundle[],
  ): EmployeeAttendanceEvidenceEvent[] {
    return this.store.attendancePunches
      .filter(
        (punch) =>
          punch.company_id === companyId &&
          punch.employee_user_id === employeeUserId &&
          !punch.deleted_at &&
          dateInTimeZone(punch.occurred_at, timeZone) === workDate,
      )
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
      .map((punch) => ({
        event_type: punch.event_type,
        occurred_at: punch.occurred_at,
        time: timeText(punch.occurred_at, timeZone),
        source: punch.source,
        origin: punch.origin,
        work_mode: punch.work_mode,
        decision: null,
        geo: null,
        regularization: this.employeeEventRegularization(
          punch.id,
          punch.regularization_request_id,
          regularizations,
        ),
      }));
  }

  private async employeeDayRegularizationsPostgres(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
  ): Promise<EmployeeDayRegularizationBundle[]> {
    if (!this.store.pgPool) return [];
    const requests = (
      await this.store.pgPool.query<EmployeeDayRegularizationRow>(
        `SELECT id, status, reason, created_at, updated_at, decided_at
           FROM attendance.regularization_requests
          WHERE company_id = $1
            AND employee_user_id = $2
            AND work_date = $3::date
            AND deleted_at IS NULL
          ORDER BY created_at ASC, id ASC`,
        [companyId, employeeUserId, workDate],
      )
    ).rows;
    if (requests.length === 0) return [];
    const requestIds = requests.map((request) => request.id);
    const items = (
      await this.store.pgPool.query<EmployeeDayRegularizationItemRow>(
        `SELECT regularization_request_id, id, ordinal, operation,
                target_punch_event_id, event_type, occurred_at
           FROM attendance.regularization_request_items
          WHERE company_id = $1
            AND regularization_request_id = ANY($2::uuid[])
          ORDER BY regularization_request_id ASC, ordinal ASC`,
        [companyId, requestIds],
      )
    ).rows;
    const applications = (
      await this.store.pgPool.query<EmployeeDayRegularizationApplicationRow>(
        `SELECT regularization_request_id, regularization_request_item_id,
                operation, target_punch_event_id, replacement_punch_event_id,
                applied_at
           FROM attendance.regularization_correction_applications
          WHERE company_id = $1
            AND regularization_request_id = ANY($2::uuid[])
          ORDER BY regularization_request_id ASC, applied_at ASC`,
        [companyId, requestIds],
      )
    ).rows;
    return requests.map((request) => ({
      request,
      items: items.filter((item) => item.regularization_request_id === request.id),
      applications: applications.filter(
        (application) => application.regularization_request_id === request.id,
      ),
    }));
  }

  private employeeDayRegularizationsInMemory(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
  ): EmployeeDayRegularizationBundle[] {
    return this.store.attendanceRegularizations
      .filter(
        (request) =>
          request.company_id === companyId &&
          request.employee_user_id === employeeUserId &&
          request.work_date === workDate &&
          !request.deleted_at,
      )
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((request) => ({
        request: {
          id: request.id,
          status: request.status,
          reason: request.reason,
          created_at: request.created_at,
          updated_at: request.updated_at,
          decided_at: request.decided_at,
        },
        items: request.items.map((item) => ({
          regularization_request_id: request.id,
          id: item.id,
          ordinal: item.ordinal,
          operation: item.operation,
          target_punch_event_id: item.target_punch_event_id,
          event_type: item.event_type,
          occurred_at: item.occurred_at,
        })),
        applications: this.store.attendanceRegularizationCorrectionApplications
          .filter(
            (application) =>
              application.company_id === companyId &&
              application.regularization_request_id === request.id,
          )
          .map((application) => ({
            regularization_request_id: application.regularization_request_id,
            regularization_request_item_id: application.regularization_request_item_id,
            operation: application.operation,
            target_punch_event_id: application.target_punch_event_id,
            replacement_punch_event_id: application.replacement_punch_event_id,
            applied_at: application.applied_at,
          })),
      }));
  }

  private async employeeDayWorkSiteLabels(
    companyId: UUID,
    employeeUserId: UUID,
    workDate: string,
    timeZone: string,
  ): Promise<Map<UUID, SafeGeoWorkSiteLabel>> {
    if (!this.store.pgPool) return new Map();
    const result = await this.store.pgPool.query<{ work_site_id: UUID | null }>(
      `SELECT DISTINCT COALESCE(
          audit_decision.evaluation_context #>> '{geo_policy,work_site_id}',
          command_decision.evidence_snapshot #>> '{geo_policy,work_site_id}'
        )::uuid AS work_site_id
         FROM attendance.attendance_events event
         LEFT JOIN attendance.command_decisions command_decision
           ON command_decision.company_id = event.company_id
          AND command_decision.command_execution_id = event.command_execution_id
         LEFT JOIN attendance.attendance_decisions audit_decision
           ON audit_decision.company_id = event.company_id
          AND audit_decision.attendance_event_id = event.id
        WHERE event.company_id = $1
          AND event.employee_user_id = $2
          AND to_char(event.occurred_at AT TIME ZONE $3, 'YYYY-MM-DD') = $4
          AND COALESCE(
            audit_decision.evaluation_context #>> '{geo_policy,work_site_id}',
            command_decision.evidence_snapshot #>> '{geo_policy,work_site_id}'
          ) IS NOT NULL`,
      [companyId, employeeUserId, timeZone, workDate],
    );
    const workSiteIds = result.rows
      .map((row) => row.work_site_id)
      .filter((id): id is UUID => Boolean(id));
    if (workSiteIds.length === 0) return new Map();
    const labels = await this.store.pgPool.query<{
      id: UUID;
      name: string;
      site_type: string | null;
    }>(
      `SELECT id, name, site_type
         FROM attendance.work_sites
        WHERE company_id = $1
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL`,
      [companyId, workSiteIds],
    );
    return new Map(
      labels.rows.map((row) => [
        row.id,
        { name: row.name, site_type: row.site_type },
      ]),
    );
  }

  private presentEmployeeEvidenceEventFromRow(
    row: EmployeeDayEvidenceEventRow,
    timeZone: string,
    regularizations: EmployeeDayRegularizationBundle[],
    workSiteLabels: Map<UUID, SafeGeoWorkSiteLabel>,
  ): EmployeeAttendanceEvidenceEvent {
    const occurredAt = isoDateValue(row.event_occurred_at) ?? "";
    const geoPolicy = this.employeeGeoPolicyFromRow(row);
    return {
      event_type: row.punch_event_type ?? row.event_type,
      occurred_at: occurredAt,
      time: timeText(occurredAt, timeZone),
      source: row.punch_source ?? row.event_source,
      origin: row.punch_origin,
      work_mode: row.punch_work_mode,
      decision: this.employeeDecisionFromRow(row, geoPolicy),
      geo: this.employeeGeoEvidence(geoPolicy, workSiteLabels),
      regularization: this.employeeEventRegularization(
        row.punch_id,
        row.punch_regularization_request_id,
        regularizations,
      ),
    };
  }

  private employeeDecisionFromRow(
    row: EmployeeDayEvidenceEventRow,
    geoPolicy: Record<string, unknown>,
  ): EmployeeAttendanceEvidenceDecision | null {
    const reasonCodes = uniqueStrings([
      ...(row.audit_reason_codes ?? []),
      row.command_reason_code,
      stringField(geoPolicy.reason_code),
    ]);
    const outcome = row.command_outcome ?? row.audit_outcome;
    if (!outcome && reasonCodes.length === 0) return null;
    return {
      outcome: outcome ?? "recorded",
      reason_codes: reasonCodes,
      reason: row.command_reason_detail,
    };
  }

  private employeeGeoPolicyFromRow(
    row: EmployeeDayEvidenceEventRow,
  ): Record<string, unknown> {
    const auditGeo = recordField(row.audit_evaluation_context, "geo_policy");
    if (Object.keys(auditGeo).length > 0) return auditGeo;
    return recordField(row.command_evidence_snapshot, "geo_policy");
  }

  private employeeGeoEvidence(
    geoPolicy: Record<string, unknown>,
    workSiteLabels: Map<UUID, SafeGeoWorkSiteLabel>,
  ): EmployeeAttendanceEvidenceGeo | null {
    const outcome = stringField(geoPolicy.factual_outcome);
    const reasonCode = stringField(geoPolicy.reason_code);
    const selectedAction = stringField(geoPolicy.selected_action);
    const workSiteId = stringField(geoPolicy.work_site_id) as UUID | null;
    const workSite = workSiteId ? workSiteLabels.get(workSiteId) ?? null : null;
    if (!outcome && !reasonCode && !selectedAction && !workSite) return null;
    return {
      outcome,
      reason_code: reasonCode,
      selected_action: selectedAction,
      work_site_name: workSite?.name ?? null,
      work_site_type: workSite?.site_type ?? null,
    };
  }

  private employeeEventRegularization(
    punchEventId: UUID | null,
    regularizationRequestId: UUID | null,
    regularizations: EmployeeDayRegularizationBundle[],
  ): EmployeeAttendanceEvidenceRegularization | null {
    for (const bundle of regularizations) {
      const directRequestMatch =
        regularizationRequestId && bundle.request.id === regularizationRequestId;
      const application = punchEventId
        ? bundle.applications.find(
            (candidate) =>
              candidate.target_punch_event_id === punchEventId ||
              candidate.replacement_punch_event_id === punchEventId,
          )
        : undefined;
      if (!directRequestMatch && !application) continue;
      const item = application
        ? bundle.items.find(
            (candidate) => candidate.id === application.regularization_request_item_id,
          )
        : bundle.items[0];
      const operation = application?.operation ?? item?.operation ?? null;
      const relationship =
        application?.replacement_punch_event_id === punchEventId
          ? "replacement"
          : application?.target_punch_event_id === punchEventId &&
              operation === "void"
            ? "voided"
            : application?.target_punch_event_id === punchEventId
              ? "corrected_original"
              : operation === "add"
                ? "added"
                : "request";
      return {
        status: bundle.request.status,
        operation,
        relationship,
        reason: bundle.request.reason,
        decided_at: isoDateValue(bundle.request.decided_at),
        applied_at: isoDateValue(application?.applied_at),
      };
    }
    return null;
  }

  private presentEmployeeEvidenceRegularization(
    bundle: EmployeeDayRegularizationBundle,
  ): EmployeeAttendanceEvidenceRegularizationRequest {
    return {
      status: bundle.request.status,
      reason: bundle.request.reason,
      created_at: isoDateValue(bundle.request.created_at),
      updated_at: isoDateValue(bundle.request.updated_at),
      decided_at: isoDateValue(bundle.request.decided_at),
      operations: uniqueStrings(bundle.items.map((item) => item.operation)),
      items: bundle.items.map((item) => {
        const application = bundle.applications.find(
          (candidate) => candidate.regularization_request_item_id === item.id,
        );
        return {
          operation: item.operation,
          event_type: item.event_type,
          occurred_at: isoDateValue(item.occurred_at),
          relationship: application ? "applied" : "requested",
        };
      }),
    };
  }

  private employeeSummarySources(
    day: AttendanceDayRecord,
    events: EmployeeAttendanceEvidenceEvent[],
    regularizations: EmployeeDayRegularizationBundle[],
  ): EmployeeAttendanceSummarySource[] {
    const sources = new Map<
      EmployeeAttendanceSummarySourceType,
      EmployeeAttendanceSummarySource
    >();
    for (const event of events) {
      const sourceType = this.employeeSummarySourceType(event);
      if (!sourceType) continue;
      sources.set(sourceType, {
        type: sourceType,
        label: this.employeeSummarySourceLabel(sourceType),
      });
    }
    if (regularizations.some((bundle) => bundle.applications.length > 0)) {
      sources.set("approved_regularization", {
        type: "approved_regularization",
        label: this.employeeSummarySourceLabel("approved_regularization"),
      });
    }
    if (
      sources.size === 0 &&
      (day.status !== "future" ||
        day.presence_state !== AttendancePresenceStates.NotStarted)
    ) {
      sources.set("system_daily_summary", {
        type: "system_daily_summary",
        label: this.employeeSummarySourceLabel("system_daily_summary"),
      });
    }
    return [...sources.values()];
  }

  private employeeSummarySourceType(
    event: EmployeeAttendanceEvidenceEvent,
  ): EmployeeAttendanceSummarySourceType | null {
    if (
      event.decision?.outcome === "denied" ||
      event.decision?.outcome === "failed"
    ) {
      return null;
    }
    if (
      event.regularization?.relationship === "corrected_original" ||
      event.regularization?.relationship === "voided"
    ) {
      return null;
    }
    if (
      event.regularization?.relationship === "replacement" ||
      event.regularization?.relationship === "added" ||
      event.origin === "approved_regularization"
    ) {
      return "approved_regularization";
    }
    if (event.origin === "historical_correction") return "historical_correction";
    if (event.origin === "manager_assisted_now" || event.source === "admin") {
      return "manager_assisted_punch";
    }
    if (event.origin === "system" || event.source === "auto_geofence") {
      return "system_daily_summary";
    }
    if (event.source || event.origin === "employee_manual_now") {
      return "employee_punch";
    }
    return null;
  }

  private employeeSummarySourceLabel(
    type: EmployeeAttendanceSummarySourceType,
  ): string {
    if (type === "approved_regularization") return "Approved regularization";
    if (type === "historical_correction") return "Historical correction";
    if (type === "manager_assisted_punch") return "Assisted attendance punch";
    if (type === "system_daily_summary") return "Daily attendance processing";
    return "Employee attendance punch";
  }

  private presentPunch(punch: AttendancePunch, timeZone: string) {
    return {
      ...punch,
      work_date: dateInTimeZone(punch.occurred_at, timeZone),
      time: timeText(punch.occurred_at, timeZone),
    };
  }

  private presentDay(day: AttendanceDayRecord, timeZone: string) {
    return {
      ...day,
      reporting_evidence_category: this.reportingEvidenceCategory(day),
      in_time: timeText(day.first_check_in, timeZone),
      out_time: timeText(day.last_check_out, timeZone),
      hours: minutesToHours(day.work_minutes),
      break_hours: minutesToHours(day.break_minutes),
      detail: this.exceptionDetail(day),
    };
  }

  private presentRegularization(request: AttendanceRegularizationRequest) {
    const user = this.store.users.find(
      (candidate) => candidate.id === request.employee_user_id,
    );
    const approver = request.current_approver_user_id
      ? this.store.users.find(
          (candidate) => candidate.id === request.current_approver_user_id,
        )
      : undefined;
    const items = [...request.items].sort((left, right) => left.ordinal - right.ordinal);
    return {
      ...request,
      items,
      requested_punches: items.flatMap((item) =>
        item.event_type && item.occurred_at
          ? [{ event_type: item.event_type, occurred_at: item.occurred_at }]
          : [],
      ),
      employee: userLabel(user),
      approver: approver ? userLabel(approver) : null,
    };
  }

  private presentGeoFallbackReview(
    request: AttendanceGeoFallbackReview,
    workSiteLabels = new Map<UUID, SafeGeoWorkSiteLabel>(),
    exactLocationAccessState: ExactAttendanceLocationAccessState = "unavailable",
  ) {
    const user = this.store.users.find(
      (candidate) => candidate.id === request.employee_user_id,
    );
    const approver = request.current_approver_user_id
      ? this.store.users.find(
          (candidate) => candidate.id === request.current_approver_user_id,
        )
      : undefined;
    const reviewType = geoReviewType(request);
    const outcome = geoFactualOutcome(request);
    return {
      id: request.id,
      kind: "geo_fallback",
      review_type: reviewType,
      geo_outcome: outcome,
      employee_user_id: request.employee_user_id,
      employee: userLabel(user),
      employee_name: userLabel(user).full_name,
      employee_code: userLabel(user).employee_code,
      work_date: request.work_date,
      reason: request.reason_detail ?? "Manual attendance fallback after location verification failed.",
      status: request.status,
      version: request.version,
      current_approver_user_id: request.current_approver_user_id,
      approver: approver ? userLabel(approver) : null,
      decision_remarks: request.decision_remarks,
      decided_by_user_id: request.decided_by_user_id,
      decided_at: request.decided_at,
      created_at: request.created_at,
      updated_at: request.updated_at,
      items: [
        {
          id: `${request.id}:fallback`,
          ordinal: 0,
          operation: "add",
          target_punch_event_id: null,
          event_type: request.event_type,
          occurred_at: request.occurred_at,
        },
      ],
      geo_evidence_summary: {
        ...safeGeoEvidenceSummary(request, workSiteLabels),
      },
      exact_location_access: {
        state: exactLocationAccessState,
      },
      manual_fallback: {
        original_command_id: request.original_command_id,
        original_decision_id: request.original_decision_id,
        fallback_command_id: request.fallback_command_id,
        punch_event_id: request.punch_event_id,
      },
    };
  }

  private presentException(
    record: AttendanceDayRecord,
    request: AttendanceRegularizationRequest | undefined,
    actor: AuthUser,
  ) {
    const user = this.store.users.find(
      (candidate) => candidate.id === record.employee_user_id,
    );
    const exceptionType = request ? "correction" : record.exception_type;
    return {
      id: request?.id ?? record.id,
      request_id: request?.id ?? null,
      employee_user_id: record.employee_user_id,
      employee: userLabel(user).full_name,
      employee_code: userLabel(user).employee_code,
      date: record.work_date,
      exception_type: exceptionType,
      detail: request?.reason ?? this.exceptionDetail(record),
      status: request?.status ?? record.regularization_status ?? "pending",
      expected_version: request?.version ?? record.version,
      can_decide: Boolean(
        request &&
        request.status === AttendanceRegularizationStatuses.Pending &&
        actor.id !== request.employee_user_id &&
        (canSeeAllAttendance(actor) ||
          request.current_approver_user_id === actor.id),
      ),
      record: this.presentDay(
        record,
        this.timezoneForUser(record.employee_user_id, record.company_id),
      ),
      request: request ? this.presentRegularization(request) : null,
    };
  }

  private exceptionDetail(
    record: Pick<
      AttendanceDayRecord,
      | "exception_type"
      | "late_minutes"
      | "early_out_minutes"
      | "work_minutes"
      | "note"
    >,
  ): string {
    if (record.exception_type === "late") {
      return `Late by ${minutesToText(record.late_minutes)}`;
    }
    if (record.exception_type === "early_out") {
      return `Early out by ${minutesToText(record.early_out_minutes)}`;
    }
    if (record.note) {
      return record.note;
    }
    if (record.exception_type === "missing_punch") {
      return "Missing punch-out";
    }
    if (record.exception_type === "absent") {
      return "No punch-in recorded";
    }
    return record.work_minutes > 0
      ? minutesToHours(record.work_minutes)
      : "No attendance for this day";
  }
}

function datesInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function textFilter(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
const memoryHistoricalCorrectionIdempotency = new WeakMap<
  MemoryDataStore,
  Map<string, { requestHash: string; response: Record<string, unknown> }>
>();
