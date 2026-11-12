import { apiRequest } from "@/shared/api";
import type { ApiRecord, PaginatedResponse } from "@/shared/api";
import { withExpenseCommandKey } from "@/domains/expenses/command-key";

export interface CompanyProfileResponse extends ApiRecord {
  id: string;
  company_name: string;
  company_slug: string;
  website: string | null;
  industry: string | null;
  address: string | null;
  timezone: string;
  locale: string;
  currency: string;
  fiscal_year_start_month: number;
  financial_year_start: string;
  working_week: string;
  work_hours_per_day: number;
  logo_label: string | null;
  logoLabel?: string | null;
  logo_document_id: string | null;
  logoDocumentId?: string | null;
  logo_url: string | null;
  logoUrl?: string | null;
  logo_file_name: string | null;
  logo_mime_type: string | null;
  logo_size_bytes: number | null;
  status: string;
  updated_at: string;
  version: number;
}

export interface CompanyProfileUpdateInput extends ApiRecord {
  company_name?: string;
  website?: string | null;
  industry?: string | null;
  address?: string | null;
  timezone?: string;
  locale?: string;
  currency?: string;
  fiscal_year_start_month?: number;
  working_week?: string;
  work_hours_per_day?: number;
  logo_label?: string | null;
  expected_version: number;
}

export interface AdminCompanyLogoUploadResponse extends ApiRecord {
  company: CompanyProfileResponse;
  document: ApiRecord;
}

