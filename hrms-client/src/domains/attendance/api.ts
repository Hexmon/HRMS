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
  status?: string;
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
    return apiRequest<
      PaginatedResponse<ApiRecord> & {
        summary?: ApiRecord;
        exceptions?: ApiRecord[];
        totals?: ApiRecord;
      }
    >("/api/v1/attendance/calendar/daily", { query });
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
