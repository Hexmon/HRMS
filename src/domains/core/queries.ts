import { useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { coreApi } from "./api";

export function useUserSubtree(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.detail("core", "user-subtree", userId ?? "missing"),
    queryFn: () => coreApi.getUserSubtree(userId as string),
    enabled: Boolean(userId),
    staleTime: queryTimings.detailStaleMs,
  });
}
