import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export type AttendancePunchEventType = "check_in" | "break_start" | "break_end" | "check_out";
export type AttendanceGeoReviewType = "manual_fallback" | "geo_decision";
export type AttendancePunchWorkMode = "office" | "remote" | "wfh" | "field";
export type AttendancePunchSource = "web" | "web_geo" | "mobile" | "kiosk";
export type AttendanceLocationProvider = "browser" | "device" | "network" | "unknown";
export type AttendanceGeoFactualOutcome =
  | "not_required"
  | "inside_confident"
  | "outside_confident"
  | "boundary_uncertain"
  | "stale_evidence"
  | "accuracy_exceeded"
  | "missing"
  | "permission_denied"
  | "location_unavailable"
  | "fence_not_configured";
export type AttendanceExactLocationAccessState =
  | "available_authorized"
  | "available_restricted"
  | "unavailable";
export type AttendanceRegularizationEventType = Extract<
  AttendancePunchEventType,
  "check_in" | "check_out"
>;
export type AttendanceRegularizationOperation = "add" | "replace" | "void";
export type AttendanceRegularizationStatus = "pending" | "approved" | "returned" | "rejected";

export type AttendanceRegularizationItem =
  | {
      operation: "add";
      event_type: AttendanceRegularizationEventType;
      occurred_at: string;
    }
  | {
      operation: "replace";
      target_punch_event_id: string;
      event_type: AttendanceRegularizationEventType;
      occurred_at: string;
    }
  | {
      operation: "void";
      target_punch_event_id: string;
    };

export type AttendanceLocationEvidence =
  | {
      latitude: number;
      longitude: number;
      accuracy_meters: number;
      captured_at: string;
      age_ms?: number;
      provider?: AttendanceLocationProvider;
      permission_state?: "granted" | "unknown";
      altitude_meters?: number;
      is_mocked?: boolean;
      integrity_status?: string;
    }
  | {
      captured_at?: string;
      age_ms?: number;
      provider?: AttendanceLocationProvider;
      permission_state: "denied" | "unavailable";
      integrity_status?: string;
    };

export interface AttendanceQuery extends PageQuery {
  date?: string;
  date_from?: string;
  date_to?: string;
  month?: string;
  user_id?: string;
  department_id?: string;
  manager_user_id?: string;
  status?: string;
  evidence_category?: string;
  reporting_evidence_category?: string;
  employee_search?: string;
  geo_outcome?: AttendanceGeoFactualOutcome;
  review_type?: AttendanceGeoReviewType;
  reason_code?: string;
  exception_type?: string;
}

export interface AttendanceGeoEvidenceSummary {
  source: "geo";
  review_type: AttendanceGeoReviewType;
  outcome: AttendanceGeoFactualOutcome | null;
  reason_code: string;
  reason: string | null;
  captured_at: string | null;
  event_time: string | null;
  attendance_action: AttendancePunchEventType;
  selected_action: "allow" | "deny" | "manual_fallback" | string | null;
  accuracy_meters: number | null;
  evidence_age_ms: number | null;
  max_location_age_ms: number | null;
  max_accuracy_meters: number | null;
  distance_meters: number | null;
  boundary_distance_meters: number | null;
  signed_margin_meters: number | null;
  grace_meters: number | null;
  work_site_name: string | null;
  work_site_type: string | null;
}

export interface AttendanceExactLocationAccess {
  state: AttendanceExactLocationAccessState;
}

export interface AttendanceExactLocationEvidence {
  latitude: number;
  longitude: number;
  captured_at: string;
  accuracy_meters: number | null;
}

export interface AttendanceCommandDevice {
  registered_device_id?: string;
  device_id?: string;
  platform?: "web" | "ios" | "android";
  app_version?: string;
  os_version?: string;
}

export interface AttendancePunchCommand {
  event_type: AttendancePunchEventType;
  work_mode?: AttendancePunchWorkMode;
  source?: AttendancePunchSource;
  metadata?: ApiRecord;
  location?: AttendanceLocationEvidence;
}

