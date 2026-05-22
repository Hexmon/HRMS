import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export type LeaveType = "casual" | "sick" | "earned" | "unpaid" | "comp_off";
export type LeaveWfhStatus = "pending_manager" | "approved" | "returned" | "rejected" | "cancelled";

export interface LeaveWfhQuery extends PageQuery {
  year?: number;
  leave_type?: LeaveType;
  status?: LeaveWfhStatus;
  date_from?: string;
  date_to?: string;
  user_id?: string;
  department_id?: string;
  request_kind?: "leave" | "wfh";
}

export interface LeaveCreateBody extends ApiRecord {
  leave_type: LeaveType;
  date_from: string;
  date_to: string;
  half_day?: boolean;
  reason: string;
  document_ids?: string[];
}

export interface WfhCreateBody extends ApiRecord {
  date_from: string;
  date_to: string;
  half_day?: boolean;
  reason: string;
  project_ref?: string;
}

export interface LeaveWfhDecisionBody extends ExpectedVersionBody {
  decision: "approve" | "reject" | "return";
  remarks?: string;
}

export interface LeaveWfhCancelBody extends ExpectedVersionBody {
  remarks?: string;
}

export interface HolidayUpsertBody extends ApiRecord {
  name: string;
  date: string;
  region?: string;
  optional?: boolean;
  expected_version?: number;
}

export const leaveWfhApi = {
  myBalances(query: LeaveWfhQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/leave/balances/my", { query });
  },
  userBalances(userId: string, query: LeaveWfhQuery = {}) {
    return apiRequest<ApiRecord>(`/api/v1/leave/balances/${userId}`, { query });
  },
  createLeave(input: LeaveCreateBody) {
    return apiRequest<ApiRecord>("/api/v1/leave/requests", { method: "POST", body: input });
  },
  listMyLeave(query: LeaveWfhQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/leave/requests/my", { query });
  },
  managerLeaveQueue(query: LeaveWfhQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { queue_counts?: ApiRecord }>(
      "/api/v1/leave/requests/queue/manager",
      { query },
    );
  },
  decideLeave(id: string, input: LeaveWfhDecisionBody) {
    return apiRequest<ApiRecord>(`/api/v1/leave/requests/${id}/decision`, {
      method: "POST",
      body: input,
    });
  },
  cancelLeave(id: string, input: LeaveWfhCancelBody) {
    return apiRequest<ApiRecord>(`/api/v1/leave/requests/${id}/cancel`, {
      method: "POST",
      body: input,
    });
  },
  createWfh(input: WfhCreateBody) {
    return apiRequest<ApiRecord>("/api/v1/wfh/requests", { method: "POST", body: input });
  },
  listMyWfh(query: LeaveWfhQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/wfh/requests/my", { query });
  },
  managerWfhQueue(query: LeaveWfhQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { queue_counts?: ApiRecord }>(
      "/api/v1/wfh/requests/queue/manager",
      { query },
    );
  },
  decideWfh(id: string, input: LeaveWfhDecisionBody) {
    return apiRequest<ApiRecord>(`/api/v1/wfh/requests/${id}/decision`, {
      method: "POST",
      body: input,
    });
  },
  hrMonitor(query: LeaveWfhQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>(
      "/api/v1/leave-wfh/hr-monitor",
      { query },
    );
  },
  holidays(query: LeaveWfhQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/holidays", { query });
  },
  upsertHoliday(id: string, input: HolidayUpsertBody) {
    return apiRequest<ApiRecord>(`/api/v1/holidays/${id}`, { method: "PUT", body: input });
  },
};
