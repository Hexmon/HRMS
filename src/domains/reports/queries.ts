import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { reportsApi, type ReportParams } from "./api";

const defaultParams = { page: 1, page_size: 100 };

export function useHrEmployeeReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "hr-employees", params),
    queryFn: () => reportsApi.hrEmployees(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useAttendanceReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "attendance", params),
    queryFn: () => reportsApi.attendanceSummary(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useLeaveWfhReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "leave-wfh", params),
    queryFn: () => reportsApi.leaveWfhSummary(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useProjectsReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "projects", params),
    queryFn: () => reportsApi.projectsSummary(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useTimesheetsReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "timesheets", params),
    queryFn: () => reportsApi.timesheetsSummary(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useAssetsReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "assets", params),
    queryFn: () => reportsApi.assetsSummary(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useHelpdeskReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "helpdesk", params),
    queryFn: () => reportsApi.helpdeskSummary(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useAuditReport(enabled = true, params: ReportParams = defaultParams) {
  return useQuery({
    queryKey: queryKeys.list("reports", "audit", params),
    queryFn: () => reportsApi.audit(params),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useCreateReportExportMutation() {
  return useMutation({
    mutationFn: reportsApi.createExport,
  });
}