export interface AttendancePunchRequest {
  client_event_id: string;
  captured_at: string;
  device: AttendanceCommandDevice | null;
  command: AttendancePunchCommand;
}

export interface AttendanceRegularizationBody extends ApiRecord {
  work_date: string;
  reason: string;
  items: AttendanceRegularizationItem[];
}

export interface AttendanceRegularizationItemRecord extends ApiRecord {
  id: string;
  ordinal: number;
  operation: AttendanceRegularizationOperation;
  target_punch_event_id: string | null;
  event_type: AttendanceRegularizationEventType | null;
  occurred_at: string | null;
}

export interface AttendanceRegularizationRecord extends ApiRecord {
  id: string;
  work_date: string;
  reason: string;
  status: AttendanceRegularizationStatus;
  version: number;
  items: AttendanceRegularizationItemRecord[];
  approver?: ApiRecord | null;
  created_at?: string;
  updated_at?: string;
}

export type EmployeeAttendanceSummarySourceType =
  | "employee_punch"
  | "manager_assisted_punch"
  | "historical_correction"
  | "approved_regularization"
  | "system_daily_summary";

export interface EmployeeAttendanceSummarySource {
  type: EmployeeAttendanceSummarySourceType;
  label: string;
}

export interface EmployeeAttendanceEvidenceDecision {
  outcome: string;
  reason_codes: string[];
  reason: string | null;
}

export interface EmployeeAttendanceEvidenceGeo {
  outcome: AttendanceGeoFactualOutcome | string | null;
  reason_code: string | null;
  selected_action: "allow" | "deny" | "manual_fallback" | string | null;
  work_site_name: string | null;
  work_site_type: string | null;
}

export interface EmployeeAttendanceEvidenceRegularization {
  status: AttendanceRegularizationStatus | string;
  operation: AttendanceRegularizationOperation | string | null;
  relationship: "added" | "replacement" | "corrected_original" | "voided" | "request";
  reason: string | null;
  decided_at: string | null;
  applied_at: string | null;
}

export interface EmployeeAttendanceEvidenceEvent {
  event_type: AttendancePunchEventType | string;
  occurred_at: string;
  time: string | null;
  source: string | null;
  origin: string | null;
  work_mode: AttendancePunchWorkMode | string | null;
  decision: EmployeeAttendanceEvidenceDecision | null;
  geo: EmployeeAttendanceEvidenceGeo | null;
  regularization: EmployeeAttendanceEvidenceRegularization | null;
}

export interface EmployeeAttendanceEvidenceDay {
  work_date: string;
  status: string;
  day_classification: string;
  presence_state: string;
  punctuality_state: string;
  evidence_state: string;
  approval_kind: string;
  approval_state: string;
  payroll_state: string;
  regularization_status: AttendanceRegularizationStatus | string | null;
  in_time: string | null;
  out_time: string | null;
  hours: string;
  work_minutes: number;
  break_minutes: number;
  detail: string;
}

export interface EmployeeAttendanceEvidenceRegularizationItem {
  operation: AttendanceRegularizationOperation | string;
  event_type: AttendanceRegularizationEventType | string | null;
  occurred_at: string | null;
  relationship: "requested" | "applied";
}

export interface EmployeeAttendanceEvidenceRegularizationRequest {
  status: AttendanceRegularizationStatus | string;
  reason: string;
  created_at: string | null;
  updated_at: string | null;
  decided_at: string | null;
  operations: Array<AttendanceRegularizationOperation | string>;
  items: EmployeeAttendanceEvidenceRegularizationItem[];
}

export interface EmployeeAttendanceDayEvidence {
  generated_at: string;
  date: string;
  day: EmployeeAttendanceEvidenceDay;
  summary_sources: EmployeeAttendanceSummarySource[];
  events: EmployeeAttendanceEvidenceEvent[];
  regularizations: EmployeeAttendanceEvidenceRegularizationRequest[];
}

