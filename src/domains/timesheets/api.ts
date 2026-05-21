import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

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
  approverQueuePartial(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/timesheets/queue/approver", { query });
  },
  approveSubmissionPartial(id: string, input: ExpectedVersionBody) {
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
