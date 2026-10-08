import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { attendanceApi } from "./api";
import { employeeAttendanceContextFromSummary } from "./context";
import { currentLocalMonth } from "./live";
import type {
  AttendanceExportBody,
  AttendanceGeoFallbackDecisionBody,
  AttendancePunchRequest,
  AttendanceQuery,
  AttendanceRegularizationBody,
  AttendanceRegularizationDecisionBody,
} from "./api";

function mergeQueueCounts(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
) {
  const keys = ["total", "pending", "approved", "returned", "rejected"] as const;
  return Object.fromEntries(
    keys.map((key) => [key, Number(left?.[key] ?? 0) + Number(right?.[key] ?? 0)]),
  );
}

const employeeContextQuery = () => ({
  month: currentLocalMonth(),
  page: 1,
  page_size: 50,
});

export interface ManualAttendanceMutationInput {
  request: AttendancePunchRequest;
}

export function useMyAttendanceSummary(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "summary-my", query),
    queryFn: () => attendanceApi.mySummary(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useEmployeeAttendanceContext(enabled = true) {
  const query = employeeContextQuery();
  return useQuery({
    queryKey: queryKeys.list("attendance", "summary-my", query),
    queryFn: () => attendanceApi.mySummary(query),
    select: employeeAttendanceContextFromSummary,
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    refetchOnWindowFocus: true,
  });
}

export function useAttendancePrivacy(enabled = true) {
  return useQuery({
    queryKey: queryKeys.action("attendance", "privacy", "current"),
    queryFn: () => attendanceApi.privacy(),
    enabled,
    staleTime: queryTimings.detailStaleMs,
    refetchOnWindowFocus: true,
  });
}

export function useTeamAttendanceSummary(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "summary-team", query),
    queryFn: () => attendanceApi.teamSummary(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceMonthlyCalendar(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "calendar-monthly", query),
    queryFn: () => attendanceApi.monthlyCalendar(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceDailyCalendar(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "calendar-daily", query),
    queryFn: () => attendanceApi.dailyCalendar(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceExceptions(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "exceptions", query),
    queryFn: () => attendanceApi.listExceptions(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyAttendancePunches(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "punches-my", query),
    queryFn: () => attendanceApi.listMyPunches(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyAttendanceRegularizations(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "regularizations-my", query),
    queryFn: () => attendanceApi.listMyRegularizations(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useManagerAttendanceRegularizationQueue(
  query: AttendanceQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "regularizations-manager-queue", query),
    queryFn: async () => {
      const [regularizations, geoFallbacks] = await Promise.all([
        attendanceApi.managerRegularizationQueue(query),
        attendanceApi.managerGeoFallbackQueue(query),
      ]);
      const regularizationItems = regularizations.items ?? [];
      const geoFallbackItems = geoFallbacks.items ?? [];
      return {
        ...regularizations,
        items: [...geoFallbackItems, ...regularizationItems],
        total:
          Number(regularizations.total ?? regularizationItems.length) +
          Number(geoFallbacks.total ?? geoFallbackItems.length),
        queue_counts: mergeQueueCounts(regularizations.queue_counts, geoFallbacks.queue_counts),
      };
    },
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceGeoFallbackSubmitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reference, idempotencyKey }: { reference: string; idempotencyKey: string }) =>
      attendanceApi.submitGeoFallback(reference, { idempotencyKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendancePunchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AttendancePunchRequest) => attendanceApi.punch(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useManualAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ request }: ManualAttendanceMutationInput) => attendanceApi.punch(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendanceRegularizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AttendanceRegularizationBody) => attendanceApi.createRegularization(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendanceExportMutation() {
  return useMutation({
    mutationFn: (input: AttendanceExportBody) => attendanceApi.createExport(input),
  });
}

export function useAttendanceRegularizationDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AttendanceRegularizationDecisionBody }) =>
      attendanceApi.decideRegularization(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendanceGeoFallbackDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AttendanceGeoFallbackDecisionBody }) =>
      attendanceApi.decideGeoFallback(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendanceExactLocationRevealMutation() {
  return useMutation({
    mutationFn: (id: string) => attendanceApi.revealGeoFallbackExactLocation(id),
  });
}
