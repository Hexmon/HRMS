import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

interface TimesheetDecisionBody extends ExpectedVersionBody {
  decision: "approve" | "reject" | "return";
  remarks?: string;
}

export interface TimesheetAnalyticsQuery extends PageQuery {
  date_from?: string;
  date_to?: string;
  cycle_start?: string;
  cycle_end?: string;
  project_id?: string;
  project_code?: string;
  user_id?: string;
  group_by?: "employee" | "project" | "department" | "week";
}

export interface TimesheetSelectorsQuery extends Record<string, string | undefined> {
  include?: string;
  date?: string;
}

export const timesheetsApi = {
  createWorkSegment(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/work-segments", {
      method: "POST",
      body: input,
    });
  },
  listWorkSegments(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/timesheets/work-segments", { query });
  },
  createSubmission(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/submissions", { method: "POST", body: input });
  },
  listMySubmissions(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/timesheets/submissions/my", { query });
  },
  approverQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/timesheets/queue/approver", { query });
  },
  projectSummary(query: TimesheetAnalyticsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>(
      "/api/v1/timesheets/projects/summary",
      { query },
    );
  },
  missingSubmissions(query: TimesheetAnalyticsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { summary?: ApiRecord }>(
      "/api/v1/timesheets/missing-submissions",
      { query },
    );
  },
  productivitySummary(query: TimesheetAnalyticsQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/productivity-summary", { query });
  },
  selectors(query: TimesheetSelectorsQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/selectors", { query });
  },
  submissionDetail(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/timesheets/submissions/${id}`);
  },
  decideSubmission(id: string, input: TimesheetDecisionBody) {
    return apiRequest<ApiRecord>(`/api/v1/timesheets/submissions/${id}/approve`, {
      method: "POST",
      body: input,
    });
  },
  listWorkflowDefinitions(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/timesheets/workflow-definitions", {
      query,
    });
  },
};
