import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import type { PageQuery } from "@/shared/api";
import { timesheetsApi, type TimesheetAnalyticsQuery, type TimesheetSelectorsQuery } from "./api";

export function useWorkSegments(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("timesheets", "work-segments", query),
    queryFn: () => timesheetsApi.listWorkSegments(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyTimesheetSubmissions(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("timesheets", "my-submissions", query),
    queryFn: () => timesheetsApi.listMySubmissions(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useTimesheetWorkflowDefinitions(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("timesheets", "workflow-definitions", query),
    queryFn: () => timesheetsApi.listWorkflowDefinitions(query),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useTimesheetProjectSummary(query: TimesheetAnalyticsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("timesheets", "projects-summary", query),
    queryFn: () => timesheetsApi.projectSummary(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
  });
}

export function useTimesheetMissingSubmissions(
  query: TimesheetAnalyticsQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.list("timesheets", "missing-submissions", query),
    queryFn: () => timesheetsApi.missingSubmissions(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
  });
}

export function useTimesheetProductivitySummary(
  query: TimesheetAnalyticsQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.detail("timesheets", "productivity-summary", "current", query),
    queryFn: () => timesheetsApi.productivitySummary(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
  });
}

export function useTimesheetSelectors(query: TimesheetSelectorsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("timesheets", "selectors", "current", query),
    queryFn: () => timesheetsApi.selectors(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
  });
}

export function useTimesheetSubmissionDetail(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("timesheets", "submission", id ?? "none"),
    queryFn: () => timesheetsApi.submissionDetail(id ?? ""),
    enabled: enabled && Boolean(id),
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useTimesheetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: timesheetsApi.createWorkSegment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("timesheets") }),
  });
}