export interface MasterDataListResponse<T extends ApiRecord> extends ApiRecord {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

const MANAGER_BACKUP_PAGE_SIZE = 100;
const MANAGER_BACKUP_MAX_RECORDS = 10_000;

function assertManagerBackupPage(
  response: PaginatedResponse<ApiRecord>,
  requestedPage: number,
  expectedTotal?: number,
): void {
  if (
    response.page !== requestedPage ||
    response.page_size !== MANAGER_BACKUP_PAGE_SIZE ||
    !Number.isSafeInteger(response.total) ||
    response.total < 0 ||
    response.items.length > MANAGER_BACKUP_PAGE_SIZE ||
    (expectedTotal !== undefined && response.total !== expectedTotal)
  ) {
    throw new Error("Manager backup pagination changed while loading. Refresh and try again.");
  }
  if (response.total > MANAGER_BACKUP_MAX_RECORDS) {
    throw new Error(
      `Manager backup assignments exceed the ${MANAGER_BACKUP_MAX_RECORDS.toLocaleString("en-US")} record safety limit. Narrow or archive the assignments before retrying.`,
    );
  }
}

export interface DepartmentMasterRecord extends ApiRecord {
  id: string;
  department_code: string;
  code: string;
  name: string;
  cost_center: string | null;
  parent_department_id: string | null;
  parent_id: string | null;
  director_user_id: string | null;
  status: "active" | "inactive";
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export interface DesignationMasterRecord extends ApiRecord {
  id: string;
  designation_code: string;
  code: string;
  title: string;
  name: string;
  level: number | null;
  status: "active" | "inactive";
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export type ExtendedMasterDataKey =
  | "employmentTypes"
  | "workLocations"
  | "shifts"
  | "leaveTypes"
  | "expenseCategories"
  | "assetCategories"
  | "helpdeskCategories"
  | "projectRoles";

export interface ExtendedMasterDataRecord extends ApiRecord {
  id: string;
  master_key: ExtendedMasterDataKey;
  key: ExtendedMasterDataKey;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  active: boolean;
  sort_order: number;
  metadata: ApiRecord;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface DepartmentMasterInput extends ApiRecord {
  name?: string;
  code?: string;
  department_code?: string;
  cost_center?: string | null;
  parent_id?: string | null;
  parent_department_id?: string | null;
  status?: "active" | "inactive";
  expected_version?: number;
}

export interface DesignationMasterInput extends ApiRecord {
  name?: string;
  title?: string;
  code?: string;
  designation_code?: string;
  level?: number | null;
  status?: "active" | "inactive";
  expected_version?: number;
}

export interface ExtendedMasterDataInput extends ApiRecord {
  name?: string;
  code?: string;
  description?: string | null;
  status?: "active" | "inactive";
  sort_order?: number;
  expected_version?: number;
}

export interface RbacRoleRecord extends ApiRecord {
  id: string;
  role_key: string;
  key: string;
  name: string;
  label: string;
  description: string;
  status: "active" | "inactive";
  active: boolean;
  builtin: boolean;
  protected_system_role: boolean;
  assigned_users: number;
  permission_ids: string[];
  permissions: string[];
  updated_at: string;
  version: number;
}

export interface RbacPermissionRecord extends ApiRecord {
  id: string;
  permission_id: string;
  group: string;
  module: string;
  action: string;
  label: string;
  description: string;
}

export interface RbacRoleInput extends ApiRecord {
  role_key?: string;
  key?: string;
  name: string;
  description?: string;
  permission_ids: string[];
}

export interface RbacRoleUpdateInput extends ApiRecord {
  name?: string;
  description?: string;
  status?: "active" | "inactive";
  expected_version: number;
}

export interface RbacRolePermissionsInput extends ApiRecord {
  permission_ids: string[];
  expected_version: number;
  remarks?: string;
}

export interface AdminWorkflowStageRecord extends ApiRecord {
  id: string;
  order: number;
  approver_type: "Reporting Manager" | "Role" | "Specific User";
  approverType: "Reporting Manager" | "Role" | "Specific User";
  approver_value: string;
  approverValue: string;
  escalate_after_days: number;
  escalateAfterDays: number;
  mandatory_remarks_on_reject: boolean;
  mandatoryRemarksOnReject: boolean;
}

export interface AdminWorkflowRecord extends ApiRecord {
  id: string;
  workflow_key: string;
  key: string;
  module: string;
  label: string;
  status: "active" | "inactive";
  active: boolean;
  stages: AdminWorkflowStageRecord[];
  updated_at: string;
  version: number;
}

export interface AdminWorkflowListResponse extends ApiRecord {
  items: AdminWorkflowRecord[];
  workflows: AdminWorkflowRecord[];
  versions: Record<string, number>;
}

export interface AdminWorkflowStageInput extends ApiRecord {
  id?: string;
  order?: number;
  approver_type?: "Reporting Manager" | "Role" | "Specific User";
  approverType?: "Reporting Manager" | "Role" | "Specific User";
  approver_value?: string;
  approverValue?: string;
  escalate_after_days?: number;
  escalateAfterDays?: number;
  mandatory_remarks_on_reject?: boolean;
  mandatoryRemarksOnReject?: boolean;
}

export interface AdminWorkflowUpdateInput extends ApiRecord {
  label?: string;
  active?: boolean;
  status?: "active" | "inactive";
  stages?: AdminWorkflowStageInput[];
  expected_version: number;
}

export type AdminPolicyValue = string | number | boolean | null;

export interface AdminPolicyRecord extends ApiRecord {
  id: string;
  policy_key: string;
  key: string;
  module: string;
  label: string;
  status: "active" | "inactive";
  active: boolean;
  config: Record<string, AdminPolicyValue>;
  derived_preview?: Record<string, AdminPolicyValue>;
  updated_at: string;
  version: number;
}

export interface AdminPolicyListResponse extends ApiRecord {
  items: AdminPolicyRecord[];
  policies: AdminPolicyRecord[];
  versions: Record<string, number>;
}

export interface AdminPolicyUpdateInput extends ApiRecord {
  label?: string;
  active?: boolean;
  status?: "active" | "inactive";
  config?: Record<string, AdminPolicyValue>;
  expected_version: number;
}

export interface AdminEmailTemplateRecord extends ApiRecord {
  id: string;
  template_key: string;
  key: string;
  module: string;
  name: string;
  subject: string;
  body: string;
  locale: string;
  status: "active" | "inactive";
  active: boolean;
  updated_at: string;
  version: number;
}

export interface AdminEmailTemplateListResponse extends ApiRecord {
  items: AdminEmailTemplateRecord[];
  templates: AdminEmailTemplateRecord[];
  versions: Record<string, number>;
}

export interface AdminEmailTemplateUpdateInput extends ApiRecord {
  name?: string;
  subject?: string;
  body?: string;
  locale?: string;
  active?: boolean;
  status?: "active" | "inactive";
  expected_version: number;
}

export interface AdminNotificationChannelRecord extends ApiRecord {
  id: string;
  event_key: string;
  key: string;
  module: string;
  label: string;
  in_app_enabled: boolean;
  inApp: boolean;
  email_enabled: boolean;
  email: boolean;
  push_enabled: boolean;
  push: boolean;
  status: "active" | "inactive";
  active: boolean;
  updated_at: string;
  version: number;
}

export interface AdminNotificationChannelListResponse extends ApiRecord {
  items: AdminNotificationChannelRecord[];
  channels: AdminNotificationChannelRecord[];
  events: AdminNotificationChannelRecord[];
  versions: Record<string, number>;
  version: number;
}

export interface AdminNotificationChannelInput extends ApiRecord {
  event_key?: string;
  key?: string;
  label?: string;
  in_app_enabled?: boolean;
  inApp?: boolean;
  email_enabled?: boolean;
  email?: boolean;
  push_enabled?: boolean;
  push?: boolean;
  active?: boolean;
  status?: "active" | "inactive";
}

export interface AdminNotificationChannelsUpdateInput extends ApiRecord {
  channels: AdminNotificationChannelInput[];
  expected_version: number;
}

export interface AdminAuditLogEntry extends ApiRecord {
  id: string;
  event_id: string;
  actor: string;
  actor_user_id: string | null;
  action: string;
  event_type: string;
  target: string;
  module: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  at: string;
  created_at: string;
  ip: string;
}

export interface AdminSecuritySettingsRecord extends ApiRecord {
  id: string;
  settings_key: "default";
  password_min_length: number;
  passwordMinLength: number;
  password_require_special: boolean;
  passwordRequireSpecial: boolean;
  password_require_number: boolean;
  passwordRequireNumber: boolean;
  password_expiry_days: number;
  passwordExpiryDays: number;
  session_timeout_minutes: number;
  sessionTimeoutMinutes: number;
  login_attempt_limit: number;
  loginAttemptLimit: number;
  mfa_enabled: false;
  mfaEnabled: false;
  audit_role_changes: boolean;
  auditRoleChanges: boolean;
  ip_device_audit_enabled: boolean;
  ipDeviceAuditEnabled: boolean;
  updated_at: string;
  version: number;
}

export interface AdminSecuritySettingsUpdateInput extends ApiRecord {
  password_min_length?: number;
  passwordMinLength?: number;
  password_require_special?: boolean;
  passwordRequireSpecial?: boolean;
  password_require_number?: boolean;
  passwordRequireNumber?: boolean;
  password_expiry_days?: number;
  passwordExpiryDays?: number;
  session_timeout_minutes?: number;
  sessionTimeoutMinutes?: number;
  login_attempt_limit?: number;
  loginAttemptLimit?: number;
  mfa_enabled?: false;
  mfaEnabled?: false;
  audit_role_changes?: boolean;
  auditRoleChanges?: boolean;
  ip_device_audit_enabled?: boolean;
  ipDeviceAuditEnabled?: boolean;
  expected_version: number;
}

export const adminApi = {
  getCompanyProfile() {
    return apiRequest<CompanyProfileResponse>("/api/v1/admin/company-profile");
  },
  updateCompanyProfile(input: CompanyProfileUpdateInput) {
    return apiRequest<CompanyProfileResponse>("/api/v1/admin/company-profile", {
      method: "PUT",
      body: input,
    });
  },
  uploadCompanyLogo(
    input: FormData,
    command: {
      idempotencyKey: string;
      expectedVersion: number;
      expectedPointerDocumentId: string | null;
    },
  ) {
    return apiRequest<AdminCompanyLogoUploadResponse>("/api/v1/admin/company-profile/logo", {
      method: "POST",
      body: input,
      headers: {
        "Idempotency-Key": command.idempotencyKey,
        "X-Expected-Version": String(command.expectedVersion),
        "X-Expected-Pointer-Document-Id": command.expectedPointerDocumentId ?? "none",
      },
    });
  },
  listDepartments(
    params: { page?: number; page_size?: number; active_only?: boolean; search?: string } = {},
  ) {
    const path = "/api/v1/admin/master-data/departments";
    return apiRequest<MasterDataListResponse<DepartmentMasterRecord>>(
      `${path}${queryString(params)}`,
    );
  },
  createDepartment(input: DepartmentMasterInput) {
    return apiRequest<{ department: DepartmentMasterRecord; version: number }>(
      "/api/v1/admin/master-data/departments",
      {
        method: "POST",
        body: input,
      },
    );
  },
  updateDepartment(id: string, input: DepartmentMasterInput & { expected_version: number }) {
    return apiRequest<{ department: DepartmentMasterRecord; version: number }>(
      `/api/v1/admin/master-data/departments/${id}`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },
  listDesignations(
    params: { page?: number; page_size?: number; active_only?: boolean; search?: string } = {},
  ) {
    const path = "/api/v1/admin/master-data/designations";
    return apiRequest<MasterDataListResponse<DesignationMasterRecord>>(
      `${path}${queryString(params)}`,
    );
  },
  createDesignation(input: DesignationMasterInput) {
    return apiRequest<{ designation: DesignationMasterRecord; version: number }>(
      "/api/v1/admin/master-data/designations",
      {
        method: "POST",
        body: input,
      },
    );
  },
  updateDesignation(id: string, input: DesignationMasterInput & { expected_version: number }) {
    return apiRequest<{ designation: DesignationMasterRecord; version: number }>(
      `/api/v1/admin/master-data/designations/${id}`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },
  listExtendedMasterData(
    masterKey: ExtendedMasterDataKey,
    params: { page?: number; page_size?: number; active_only?: boolean; search?: string } = {},
  ) {
    const path = `/api/v1/admin/master-data/${masterKey}`;
    return apiRequest<MasterDataListResponse<ExtendedMasterDataRecord>>(
      `${path}${queryString(params)}`,
    );
  },
  createExtendedMasterData(masterKey: ExtendedMasterDataKey, input: ExtendedMasterDataInput) {
    return apiRequest<{ item: ExtendedMasterDataRecord; version: number }>(
      `/api/v1/admin/master-data/${masterKey}`,
      {
        method: "POST",
        body: input,
      },
    );
  },
  updateExtendedMasterData(
    masterKey: ExtendedMasterDataKey,
    id: string,
    input: ExtendedMasterDataInput & { expected_version: number },
  ) {
    return apiRequest<{ item: ExtendedMasterDataRecord; version: number }>(
      `/api/v1/admin/master-data/${masterKey}/${id}`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },
  listRbacRoles(params: { page?: number; page_size?: number; active_only?: boolean } = {}) {
    const path = "/api/v1/admin/rbac/roles";
    return apiRequest<MasterDataListResponse<RbacRoleRecord>>(`${path}${queryString(params)}`);
  },
  createRbacRole(input: RbacRoleInput) {
    return apiRequest<{ role: RbacRoleRecord; version: number }>("/api/v1/admin/rbac/roles", {
      method: "POST",
      body: input,
    });
  },
  updateRbacRole(id: string, input: RbacRoleUpdateInput) {
    return apiRequest<{ role: RbacRoleRecord; version: number }>(`/api/v1/admin/rbac/roles/${id}`, {
      method: "PATCH",
      body: input,
    });
  },
  listRbacPermissions(params: { module?: string; search?: string } = {}) {
    const path = "/api/v1/admin/rbac/permissions";
    return apiRequest<{ items: RbacPermissionRecord[] }>(`${path}${queryString(params)}`);
  },
  replaceRbacRolePermissions(id: string, input: RbacRolePermissionsInput) {
    return apiRequest<{ role: RbacRoleRecord; version: number }>(
      `/api/v1/admin/rbac/roles/${id}/permissions`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminWorkflows(params: { module?: string } = {}) {
    const path = "/api/v1/admin/workflows";
    return apiRequest<AdminWorkflowListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminWorkflow(workflowKey: string, input: AdminWorkflowUpdateInput) {
    return apiRequest<{ workflow: AdminWorkflowRecord; version: number }>(
      `/api/v1/admin/workflows/${workflowKey}`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminPolicies(params: { module?: string; active_only?: boolean } = {}) {
    const path = "/api/v1/admin/policies";
    return apiRequest<AdminPolicyListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminPolicy(policyKey: string, input: AdminPolicyUpdateInput) {
    return apiRequest<{ policy: AdminPolicyRecord; version: number }>(
      `/api/v1/admin/policies/${policyKey}`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminEmailTemplates(
    params: { module?: string; locale?: string; active_only?: boolean } = {},
  ) {
    const path = "/api/v1/admin/email-templates";
    return apiRequest<AdminEmailTemplateListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminEmailTemplate(templateKey: string, input: AdminEmailTemplateUpdateInput) {
    return apiRequest<{ template: AdminEmailTemplateRecord; version: number }>(
      `/api/v1/admin/email-templates/${templateKey}`,
      {
        method: "PUT",
        body: input,
      },
    );
  },
  listAdminNotificationChannels(params: { module?: string; active_only?: boolean } = {}) {
    const path = "/api/v1/admin/notification-channels";
    return apiRequest<AdminNotificationChannelListResponse>(`${path}${queryString(params)}`);
  },
  updateAdminNotificationChannels(input: AdminNotificationChannelsUpdateInput) {
    return apiRequest<AdminNotificationChannelListResponse>("/api/v1/admin/notification-channels", {
      method: "PUT",
      body: input,
    });
  },
  listAdminAuditLog(
    params: {
      page?: number;
      page_size?: number;
      module?: string;
      actor_user_id?: string;
      from?: string;
      to?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) {
    const path = "/api/v1/admin/audit-log";
    return apiRequest<MasterDataListResponse<AdminAuditLogEntry>>(`${path}${queryString(params)}`);
  },
  getAdminSecuritySettings() {
    return apiRequest<AdminSecuritySettingsRecord>("/api/v1/admin/security-settings");
  },
  updateAdminSecuritySettings(input: AdminSecuritySettingsUpdateInput) {
    return apiRequest<{ settings: AdminSecuritySettingsRecord; version: number }>(
      "/api/v1/admin/security-settings",
      {
        method: "PUT",
        body: input,
      },
    );
  },
  getFinanceGovernance() {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance");
  },
  updateFinanceGovernance(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance", {
      method: "PUT",
      body: input,
    });
  },
  listManagerBackupsPage(page: number) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/manager-backups", {
      query: { page, page_size: MANAGER_BACKUP_PAGE_SIZE },
    });
  },
  async listManagerBackups() {
    const items: ApiRecord[] = [];
    const seenIds = new Set<string>();
    let page = 1;
    let expectedTotal: number | undefined;

    while (expectedTotal === undefined || items.length < expectedTotal) {
      const response = await this.listManagerBackupsPage(page);
      assertManagerBackupPage(response, page, expectedTotal);
      expectedTotal ??= response.total;
      if (response.items.length === 0 && items.length < expectedTotal) {
        throw new Error("Manager backup pagination stopped before every assignment was loaded.");
      }
      for (const item of response.items) {
        const id = typeof item.id === "string" ? item.id : null;
        if (!id || seenIds.has(id)) {
          throw new Error("Manager backup pagination returned a missing or duplicate assignment.");
        }
        seenIds.add(id);
        items.push(item);
      }
      if (items.length > expectedTotal) {
        throw new Error("Manager backup pagination returned more assignments than reported.");
      }
      page += 1;
    }

    return items;
  },
  createManagerBackup(input: ApiRecord) {
    return withExpenseCommandKey(
      String(input.employee_user_id ?? "reviewer-routing"),
      "reviewer-routing.create",
      input,
      (key) =>
        apiRequest<ApiRecord>("/api/v1/manager-backups", {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": key },
        }),
    );
  },
  deleteManagerBackup(id: string, expectedVersion: number) {
    const input = { expected_version: expectedVersion };
    return withExpenseCommandKey(id, "reviewer-routing.revoke", input, (key) =>
      apiRequest<ApiRecord>(`/api/v1/manager-backups/${id}`, {
        method: "DELETE",
        query: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  createTimesheetWorkflowDefinition(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/workflow-definitions", {
      method: "POST",
      body: input,
    });
  },
};

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}
