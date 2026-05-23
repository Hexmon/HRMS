import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  adminApi,
  type AdminEmailTemplateUpdateInput,
  type AdminNotificationChannelsUpdateInput,
  type AdminPolicyUpdateInput,
  type AdminWorkflowUpdateInput,
  type CompanyProfileUpdateInput,
  type DepartmentMasterInput,
  type DesignationMasterInput,
  type RbacRoleInput,
  type RbacRolePermissionsInput,
  type RbacRoleUpdateInput,
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

export function useRbacRoles(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "rbac", "roles"),
    queryFn: () => adminApi.listRbacRoles({ page: 1, page_size: 100 }),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useRbacPermissions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "rbac", "permissions"),
    queryFn: () => adminApi.listRbacPermissions(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useCreateRbacRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RbacRoleInput) => adminApi.createRbacRole(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useUpdateRbacRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RbacRoleUpdateInput }) =>
      adminApi.updateRbacRole(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useReplaceRbacRolePermissionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RbacRolePermissionsInput }) =>
      adminApi.replaceRbacRolePermissions(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useAdminWorkflows(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "workflows"),
    queryFn: () => adminApi.listAdminWorkflows(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useUpdateAdminWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowKey,
      input,
    }: {
      workflowKey: string;
      input: AdminWorkflowUpdateInput;
    }) => adminApi.updateAdminWorkflow(workflowKey, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useAdminPolicies(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "policies"),
    queryFn: () => adminApi.listAdminPolicies(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useUpdateAdminPolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyKey, input }: { policyKey: string; input: AdminPolicyUpdateInput }) =>
      adminApi.updateAdminPolicy(policyKey, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useAdminEmailTemplates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "email-templates"),
    queryFn: () => adminApi.listAdminEmailTemplates(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useUpdateAdminEmailTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateKey,
      input,
    }: {
      templateKey: string;
      input: AdminEmailTemplateUpdateInput;
    }) => adminApi.updateAdminEmailTemplate(templateKey, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useAdminNotificationChannels(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "notification-channels"),
    queryFn: () => adminApi.listAdminNotificationChannels(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useUpdateAdminNotificationChannelsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminNotificationChannelsUpdateInput) =>
      adminApi.updateAdminNotificationChannels(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin") }),
  });
}

export function useAdminAuditLog(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin", "audit-log"),
    queryFn: () => adminApi.listAdminAuditLog({ page: 1, page_size: 100 }),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
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
