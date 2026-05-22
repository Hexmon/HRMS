import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { emsApi } from "./api";
import type {
  EmsDecisionBody,
  EmsProfileChangeBody,
  EmsProfilePatchBody,
  EmsQuery,
  EmsRequestCreateBody,
} from "./api";

export function useEmsProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("ems", "profile", "me"),
    queryFn: () => emsApi.profile(),
    enabled,
    staleTime: queryTimings.listStaleMs,
  });
}

export function useMyProfileChanges(query: EmsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("ems", "profile-changes-my", query),
    queryFn: () => emsApi.listMyProfileChanges(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useHrProfileChangeQueue(query: EmsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("ems", "profile-change-queue", query),
    queryFn: () => emsApi.hrProfileChangeQueue(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyEmsRequests(query: EmsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("ems", "requests-my", query),
    queryFn: () => emsApi.listMyRequests(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useHrEmsRequestQueue(query: EmsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("ems", "request-queue", query),
    queryFn: () => emsApi.hrRequestQueue(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useEmsLetters(query: EmsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("ems", "letters", query),
    queryFn: () => emsApi.letters(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useEmsPolicies(query: EmsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("ems", "policies", query),
    queryFn: () => emsApi.policies(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useEmsProfilePatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EmsProfilePatchBody) => emsApi.patchProfile(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
  });
}

export function useEmsProfileChangeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EmsProfileChangeBody) => emsApi.createProfileChange(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
  });
}

export function useEmsProfileDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmsDecisionBody }) =>
      emsApi.decideProfileChange(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
  });
}

export function useEmsRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EmsRequestCreateBody) => emsApi.createRequest(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
  });
}

export function useEmsLetterAcknowledgeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      emsApi.acknowledgeLetter(id, { expected_version: expectedVersion }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
  });
}

export function useEmsPolicyAcknowledgeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      emsApi.acknowledgePolicy(id, { expected_version: expectedVersion }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("ems") }),
  });
}
