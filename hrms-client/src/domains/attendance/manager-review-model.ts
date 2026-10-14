import type {
  AttendanceExactLocationAccessState,
  AttendanceGeoFactualOutcome,
  AttendanceGeoReviewType,
  AttendancePunchEventType,
} from "./api";
import {
  regularizationItemDisplay,
  regularizationItemDisplays,
  type RegularizationItemDisplay,
} from "./regularization-form-model";

export type AttendanceReviewStatus = "pending" | "approved" | "returned" | "rejected";
export type AttendanceReviewDecision = "approve" | "return" | "reject";
export type AttendanceReviewOperation = "add" | "replace" | "void";

export interface AttendanceReviewEvidence {
  id: string;
  operation: AttendanceReviewOperation | "geo";
  title: string;
  detail: string | null;
  detailLines: string[];
  occurredAt: string | null;
}

export type AttendanceReviewRegularizationItem = RegularizationItemDisplay;

export interface AttendanceReviewExactLocationAccess {
  state: AttendanceExactLocationAccessState;
}

export interface AttendanceReviewRequest {
  id: string;
  kind: "regularization" | "geo_fallback";
  employeeName: string;
  employeeCode: string;
  workDate: string;
  reason: string;
  status: AttendanceReviewStatus;
  version: number;
  createdAt: string | null;
  decidedAt: string | null;
  decisionRemarks: string | null;
  regularizationItems: AttendanceReviewRegularizationItem[];
  evidence: AttendanceReviewEvidence[];
  geoReviewType: AttendanceGeoReviewType | null;
  geoOutcome: AttendanceGeoFactualOutcome | null;
  exactLocationAccess: AttendanceReviewExactLocationAccess;
  canDecide: boolean;
  allowedDecisions: AttendanceReviewDecision[];
}

export interface AttendanceReviewQueue {
  items: AttendanceReviewRequest[];
  counts: Record<AttendanceReviewStatus | "total", number>;
  page: number;
  pageSize: number;
  total: number;
}

const REVIEW_STATUSES = new Set<AttendanceReviewStatus>([
  "pending",
  "approved",
  "returned",
  "rejected",
]);

const REVIEW_OPERATIONS = new Set<AttendanceReviewOperation>(["add", "replace", "void"]);
const REVIEW_DECISIONS = new Set<AttendanceReviewDecision>(["approve", "return", "reject"]);
const DEFAULT_REVIEW_DECISIONS: AttendanceReviewDecision[] = ["approve", "return", "reject"];

const GEO_OUTCOMES = new Set<AttendanceGeoFactualOutcome>([
  "not_required",
  "inside_confident",
  "outside_confident",
  "boundary_uncertain",
  "stale_evidence",
  "accuracy_exceeded",
  "missing",
  "permission_denied",
  "location_unavailable",
  "fence_not_configured",
]);

const GEO_REVIEW_TYPES = new Set<AttendanceGeoReviewType>(["manual_fallback", "geo_decision"]);

const EXACT_LOCATION_ACCESS_STATES = new Set<AttendanceExactLocationAccessState>([
  "available_authorized",
  "available_restricted",
  "unavailable",
]);

const GEO_REASON_CODES = new Set([
  "geo_not_required",
  "geo_evidence_missing",
  "geo_permission_denied",
  "geo_location_unavailable",
  "geo_fence_not_configured",
  "geo_inside_fence",
  "geo_outside_fence",
  "geo_boundary_uncertain",
  "geo_stale_evidence",
  "geo_accuracy_exceeded",
  "geo_policy_mode_unknown",
  "geo_action_unknown",
  "geo_manual_fallback_allowed",
  "geo_manual_fallback_disallowed",
]);

export const GEO_OUTCOME_FILTER_OPTIONS: Array<{
  value: AttendanceGeoFactualOutcome;
  label: string;
}> = [
  { value: "outside_confident", label: "Outside - confident" },
  { value: "boundary_uncertain", label: "Boundary uncertain" },
  { value: "stale_evidence", label: "Evidence stale" },
];

export const GEO_REVIEW_TYPE_OPTIONS: Array<{
  value: AttendanceGeoReviewType;
  label: string;
}> = [{ value: "manual_fallback", label: "Manual fallback" }];

