import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import type { PageQuery } from "@/shared/api";
import { timesheetsApi } from "./api";

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

export function useTimesheetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: timesheetsApi.createWorkSegment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("timesheets") }),
  });
}
