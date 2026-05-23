import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

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

export interface MasterDataListResponse<T extends ApiRecord> extends ApiRecord {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface DepartmentMasterRecord extends ApiRecord {
  id: string;
  department_code: string;
  code: string;
  name: string;
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

export interface DepartmentMasterInput extends ApiRecord {
  name?: string;
  code?: string;
  department_code?: string;
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
  getFinanceGovernance() {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance");
  },
  updateFinanceGovernance(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance", {
      method: "PUT",
      body: input,
    });
  },
  listManagerBackups() {
    return apiRequest<ApiRecord[]>("/api/v1/manager-backups");
  },
  createManagerBackup(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/manager-backups", {
      method: "POST",
      body: input,
    });
  },
  deleteManagerBackup(id: string) {
    return apiRequest<void>(`/api/v1/manager-backups/${id}`, { method: "DELETE" });
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