export function geoOutcomeLabel(value: AttendanceGeoFactualOutcome | null): string {
  if (value === "outside_confident") return "Outside - confident";
  if (value === "boundary_uncertain") return "Boundary uncertain";
  if (value === "stale_evidence") return "Evidence stale";
  if (value === "inside_confident") return "Inside - confident";
  if (value === "accuracy_exceeded") return "Accuracy insufficient";
  if (value === "missing") return "Location missing";
  if (value === "permission_denied") return "Permission denied";
  if (value === "location_unavailable") return "Location unavailable";
  if (value === "fence_not_configured") return "Work area unavailable";
  if (value === "not_required") return "Location not required";
  return "Location evidence";
}

export function geoOutcomeDescription(value: AttendanceGeoFactualOutcome | null): string {
  if (value === "outside_confident") {
    return "The reported location was outside the configured attendance boundary with sufficient confidence.";
  }
  if (value === "boundary_uncertain") {
    return "Location accuracy overlaps the configured work-area boundary.";
  }
  if (value === "stale_evidence") {
    return "The location evidence was older than the allowed policy threshold.";
  }
  return "Location verification needs manager review.";
}

export function geoReviewTypeLabel(value: AttendanceGeoReviewType | null): string {
  if (value === "manual_fallback") return "Manual fallback";
  if (value === "geo_decision") return "Geo decision";
  return "Geo review";
}

export function attendanceActionLabel(value: AttendancePunchEventType | string | null): string {
  if (value === "check_in") return "Check-in";
  if (value === "break_start") return "Break start";
  if (value === "break_end") return "Break end";
  if (value === "check_out") return "Check-out";
  return humanizeToken(value, "Attendance action");
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  const parsed = stringValue(value).trim();
  return parsed || null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function isoDateTime(value: unknown): string | null {
  const parsed = nullableString(value);
  if (!parsed || Number.isNaN(Date.parse(parsed))) return null;
  return parsed;
}

function humanizeToken(value: unknown, fallback: string): string {
  const token = stringValue(value)
    .trim()
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9_-]+/gu, " ")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!token) return fallback;
  return token.replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function reviewStatus(value: unknown): AttendanceReviewStatus {
  const status = stringValue(value).toLowerCase() as AttendanceReviewStatus;
  return REVIEW_STATUSES.has(status) ? status : "pending";
}

function operation(value: unknown): AttendanceReviewOperation {
  const parsed = stringValue(value).toLowerCase() as AttendanceReviewOperation;
  return REVIEW_OPERATIONS.has(parsed) ? parsed : "add";
}

