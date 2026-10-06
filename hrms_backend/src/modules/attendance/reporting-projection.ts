import type {
  AttendanceDayRecord,
  AttendanceGeoFallbackReview,
  AttendancePunch,
  AttendancePunchSourceChannel,
  AttendanceRegularizationRequest,
  OutboxEvent,
  UUID,
} from "#shared";
import { AttendanceRegularizationStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import {
  deriveAttendanceReportingEvidenceCategory,
  type AttendanceReportingEvidenceCategory,
  type AttendanceReportingEvidenceSignals,
} from "./reporting-evidence.js";

export const AttendanceReportExportColumnValues = [
  "employee_code",
  "employee",
  "department",
  "date",
  "status",
  "work_mode",
  "in_time",
  "out_time",
  "hours",
  "reporting_evidence_category",
  "attendance_channels",
  "work_site_name",
  "work_site_type",
  "geo_outcome",
  "geo_action",
  "reason_codes",
  "review_required",
  "review_outcome",
] as const;

export type AttendanceReportExportColumn =
  (typeof AttendanceReportExportColumnValues)[number];

export const AttendanceReportExportColumnHeaders: Record<
  AttendanceReportExportColumn,
  string
> = {
  employee_code: "Employee Code",
  employee: "Employee",
  department: "Department",
  date: "Date",
  status: "Attendance Status",
  work_mode: "Work Mode",
  in_time: "In",
  out_time: "Out",
  hours: "Hours",
  reporting_evidence_category: "Evidence State",
  attendance_channels: "Channel",
  work_site_name: "Work Site",
  work_site_type: "Site Type",
  geo_outcome: "Geo Outcome",
  geo_action: "Geo Action",
  reason_codes: "Reason Codes",
  review_required: "Review Required",
  review_outcome: "Review Outcome",
};

export interface AttendanceReportEvidenceSummary {
  reporting_evidence_category: AttendanceReportingEvidenceCategory | null;
  attendance_channels: string[];
  work_site_name: string[];
  work_site_type: string[];
  geo_outcome: string[];
  geo_action: string[];
  reason_codes: string[];
  review_required: boolean;
  review_outcome: string[];
}

type ReasonSourceGroup =
  | "geo"
  | "offline_sync"
  | "mobile_warning"
  | "regularization-review";

interface OrderedValue {
  value: string;
  occurredAt: string;
  group: ReasonSourceGroup;
}

interface AttendanceMobileEvidenceWarningReportRecord {
  company_id: UUID;
  employee_user_id: UUID;
  work_date?: string | null;
  event_type?: string | null;
  source?: "mobile" | "mobile_foreground" | "mobile_offline" | string | null;
  captured_at?: string | Date | null;
  server_received_at?: string | Date | null;
  reason_code?: string | null;
  category?: string | null;
  evidence_status?: string | null;
  deleted_at?: string | Date | null;
}

type StoreWithReportEvidence = MemoryDataStore & {
  attendanceMobileEvidenceWarnings?: AttendanceMobileEvidenceWarningReportRecord[];
};

interface DayEvidenceBucket {
  punches: AttendancePunch[];
  reviews: AttendanceGeoFallbackReview[];
  provisionalEvents: OutboxEvent[];
  mobileWarnings: AttendanceMobileEvidenceWarningReportRecord[];
  regularizations: AttendanceRegularizationRequest[];
}

interface AttendanceReportEvidenceIndex {
  summaryFor(record: AttendanceDayRecord): AttendanceReportEvidenceSummary;
}

const EmptySummary: AttendanceReportEvidenceSummary = {
  reporting_evidence_category: null,
  attendance_channels: [],
  work_site_name: [],
  work_site_type: [],
  geo_outcome: [],
  geo_action: [],
  reason_codes: [],
  review_required: false,
  review_outcome: [],
};

const ReasonGroupOrder: Record<ReasonSourceGroup, number> = {
  geo: 0,
  offline_sync: 1,
  mobile_warning: 2,
  "regularization-review": 3,
};

const ReviewOutcomeOrder = new Map([
  ["pending", 0],
  ["returned", 1],
  ["approved", 2],
  ["rejected", 3],
]);

const DeviceEligibilityReasonCodes = new Set([
  "mobile_registered_device_required",
  "mobile_registered_device_revoked",
  "mobile_registered_device_suspended",
  "mobile_registered_device_unavailable",
]);

const IntegrityWarningReasonCodes = new Set([
  "mobile_replay.changed_body_conflict",
  "offline_sync.changed_body_conflict",
  "offline_sync.duplicate_sequence",
]);

export function buildAttendanceReportEvidenceIndex(
  store: MemoryDataStore,
  records: readonly AttendanceDayRecord[],
): AttendanceReportEvidenceIndex {
  const keys = new Set(records.map(recordKey));
  const buckets = new Map<string, DayEvidenceBucket>();

  for (const record of records) {
    buckets.set(recordKey(record), {
      punches: [],
      reviews: [],
      provisionalEvents: [],
      mobileWarnings: [],
      regularizations: [],
    });
  }

  for (const punch of store.attendancePunches) {
    if (punch.deleted_at) continue;
    const key = dayKey(punch.company_id, punch.employee_user_id, punch.occurred_at.slice(0, 10));
    if (keys.has(key)) buckets.get(key)?.punches.push(punch);
  }

  for (const review of store.attendanceGeoFallbackReviews) {
    if (review.deleted_at) continue;
    const key = dayKey(review.company_id, review.employee_user_id, review.work_date);
    if (keys.has(key)) buckets.get(key)?.reviews.push(review);
  }

  for (const event of store.outbox) {
    if (event.event_type !== "attendance.provisional.recorded") continue;
    const capturedAt = stringValue(event.payload.captured_at);
    const companyId = stringValue(event.payload.company_id) as UUID | null;
    const employeeUserId = stringValue(event.payload.subject_employee_user_id) as UUID | null;
    if (!capturedAt || !companyId || !employeeUserId) continue;
    const key = dayKey(companyId, employeeUserId, capturedAt.slice(0, 10));
    if (keys.has(key)) buckets.get(key)?.provisionalEvents.push(event);
  }

  for (const warning of (store as StoreWithReportEvidence).attendanceMobileEvidenceWarnings ?? []) {
    if (warning.deleted_at) continue;
    const occurredAt = isoValue(warning.captured_at) ?? isoValue(warning.server_received_at);
    const workDate = stringValue(warning.work_date) ?? occurredAt?.slice(0, 10);
    if (!workDate) continue;
    const key = dayKey(warning.company_id, warning.employee_user_id, workDate);
    if (keys.has(key)) buckets.get(key)?.mobileWarnings.push(warning);
  }

  for (const regularization of store.attendanceRegularizations) {
    if (regularization.deleted_at) continue;
    const key = dayKey(
      regularization.company_id,
      regularization.employee_user_id,
      regularization.work_date,
    );
    if (keys.has(key)) buckets.get(key)?.regularizations.push(regularization);
  }

  return {
    summaryFor(record) {
      const bucket = buckets.get(recordKey(record));
      return bucket ? summarizeDay(record, bucket) : { ...EmptySummary };
    },
  };
}

export function isAttendanceReportExportColumn(
  value: string,
): value is AttendanceReportExportColumn {
  return AttendanceReportExportColumnValues.includes(
    value as AttendanceReportExportColumn,
  );
}

export function attendanceReportExportHeaders(
  columns: readonly AttendanceReportExportColumn[],
): string[] {
  return columns.map((column) => AttendanceReportExportColumnHeaders[column]);
}

export function formatAttendanceReportExportValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean).join("; ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return value;
}

