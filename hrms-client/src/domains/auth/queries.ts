import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { authApi, type LoginRequest } from "./api";

export function useApiSessionPartial(enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("auth", "session", "me"),
    queryFn: () => authApi.getSessionPartial(),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (input: LoginRequest) => authApi.login(input),
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => authApi.logout(),
  });
}
