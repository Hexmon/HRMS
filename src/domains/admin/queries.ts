import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  adminApi,
  type CompanyProfileUpdateInput,
  type DepartmentMasterInput,
  type DesignationMasterInput,
} from "./api";

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

export function useDepartmentMasters(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "master-data", "departments"),
    queryFn: () => adminApi.listDepartments({ page: 1, page_size: 100 }),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useDesignationMasters(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "master-data", "designations"),
    queryFn: () => adminApi.listDesignations({ page: 1, page_size: 100 }),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useCreateDepartmentMasterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DepartmentMasterInput) => adminApi.createDepartment(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useUpdateDepartmentMasterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: DepartmentMasterInput & { expected_version: number };
    }) => adminApi.updateDepartment(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useCreateDesignationMasterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DesignationMasterInput) => adminApi.createDesignation(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useUpdateDesignationMasterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: DesignationMasterInput & { expected_version: number };
    }) => adminApi.updateDesignation(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
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