function summarizeDay(
  record: AttendanceDayRecord,
  bucket: DayEvidenceBucket,
): AttendanceReportEvidenceSummary {
  const channels: OrderedValue[] = [];
  const sites: OrderedValue[] = [];
  const siteTypes: OrderedValue[] = [];
  const geoOutcomes: OrderedValue[] = [];
  const geoActions: OrderedValue[] = [];
  const reasonCodes: OrderedValue[] = [];
  const reviewOutcomes: string[] = [];

  for (const punch of bucket.punches) {
    const label = channelLabelForPunch(punch);
    if (label) {
      channels.push(orderedValue(label, punch.occurred_at, "geo"));
    }
  }

  for (const review of bucket.reviews) {
    const policy = geoPolicyRecord(review);
    const occurredAt = review.occurred_at ?? review.created_at;
    pushString(reasonCodes, review.reason_code, occurredAt, "geo");
    pushString(geoOutcomes, geoFactualOutcome(policy), occurredAt, "geo");
    pushString(geoActions, geoSelectedAction(policy), occurredAt, "geo");
    pushString(sites, workSiteName(policy), occurredAt, "geo");
    pushString(siteTypes, workSiteType(policy), occurredAt, "geo");
    pushReviewOutcome(reviewOutcomes, review.status);
  }

  for (const event of bucket.provisionalEvents) {
    const capturedAt = stringValue(event.payload.captured_at) ?? event.created_at;
    channels.push(orderedValue("Mobile - captured offline", capturedAt, "offline_sync"));
    pushString(reasonCodes, event.payload.reason_code, capturedAt, "offline_sync");
  }

  for (const warning of bucket.mobileWarnings) {
    const occurredAt =
      isoValue(warning.captured_at) ?? isoValue(warning.server_received_at) ?? "";
    const label = channelLabelForSource(warning.source);
    if (label) channels.push(orderedValue(label, occurredAt, "mobile_warning"));
    pushString(reasonCodes, warning.reason_code, occurredAt, "mobile_warning");
  }

  for (const regularization of bucket.regularizations) {
    if (isActionableRegularization(regularization)) {
      const occurredAt = regularization.decided_at ?? regularization.updated_at;
      channels.push(orderedValue("Correction", occurredAt, "regularization-review"));
      pushString(
        reasonCodes,
        `regularization.${regularization.status}`,
        occurredAt,
        "regularization-review",
      );
      pushReviewOutcome(reviewOutcomes, regularization.status);
    }
  }

  const offlineStatuses = bucket.provisionalEvents.map((event) =>
    stringValue(event.payload.verification_status),
  );
  const hasAcceptedEvidence = hasAcceptedOrProvisionalEvidence(
    record,
    bucket,
    offlineStatuses,
  );
  const hasIntegrityWarning = bucket.mobileWarnings.some((warning) =>
    IntegrityWarningReasonCodes.has(stringValue(warning.reason_code) ?? ""),
  );
  const hasDeviceWarning = bucket.mobileWarnings.some((warning) =>
    DeviceEligibilityReasonCodes.has(stringValue(warning.reason_code) ?? ""),
  );
  const deviceWarningRejected = hasDeviceWarning && !hasAcceptedEvidence;
  const reviewRequired =
    bucket.reviews.some(isPendingOrReturned) ||
    bucket.regularizations.some(isPendingOrReturnedRegularization) ||
    offlineStatuses.includes("review_required");
  const signals: AttendanceReportingEvidenceSignals = {
    reviewRequired,
    operativeRejected:
      offlineStatuses.includes("rejected") || deviceWarningRejected,
    provisional: offlineStatuses.includes("unverified"),
    warning: hasIntegrityWarning || (hasDeviceWarning && hasAcceptedEvidence),
    hasContributingEvidence: hasAcceptedEvidence || bucket.reviews.length > 0,
  };

  return {
    reporting_evidence_category: deriveAttendanceReportingEvidenceCategory({
      day: record,
      signals,
    }),
    attendance_channels: uniqueOrderedValues(channels),
    work_site_name: uniqueOrderedValues(sites),
    work_site_type: uniqueOrderedValues(siteTypes),
    geo_outcome: uniqueOrderedValues(geoOutcomes),
    geo_action: uniqueOrderedValues(geoActions),
    reason_codes: uniqueOrderedValues(reasonCodes),
    review_required: reviewRequired,
    review_outcome: uniqueReviewOutcomes(reviewOutcomes),
  };
}