function operationEvidence(itemValue: unknown, index: number): AttendanceReviewEvidence {
  const item = record(itemValue);
  const display = regularizationItemDisplay(item, index);
  const itemOperation = operation(display.operation);
  const occurredAt = isoDateTime(item.occurred_at);
  const detailLines = [
    display.targetPunchLabel ? `Original: ${display.targetPunchLabel}` : null,
    display.requestedPunchLabel ? `Requested: ${display.requestedPunchLabel}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    id: stringValue(item.id, `item-${index + 1}`),
    operation: itemOperation,
    title: display.operationLabel,
    detail:
      display.helperText ??
      (itemOperation !== "void" && !occurredAt ? "Requested time was not supplied." : null),
    detailLines,
    occurredAt,
  };
}

function legacyPunchEvidence(itemValue: unknown, index: number): AttendanceReviewEvidence {
  const item = record(itemValue);
  const display = regularizationItemDisplay(
    {
      id: `legacy-${index + 1}`,
      ordinal: index,
      operation: "add",
      event_type: item.event_type,
      occurred_at: item.occurred_at,
    },
    index,
  );
  return {
    id: `legacy-${index + 1}`,
    operation: "add",
    title: display.operationLabel,
    detail: null,
    detailLines: display.requestedPunchLabel ? [`Requested: ${display.requestedPunchLabel}`] : [],
    occurredAt: isoDateTime(item.occurred_at),
  };
}

function meters(value: unknown): string | null {
  const parsed = nullableNumber(value);
  if (parsed === null) return null;
  return `${Math.round(parsed)} m`;
}

function duration(value: unknown): string | null {
  const parsed = nullableNumber(value);
  if (parsed === null) return null;
  if (parsed < 1000) return `${Math.round(parsed)} ms`;
  if (parsed < 60_000) return `${Math.round(parsed / 1000)} sec`;
  return `${Math.round(parsed / 60_000)} min`;
}

function geoDetailLines(summary: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const accuracy = meters(summary.accuracy_meters);
  if (accuracy) lines.push(`Reported accuracy: ${accuracy}`);
  const maxAccuracy = meters(summary.max_accuracy_meters);
  if (maxAccuracy) lines.push(`Allowed accuracy: ${maxAccuracy}`);
  const age = duration(summary.evidence_age_ms);
  if (age) lines.push(`Evidence age: ${age}`);
  const maxAge = duration(summary.max_location_age_ms);
  if (maxAge) lines.push(`Allowed age: ${maxAge}`);
  const signedMargin = meters(summary.signed_margin_meters);
  if (signedMargin) lines.push(`Boundary margin: ${signedMargin}`);
  const boundaryDistance = meters(summary.boundary_distance_meters);
  if (boundaryDistance) lines.push(`Boundary distance: ${boundaryDistance}`);
  const distance = meters(summary.distance_meters);
  if (distance) lines.push(`Distance: ${distance}`);
  const grace = meters(summary.grace_meters);
  if (grace) lines.push(`Grace distance: ${grace}`);
  const workSite = nullableString(summary.work_site_name);
  if (workSite) lines.push(`Work site: ${workSite}`);
  return lines;
}

function geoReviewType(value: unknown): AttendanceGeoReviewType | null {
  const parsed = stringValue(value).toLowerCase() as AttendanceGeoReviewType;
  return GEO_REVIEW_TYPES.has(parsed) ? parsed : null;
}

function geoOutcome(value: unknown): AttendanceGeoFactualOutcome | null {
  const parsed = stringValue(value).toLowerCase() as AttendanceGeoFactualOutcome;
  return GEO_OUTCOMES.has(parsed) ? parsed : null;
}

function safeGeoEvidence(row: Record<string, unknown>): AttendanceReviewEvidence | null {
  const summary = record(row.geo_evidence_summary ?? row.evidence_summary);
  const source = stringValue(summary.source ?? summary.method).toLowerCase();
  const rawOutcome = stringValue(summary.outcome).toLowerCase();
  const rawReasonCode = stringValue(summary.reason_code).toLowerCase();
  const outcome = geoOutcome(rawOutcome);
  const reasonCode = GEO_REASON_CODES.has(rawReasonCode) ? rawReasonCode : null;
  const reviewType = geoReviewType(summary.review_type);
  const action = attendanceActionLabel(nullableString(summary.attendance_action));

  if (!outcome && !reasonCode && source !== "geo" && source !== "location") return null;

  return {
    id: "geo-summary",
    operation: "geo",
    title: `${geoOutcomeLabel(outcome)}${reviewType ? ` - ${geoReviewTypeLabel(reviewType)}` : ""}`,
    detail:
      nullableString(summary.reason) ??
      (reasonCode ? `Reason: ${humanizeToken(reasonCode, "Not specified")}` : null),
    detailLines: [
      `Action: ${action}`,
      reasonCode ? `Reason code: ${reasonCode}` : null,
      geoOutcomeDescription(outcome),
      ...geoDetailLines(summary),
    ].filter((line): line is string => Boolean(line)),
    occurredAt: isoDateTime(summary.captured_at ?? summary.event_time),
  };
}

function exactLocationAccess(value: unknown): AttendanceReviewExactLocationAccess {
  const state = stringValue(
    record(value).state,
  ).toLowerCase() as AttendanceExactLocationAccessState;
  return {
    state: EXACT_LOCATION_ACCESS_STATES.has(state) ? state : "unavailable",
  };
}

function reviewEvidence(row: Record<string, unknown>): AttendanceReviewEvidence[] {
  const normalizedItems = array(row.items);
  const corrections =
    normalizedItems.length > 0
      ? [...normalizedItems]
          .sort(
            (left, right) =>
              numberValue(record(left).ordinal, Number.MAX_SAFE_INTEGER) -
              numberValue(record(right).ordinal, Number.MAX_SAFE_INTEGER),
          )
          .map(operationEvidence)
      : array(row.requested_punches).map(legacyPunchEvidence);
  const geoEvidence = safeGeoEvidence(row);
  return geoEvidence ? [...corrections, geoEvidence] : corrections;
}

function legacyRegularizationItems(
  row: Record<string, unknown>,
): AttendanceReviewRegularizationItem[] {
  return regularizationItemDisplays(
    array(row.requested_punches).map((itemValue, index) => {
      const item = record(itemValue);
      return {
        id: `legacy-${index + 1}`,
        ordinal: index,
        operation: "add",
        event_type: item.event_type,
        occurred_at: item.occurred_at,
      };
    }),
  );
}

function reviewRegularizationItems(
  row: Record<string, unknown>,
): AttendanceReviewRegularizationItem[] {
  const normalizedItems = array(row.items);
  return normalizedItems.length > 0
    ? regularizationItemDisplays(normalizedItems.map(record))
    : legacyRegularizationItems(row);
}

function allowedDecisions(value: unknown): AttendanceReviewDecision[] {
  const unique = new Set<AttendanceReviewDecision>();
  for (const item of array(value)) {
    const decision = stringValue(item).toLowerCase() as AttendanceReviewDecision;
    if (REVIEW_DECISIONS.has(decision)) unique.add(decision);
  }
  return [...unique];
}

function reviewRequest(value: unknown): AttendanceReviewRequest | null {
  const row = record(value);
  const id = stringValue(row.id).trim();
  if (!id) return null;

  const employee = record(row.employee);
  const status = reviewStatus(row.status);
  const version = Math.max(0, Math.trunc(numberValue(row.version)));
  const summary = record(row.geo_evidence_summary ?? row.evidence_summary);
  const serverCanDecide = booleanValue(row.can_decide);
  const parsedAllowedDecisions = allowedDecisions(row.allowed_decisions);
  const fallbackCanDecide = status === "pending" && version > 0;
  const canDecide =
    status === "pending" &&
    (serverCanDecide ?? (parsedAllowedDecisions.length > 0 || fallbackCanDecide));
  const effectiveAllowedDecisions = canDecide
    ? parsedAllowedDecisions.length > 0
      ? parsedAllowedDecisions
      : DEFAULT_REVIEW_DECISIONS
    : [];
  const regularizationItems = reviewRegularizationItems(row);

  return {
    id,
    kind: stringValue(row.kind) === "geo_fallback" ? "geo_fallback" : "regularization",
    employeeName:
      stringValue(employee.full_name ?? row.employee_name ?? row.employee, "Unknown employee") ||
      "Unknown employee",
    employeeCode: stringValue(employee.employee_code ?? row.employee_code, "UNKNOWN") || "UNKNOWN",
    workDate: stringValue(row.work_date ?? row.date),
    reason: stringValue(row.reason, "No reason supplied."),
    status,
    version,
    createdAt: nullableString(row.created_at),
    decidedAt: nullableString(row.decided_at),
    decisionRemarks: nullableString(row.decision_remarks),
    regularizationItems,
    evidence: reviewEvidence(row),
    geoReviewType: geoReviewType(row.review_type ?? summary.review_type),
    geoOutcome: geoOutcome(row.geo_outcome ?? summary.outcome),
    exactLocationAccess: exactLocationAccess(row.exact_location_access),
    canDecide,
    allowedDecisions: effectiveAllowedDecisions,
  };
}

function count(value: unknown): number {
  return Math.max(0, Math.trunc(numberValue(value)));
}

export function parseAttendanceReviewQueue(value: unknown): AttendanceReviewQueue {
  const response = record(value);
  const items = array(response.items)
    .map(reviewRequest)
    .filter((item): item is AttendanceReviewRequest => item !== null);
  const counts = record(response.queue_counts);

  return {
    items,
    counts: {
      total: count(counts.total ?? response.total ?? items.length),
      pending: count(counts.pending),
      approved: count(counts.approved),
      returned: count(counts.returned),
      rejected: count(counts.rejected),
    },
    page: Math.max(1, Math.trunc(numberValue(response.page, 1))),
    pageSize: Math.max(1, Math.trunc(numberValue(response.page_size, 20))),
    total: count(response.total ?? items.length),
  };
}

export function attendanceDecisionRemarksError(
  decision: AttendanceReviewDecision,
  remarks: string,
): string | null {
  const trimmed = remarks.trim();
  if ((decision === "reject" || decision === "return") && !trimmed) {
    return "Remarks are required when rejecting or returning a request.";
  }
  if (trimmed.length > 1000) {
    return "Remarks cannot exceed 1,000 characters.";
  }
  return null;
}

export function formatAttendanceReviewDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (!value || Number.isNaN(parsed.getTime())) return value || "Not available";
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatAttendanceReviewDateTime(value: string | null): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