export type AttendanceDailyCalendarResponse = PaginatedResponse<ApiRecord> & {
  summary?: ApiRecord;
  exceptions?: ApiRecord[];
  totals?: ApiRecord;
  self_evidence?: EmployeeAttendanceDayEvidence;
};

export interface AttendanceRegularizationDecisionBody extends ExpectedVersionBody {
  decision: "approve" | "reject" | "return";
  remarks?: string;
}

export interface AttendanceGeoFallbackDecisionBody extends ExpectedVersionBody {
  decision: "approve" | "reject" | "return";
  remarks?: string;
}

export interface AttendanceExportBody extends ApiRecord {
  filters?: ApiRecord;
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

export interface AttendanceCommandOptions {
  idempotencyKey?: string;
}

export const attendanceApi = {
  punch(input: AttendancePunchRequest) {
    return apiRequest<ApiRecord>("/api/v1/attendance/punches", {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": input.client_event_id },
    });
  },
  submitGeoFallback(reference: string, options: AttendanceCommandOptions = {}) {
    return apiRequest<ApiRecord>(`/api/v1/attendance/geo-fallbacks/${reference}/submit`, {
      method: "POST",
      body: {},
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    });
  },
  listMyPunches(query: AttendanceQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/attendance/punches/my", { query });
  },
  mySummary(query: AttendanceQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/attendance/summary/my", { query });
  },
  teamSummary(query: AttendanceQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/attendance/summary/team", { query });
  },
  monthlyCalendar(query: AttendanceQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/attendance/calendar/monthly", { query });
  },
  dailyCalendar(query: AttendanceQuery = {}) {
    return apiRequest<AttendanceDailyCalendarResponse>("/api/v1/attendance/calendar/daily", {
      query,
    });
  },
  createRegularization(input: AttendanceRegularizationBody) {
    return apiRequest<AttendanceRegularizationRecord>("/api/v1/attendance/regularizations", {
      method: "POST",
      body: input,
    });
  },
  listMyRegularizations(query: AttendanceQuery = {}) {
    return apiRequest<PaginatedResponse<AttendanceRegularizationRecord>>(
      "/api/v1/attendance/regularizations/my",
      { query },
    );
  },
  managerRegularizationQueue(query: AttendanceQuery = {}) {
    return apiRequest<
      PaginatedResponse<AttendanceRegularizationRecord> & { queue_counts?: ApiRecord }
    >("/api/v1/attendance/regularizations/queue/manager", { query });
  },
  managerGeoFallbackQueue(query: AttendanceQuery = {}) {
    return apiRequest<
      PaginatedResponse<AttendanceRegularizationRecord> & { queue_counts?: ApiRecord }
    >("/api/v1/attendance/geo-fallbacks/queue/manager", { query });
  },
  decideRegularization(id: string, input: AttendanceRegularizationDecisionBody) {
    return apiRequest<AttendanceRegularizationRecord>(
      `/api/v1/attendance/regularizations/${id}/decision`,
      {
        method: "POST",
        body: input,
      },
    );
  },
  decideGeoFallback(id: string, input: AttendanceGeoFallbackDecisionBody) {
    return apiRequest<AttendanceRegularizationRecord>(
      `/api/v1/attendance/geo-fallbacks/${id}/decision`,
      {
        method: "POST",
        body: input,
      },
    );
  },
  revealGeoFallbackExactLocation(id: string) {
    return apiRequest<AttendanceExactLocationEvidence>(
      `/api/v1/attendance/geo-fallbacks/${id}/exact-location`,
      {
        method: "POST",
        body: {},
      },
    );
  },
  listExceptions(query: AttendanceQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>(
      "/api/v1/attendance/exceptions",
      { query },
    );
  },
  createExport(input: AttendanceExportBody) {
    return apiRequest<ApiRecord>("/api/v1/attendance/exports", {
      method: "POST",
      body: input,
    });
  },
};