function recordKey(record: AttendanceDayRecord): string {
  return dayKey(record.company_id, record.employee_user_id, record.work_date);
}

function dayKey(companyId: UUID, employeeUserId: UUID, workDate: string): string {
  return `${companyId}:${employeeUserId}:${workDate}`;
}

function orderedValue(
  value: string,
  occurredAt: string | null | undefined,
  group: ReasonSourceGroup,
): OrderedValue {
  return {
    value,
    occurredAt: occurredAt ?? "",
    group,
  };
}

function pushString(
  values: OrderedValue[],
  value: unknown,
  occurredAt: string | null | undefined,
  group: ReasonSourceGroup,
): void {
  const parsed = stringValue(value);
  if (parsed) values.push(orderedValue(parsed, occurredAt, group));
}

function uniqueOrderedValues(values: OrderedValue[]): string[] {
  const seen = new Set<string>();
  return [...values]
    .sort((left, right) => {
      const byTime = left.occurredAt.localeCompare(right.occurredAt);
      if (byTime !== 0) return byTime;
      const byGroup = ReasonGroupOrder[left.group] - ReasonGroupOrder[right.group];
      if (byGroup !== 0) return byGroup;
      return left.value.localeCompare(right.value);
    })
    .filter((entry) => {
      const key = entry.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((entry) => entry.value);
}

function pushReviewOutcome(values: string[], value: unknown): void {
  const parsed = stringValue(value);
  if (parsed && ReviewOutcomeOrder.has(parsed)) {
    values.push(parsed);
  }
}

function uniqueReviewOutcomes(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .sort(
      (left, right) =>
        (ReviewOutcomeOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (ReviewOutcomeOrder.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.localeCompare(right),
    );
}

function channelLabelForPunch(punch: AttendancePunch): string | null {
  if (punch.origin === "manager_assisted_now" || punch.source === "admin") {
    return "Assisted punch";
  }
  if (
    punch.origin === "approved_regularization" ||
    punch.origin === "historical_correction"
  ) {
    return "Correction";
  }
  if (punch.origin === "system" || punch.source === "auto_geofence") {
    return "System";
  }
  return channelLabelForSource(punch.source);
}

function channelLabelForSource(
  source: AttendancePunchSourceChannel | string | null | undefined,
): string | null {
  if (source === "web") return "Web";
  if (source === "web_geo") return "Web + location";
  if (source === "mobile" || source === "mobile_foreground") return "Mobile";
  if (source === "mobile_offline") return "Mobile - captured offline";
  if (source === "kiosk") return "Kiosk";
  if (source === "admin") return "Assisted punch";
  if (source === "auto_geofence" || source === "system") return "System";
  return null;
}

function geoPolicyRecord(review: AttendanceGeoFallbackReview): Record<string, unknown> {
  return review.geo_policy && typeof review.geo_policy === "object" && !Array.isArray(review.geo_policy)
    ? review.geo_policy
    : {};
}

function geoFactualOutcome(policy: Record<string, unknown>): string | null {
  return stringValue(policy.factual_outcome) ?? stringValue(policy.category);
}

function geoSelectedAction(policy: Record<string, unknown>): string | null {
  return stringValue(policy.selected_action);
}

function workSiteName(policy: Record<string, unknown>): string | null {
  return (
    stringValue(policy.work_site_name) ??
    stringValue(recordField(policy, "work_site").name)
  );
}

function workSiteType(policy: Record<string, unknown>): string | null {
  return (
    stringValue(policy.work_site_type) ??
    stringValue(recordField(policy, "work_site").site_type)
  );
}

function recordField(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
}

function isPendingOrReturned(review: AttendanceGeoFallbackReview): boolean {
  return review.status === "pending" || review.status === "returned";
}

function isPendingOrReturnedRegularization(
  regularization: AttendanceRegularizationRequest,
): boolean {
  return (
    regularization.status === AttendanceRegularizationStatuses.Pending ||
    regularization.status === AttendanceRegularizationStatuses.Returned
  );
}

function isActionableRegularization(
  regularization: AttendanceRegularizationRequest,
): boolean {
  return (
    regularization.status === AttendanceRegularizationStatuses.Pending ||
    regularization.status === AttendanceRegularizationStatuses.Returned ||
    regularization.status === AttendanceRegularizationStatuses.Approved ||
    regularization.status === AttendanceRegularizationStatuses.Rejected
  );
}

function hasAcceptedOrProvisionalEvidence(
  record: AttendanceDayRecord,
  bucket: DayEvidenceBucket,
  offlineStatuses: Array<string | null>,
): boolean {
  return Boolean(
    record.first_check_in ||
      record.last_check_out ||
      record.work_seconds > 0 ||
      bucket.punches.length > 0 ||
      bucket.reviews.some((review) => review.status === "approved") ||
      offlineStatuses.some(
        (status) =>
          status === "unverified" ||
          status === "review_required" ||
          status === "verified",
      ),
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoValue(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
