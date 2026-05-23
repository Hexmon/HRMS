import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { adminApi, type CompanyProfileUpdateInput } from "./api";

export function useCompanyProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("admin", "company-profile", "current"),
    queryFn: () => adminApi.getCompanyProfile(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useUpdateCompanyProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyProfileUpdateInput) => adminApi.updateCompanyProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.detail("admin", "company-profile", "current"), profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") });
    },
  });
}

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
