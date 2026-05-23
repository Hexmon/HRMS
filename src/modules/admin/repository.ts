import { randomUUID } from "node:crypto";
import type { Department, Designation, AdminPolicyConfigRecord, AdminWorkflowConfigRecord, RbacRolePermissionRecord, RbacRoleRecord } from "#shared";
import type { CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { buildDefaultAdminPolicies, buildDefaultAdminWorkflows, nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, notFound } from "../../platform/errors.js";
import type {
  CompanyProfileUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  DesignationCreateInput,
  DesignationUpdateInput,
  RbacRoleCreateInput,
  RbacRolePermissionsReplaceInput,
  RbacRoleUpdateInput
} from "./schemas.js";

export class AdminRepository {
  constructor(private readonly store: MemoryDataStore) {}

  listAdminWorkflows(): AdminWorkflowConfigRecord[] {
    this.ensureAdminWorkflows();
    return this.store.adminWorkflows.filter((workflow) => !workflow.deleted_at);
  }

  listAdminPolicies(): AdminPolicyConfigRecord[] {
    this.ensureAdminPolicies();
    return this.store.adminPolicies.filter((policy) => !policy.deleted_at);
  }

  adminWorkflowByKey(workflowKey: string): AdminWorkflowConfigRecord {
    this.ensureAdminWorkflows();
    const workflow = this.store.adminWorkflows.find((candidate) => candidate.workflow_key === workflowKey && !candidate.deleted_at);
    if (!workflow) throw notFound("Admin workflow configuration not found", { workflow_key: workflowKey });
    return workflow;
  }

  adminPolicyByKey(policyKey: string): AdminPolicyConfigRecord {
    this.ensureAdminPolicies();
    const policy = this.store.adminPolicies.find((candidate) => candidate.policy_key === policyKey && !candidate.deleted_at);
    if (!policy) throw notFound("Admin policy configuration not found", { policy_key: policyKey });
    return policy;
  }

  updateAdminWorkflow(workflowKey: string, input: AdminWorkflowUpdateData): AdminWorkflowConfigRecord {
    const workflow = this.adminWorkflowByKey(workflowKey);
    if (workflow.version !== input.expected_version) {
      throw conflict("Admin workflow configuration was modified by another actor.", {
        aggregate: "admin_workflow",
        workflow_key: workflowKey,
        expected_version: input.expected_version,
        current_version: workflow.version
      });
    }
    if (input.label) workflow.label = input.label.trim();
    if (input.status) workflow.status = input.status;
    if (input.stages) workflow.stages = input.stages;
    workflow.updated_at = nowIso();
    workflow.version += 1;
    return workflow;
  }

  updateAdminPolicy(policyKey: string, input: AdminPolicyUpdateData): AdminPolicyConfigRecord {
    const policy = this.adminPolicyByKey(policyKey);
    if (policy.version !== input.expected_version) {
      throw conflict("Admin policy configuration was modified by another actor.", {
        aggregate: "admin_policy",
        policy_key: policyKey,
        expected_version: input.expected_version,
        current_version: policy.version
      });
    }
    if (input.label) policy.label = input.label.trim();
    if (input.status) policy.status = input.status;
    if (input.config) policy.config = input.config;
    policy.updated_at = nowIso();
    policy.version += 1;
    return policy;
  }

  getCurrentCompanyProfile(): CompanyProfileRecord {
    let company =
      this.store.companyProfiles.find((candidate) => candidate.status === "active") ??
      this.store.companyProfiles.at(-1) ??
      null;
    if (!company) {
      company = defaultCompanyProfile();
      this.store.companyProfiles.push(company);
    }
    return company;
  }

  updateCurrentCompanyProfile(input: CompanyProfileUpdateInput): CompanyProfileRecord {
    const company = this.getCurrentCompanyProfile();
    if (company.version !== input.expected_version) {
      throw conflict("Company profile was modified by another actor.", {
        aggregate: "company_profile",
        id: company.id,
        expected_version: input.expected_version,
        current_version: company.version
      });
    }

    company.company_name = input.company_name?.trim() || company.company_name;
    company.website = normalizeNullable(input.website, company.website);
    company.industry = normalizeNullable(input.industry, company.industry);
    company.address = normalizeNullable(input.address, company.address);
    company.timezone = input.timezone?.trim() || company.timezone;
    company.locale = input.locale?.trim() || company.locale;
    company.currency = input.currency?.trim() || company.currency;
    company.fiscal_year_start_month = input.fiscal_year_start_month ?? company.fiscal_year_start_month;
    company.working_week = input.working_week?.trim() || company.working_week;
    company.work_hours_per_day = input.work_hours_per_day ?? company.work_hours_per_day;
    company.logo_label = normalizeNullable(input.logo_label, company.logo_label);
    company.updated_at = nowIso();
    company.version += 1;
    return company;
  }

  listRbacRoles(): RbacRoleRecord[] {
    return this.store.rbacRoles.filter((role) => !role.deleted_at);
  }

  rolePermissionsFor(roleKey: string): RbacRolePermissionRecord[] {
    return this.store.rbacRolePermissions.filter((permission) => permission.role_key === roleKey && !permission.deleted_at && permission.status === "active");
  }

  createRbacRole(input: RbacRoleCreateInput): RbacRoleRecord {
    const roleKey = normalizeRbacRoleKey(input.role_key ?? input.key ?? input.name);
    this.assertUniqueRbacRoleKey(roleKey);
    const now = nowIso();
    const role: RbacRoleRecord = {
      id: randomUUID(),
      role_key: roleKey,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      status: "active",
      builtin: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1
    };
    this.store.rbacRoles.push(role);
    for (const permissionId of input.permission_ids) {
      this.store.rbacRolePermissions.push(newRolePermission(role.role_key, permissionId, now));
    }
    return role;
  }

  updateRbacRole(id: string, input: RbacRoleUpdateInput): RbacRoleRecord {
    const role = this.store.rbacRoles.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!role) throw notFound("RBAC role not found", { id });
    if (role.version !== input.expected_version) {
      throw conflict("RBAC role was modified by another actor.", {
        aggregate: "rbac_role",
        id,
        expected_version: input.expected_version,
        current_version: role.version
      });
    }
    if (input.name) role.name = input.name.trim();
    if (input.description !== undefined) role.description = input.description.trim();
    if (input.status) role.status = input.status;
    role.updated_at = nowIso();
    role.version += 1;
    return role;
  }

  replaceRbacRolePermissions(
    role: RbacRoleRecord,
    input: RbacRolePermissionsReplaceInput
  ): RbacRoleRecord {
    if (role.version !== input.expected_version) {
      throw conflict("RBAC role was modified by another actor.", {
        aggregate: "rbac_role",
        id: role.id,
        expected_version: input.expected_version,
        current_version: role.version
      });
    }
    const now = nowIso();
    const requested = new Set(input.permission_ids);
    for (const permission of this.store.rbacRolePermissions.filter((candidate) => candidate.role_key === role.role_key)) {
      if (requested.has(permission.permission_id)) {
        permission.status = "active";
        permission.deleted_at = null;
        permission.updated_at = now;
        requested.delete(permission.permission_id);
      } else if (!permission.deleted_at && permission.status === "active") {
        permission.status = "inactive";
        permission.deleted_at = now;
        permission.updated_at = now;
      }
    }
    for (const permissionId of requested) {
      this.store.rbacRolePermissions.push(newRolePermission(role.role_key, permissionId, now));
    }
    role.updated_at = now;
    role.version += 1;
    return role;
  }

  rbacRoleById(id: string): RbacRoleRecord {
    const role = this.store.rbacRoles.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!role) throw notFound("RBAC role not found", { id });
    return role;
  }

  listDepartments(): Department[] {
    return this.store.departments.filter((department) => !department.deleted_at);
  }

  createDepartment(input: DepartmentCreateInput): Department {
    const code = normalizeCode(input.department_code ?? input.code ?? input.name);
    this.assertUniqueDepartmentCode(code);
    const department: Department = {
      id: randomUUID(),
      department_code: code,
      name: input.name.trim(),
      parent_department_id: input.parent_department_id ?? input.parent_id ?? null,
      director_user_id: null,
      status: input.status ?? "active",
      deleted_at: null,
      version: 1
    };
    this.store.departments.push(department);
    return department;
  }

  updateDepartment(id: string, input: DepartmentUpdateInput): Department {
    const department = this.store.departments.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!department) throw notFound("Department not found", { id });
    if (department.version !== input.expected_version) {
      throw conflict("Department was modified by another actor.", {
        aggregate: "department",
        id,
        expected_version: input.expected_version,
        current_version: department.version
      });
    }
    const nextCode = input.department_code ?? input.code;
    if (nextCode) {
      const normalized = normalizeCode(nextCode);
      this.assertUniqueDepartmentCode(normalized, id);
      department.department_code = normalized;
    }
    if (input.name) department.name = input.name.trim();
    if (input.parent_department_id !== undefined || input.parent_id !== undefined) {
      department.parent_department_id = input.parent_department_id ?? input.parent_id ?? null;
    }
    if (input.status) department.status = input.status;
    department.version += 1;
    return department;
  }

  listDesignations(): Designation[] {
    return this.store.designations.filter((designation) => !designation.deleted_at);
  }

  createDesignation(input: DesignationCreateInput): Designation {
    const title = input.title ?? input.name;
    if (!title) {
      throw badRequest("Designation title is required", { field: "title" });
    }
    const code = normalizeCode(input.designation_code ?? input.code ?? title);
    this.assertUniqueDesignationCode(code);
    const designation: Designation = {
      id: randomUUID(),
      designation_code: code,
      title: title.trim(),
      level: input.level ?? null,
      status: input.status ?? "active",
      deleted_at: null,
      version: 1
    };
    this.store.designations.push(designation);
    return designation;
  }

  updateDesignation(id: string, input: DesignationUpdateInput): Designation {
    const designation = this.store.designations.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!designation) throw notFound("Designation not found", { id });
    if (designation.version !== input.expected_version) {
      throw conflict("Designation was modified by another actor.", {
        aggregate: "designation",
        id,
        expected_version: input.expected_version,
        current_version: designation.version
      });
    }
    const nextCode = input.designation_code ?? input.code;
    if (nextCode) {
      const normalized = normalizeCode(nextCode);
      this.assertUniqueDesignationCode(normalized, id);
      designation.designation_code = normalized;
    }
    const title = input.title ?? input.name;
    if (title) designation.title = title.trim();
    if (input.level !== undefined) designation.level = input.level;
    if (input.status) designation.status = input.status;
    designation.version += 1;
    return designation;
  }

  private assertUniqueDepartmentCode(code: string, currentId?: string): void {
    const duplicate = this.store.departments.find(
      (candidate) => !candidate.deleted_at && candidate.id !== currentId && candidate.department_code.toUpperCase() === code
    );
    if (duplicate) {
      throw conflict("Department code already exists", { department_code: code });
    }
  }

  private assertUniqueDesignationCode(code: string, currentId?: string): void {
    const duplicate = this.store.designations.find(
      (candidate) => !candidate.deleted_at && candidate.id !== currentId && candidate.designation_code.toUpperCase() === code
    );
    if (duplicate) {
      throw conflict("Designation code already exists", { designation_code: code });
    }
  }

  private assertUniqueRbacRoleKey(roleKey: string): void {
    const duplicate = this.store.rbacRoles.find((candidate) => !candidate.deleted_at && candidate.role_key.toLowerCase() === roleKey.toLowerCase());
    if (duplicate) {
      throw conflict("RBAC role key already exists", { role_key: roleKey });
    }
  }

  private ensureAdminWorkflows(): void {
    const existingKeys = new Set(this.store.adminWorkflows.filter((workflow) => !workflow.deleted_at).map((workflow) => workflow.workflow_key));
    const missingDefaults = buildDefaultAdminWorkflows(nowIso()).filter((workflow) => !existingKeys.has(workflow.workflow_key));
    this.store.adminWorkflows.push(...missingDefaults);
  }

  private ensureAdminPolicies(): void {
    const existingKeys = new Set(this.store.adminPolicies.filter((policy) => !policy.deleted_at).map((policy) => policy.policy_key));
    const missingDefaults = buildDefaultAdminPolicies(nowIso()).filter((policy) => !existingKeys.has(policy.policy_key));
    this.store.adminPolicies.push(...missingDefaults);
  }
}

