import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { leaveWfhApi } from "./api";
import type {
  HolidayUpsertBody,
  LeaveCreateBody,
  LeaveWfhCancelBody,
  LeaveWfhDecisionBody,
  LeaveWfhQuery,
  WfhCreateBody,
} from "./api";

export function useMyLeaveBalances(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "balances-my", query),
    queryFn: () => leaveWfhApi.myBalances(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyLeaveRequests(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "leave-my", query),
    queryFn: () => leaveWfhApi.listMyLeave(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyWfhRequests(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "wfh-my", query),
    queryFn: () => leaveWfhApi.listMyWfh(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useLeaveManagerQueue(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "leave-manager-queue", query),
    queryFn: () => leaveWfhApi.managerLeaveQueue(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useWfhManagerQueue(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "wfh-manager-queue", query),
    queryFn: () => leaveWfhApi.managerWfhQueue(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useLeaveWfhMonitor(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "hr-monitor", query),
    queryFn: () => leaveWfhApi.hrMonitor(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useHolidays(query: LeaveWfhQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("leave-wfh", "holidays", query),
    queryFn: () => leaveWfhApi.holidays(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useCreateLeaveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LeaveCreateBody) => leaveWfhApi.createLeave(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("leave-wfh") }),
  });
}

export function useCreateWfhMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WfhCreateBody) => leaveWfhApi.createWfh(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("leave-wfh") }),
  });
}

export function useLeaveWfhDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      input,
    }: {
      kind: "leave" | "wfh";
      id: string;
      input: LeaveWfhDecisionBody;
    }) =>
      kind === "leave" ? leaveWfhApi.decideLeave(id, input) : leaveWfhApi.decideWfh(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("leave-wfh") }),
  });
}

export function useCancelLeaveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LeaveWfhCancelBody }) =>
      leaveWfhApi.cancelLeave(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("leave-wfh") }),
  });
}

export function useHolidayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HolidayUpsertBody }) =>
      leaveWfhApi.upsertHoliday(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("leave-wfh") }),
  });
}
