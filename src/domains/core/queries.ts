import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { coreApi } from "./api";
import type { PageQuery } from "@/shared/api";

export function useUserSubtree(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.detail("core", "user-subtree", userId ?? "missing"),
    queryFn: () => coreApi.getUserSubtree(userId as string),
    enabled: Boolean(userId),
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useUserRoleHistory(userId: string | undefined, enabled = true) {
  const query: PageQuery = { page: 1, page_size: 50 };
  return useQuery({
    queryKey: queryKeys.list("core", "user-role-history", {
      userId: userId ?? "missing",
      ...query,
    }),
    queryFn: () => coreApi.getUserRoleHistory(userId as string, query),
    enabled: Boolean(userId) && enabled,
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useUserAudit(userId: string | undefined, enabled = true) {
  const query: PageQuery = { page: 1, page_size: 50 };
  return useQuery({
    queryKey: queryKeys.list("core", "user-audit", { userId: userId ?? "missing", ...query }),
    queryFn: () => coreApi.getUserAudit(userId as string, query),
    enabled: Boolean(userId) && enabled,
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useCreateUserExportMutation() {
  return useMutation({
    mutationFn: coreApi.createUserExport,
  });
}