export interface AdminWorkflowUpdateData {
  label?: string;
  status?: "active" | "inactive";
  stages?: AdminWorkflowConfigRecord["stages"];
  expected_version: number;
}

export interface AdminPolicyUpdateData {
  label?: string;
  status?: "active" | "inactive";
  config?: Record<string, unknown>;
  expected_version: number;
}

function defaultCompanyProfile(): CompanyProfileRecord {
  const now = nowIso();
  return {
    id: randomUUID(),
    company_name: "Hawkaii HRMS",
    company_slug: "hawkaii-hrms",
    website: "https://hawkaii.com",
    industry: "Software / SaaS",
    address: null,
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    fiscal_year_start_month: 4,
    working_week: "Mon-Fri",
    work_hours_per_day: 8,
    logo_label: "HK",
    status: "active",
    bootstrap_completed_at: now,
    created_at: now,
    updated_at: now,
    version: 1
  };
}

function normalizeNullable(value: string | null | undefined, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 40);
  if (!normalized) {
    throw badRequest("Master data code must include at least one letter or number", { field: "code" });
  }
  return normalized;
}

function normalizeRbacRoleKey(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 80);
  if (!normalized) {
    throw badRequest("RBAC role key must include at least one visible character", { field: "role_key" });
  }
  return normalized;
}

function newRolePermission(roleKey: string, permissionId: string, now: string): RbacRolePermissionRecord {
  return {
    id: randomUUID(),
    role_key: roleKey,
    permission_id: permissionId,
    status: "active",
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
}
