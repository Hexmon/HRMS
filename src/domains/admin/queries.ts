import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { adminApi } from "./api";

export function useFinanceGovernance(enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("admin", "finance-governance", "current"),
    queryFn: () => adminApi.getFinanceGovernance(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useManagerBackups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "manager-backups"),
    queryFn: () => adminApi.listManagerBackups(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useUpdateFinanceGovernanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.updateFinanceGovernance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}
