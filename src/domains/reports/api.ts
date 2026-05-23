import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export interface ReportParams extends ApiRecord {
  page?: number;
  page_size?: number;
  department_id?: string;
  user_id?: string;
  employee_user_id?: string;
  project_id?: string;
  assigned_to_user_id?: string;
  actor_user_id?: string;
  status?: string;
  type?: string;
  request_kind?: "leave" | "wfh";
  client?: string;
  category_id?: string;
  module?: string;
  action?: string;
  report_type?: string;
  date_from?: string;
  date_to?: string;
}

export interface ReportSummaryResponse<T extends ApiRecord = ApiRecord> extends ApiRecord {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  totals?: ApiRecord;
  filters?: ApiRecord;
}

export interface ReportExportJob extends ApiRecord {
  id: string;
  export_id: string;
  event_id: string;
  report_type: string;
  format: "csv" | "xlsx";
  status: string;
  outbox_status?: string;
  created_by_user_id?: string | null;
  created_by?: string | null;
  filters?: ApiRecord;
  download_document_id?: string | null;
  download_url?: string | null;
  adapter?: string;
  created_at: string;
  updated_at: string;
}

const reportPaths = {
  hrEmployees: "/api/v1/reports/hr/employees",
  attendanceSummary: "/api/v1/reports/attendance/summary",
  leaveWfhSummary: "/api/v1/reports/leave-wfh/summary",
  projectsSummary: "/api/v1/reports/projects/summary",
  timesheetsSummary: "/api/v1/reports/timesheets/summary",
  assetsSummary: "/api/v1/reports/assets/summary",
  helpdeskSummary: "/api/v1/reports/helpdesk/summary",
  audit: "/api/v1/reports/audit",
  exports: "/api/v1/reports/exports",
} as const;

export const reportsApi = {
  hrEmployees(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.hrEmployees, params));
  },
  attendanceSummary(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.attendanceSummary, params));
  },
  leaveWfhSummary(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.leaveWfhSummary, params));
  },
  projectsSummary(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.projectsSummary, params));
  },
  timesheetsSummary(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.timesheetsSummary, params));
  },
  assetsSummary(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.assetsSummary, params));
  },
  helpdeskSummary(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.helpdeskSummary, params));
  },
  audit(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse>(withQuery(reportPaths.audit, params));
  },
  listExports(params: ReportParams = {}) {
    return apiRequest<ReportSummaryResponse<ReportExportJob>>(
      withQuery(reportPaths.exports, params),
    );
  },
  getExport(id: string) {
    return apiRequest<ReportExportJob>(`${reportPaths.exports}/${id}`);
  },
  createExport(input: ApiRecord) {
    return apiRequest<ReportExportJob>(reportPaths.exports, { method: "POST", body: input });
  },
};

function withQuery(path: string, params: ReportParams): string {
  return `${path}${queryString(params)}`;
}

function queryString(params: ReportParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}
