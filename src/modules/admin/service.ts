import type { AuthUser, Department, Designation } from "#shared";
import type { CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { AdminRepository } from "./repository.js";
import type {
  CompanyProfileUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  DesignationCreateInput,
  DesignationUpdateInput,
  MasterDataQuery
} from "./schemas.js";
import { assertCanManageAdminSettings, assertCanManageMasterData } from "./policy.js";
import { conflict, notFound } from "../../platform/errors.js";

function page<T>(items: readonly T[], pageNumber = 1, pageSize = 25): Paginated<T> {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

export class AdminService {
  private readonly repository: AdminRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AdminRepository(store);
  }

  getCompanyProfile(actor: AuthUser): CompanyProfileResponse {
    assertCanManageAdminSettings(actor);
    return presentCompanyProfile(this.repository.getCurrentCompanyProfile());
  }

  updateCompanyProfile(actor: AuthUser, input: CompanyProfileUpdateInput): CompanyProfileResponse {
    assertCanManageAdminSettings(actor);
    const company = this.repository.updateCurrentCompanyProfile(input);
    appendOutboxEvent(this.store, {
      aggregateType: "company_profile",
      aggregateId: company.id,
      eventType: "admin.company_profile.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version"),
        company_name: company.company_name
      },
      idempotencyKey: `admin.company_profile.updated:${company.id}:${company.version}`
    });
    return presentCompanyProfile(company);
  }

  listDepartments(actor: AuthUser, query: MasterDataQuery): Paginated<DepartmentResponse> {
    assertCanManageMasterData(actor);
    const search = query.search?.trim().toLowerCase();
    const filtered = this.repository
      .listDepartments()
      .filter((department) => !query.active_only || department.status === "active")
      .filter((department) => {
        if (!search) return true;
        return department.name.toLowerCase().includes(search) || department.department_code.toLowerCase().includes(search);
      })
      .sort((a, b) => a.department_code.localeCompare(b.department_code));
    return page(filtered.map((department) => presentDepartment(department)), query.page, query.page_size);
  }

  createDepartment(actor: AuthUser, input: DepartmentCreateInput): MasterDataMutationResponse<DepartmentResponse> {
    assertCanManageMasterData(actor);
    this.assertValidDepartmentParent(input.parent_department_id ?? input.parent_id ?? null);
    const department = this.repository.createDepartment(input);
    appendOutboxEvent(this.store, {
      aggregateType: "department",
      aggregateId: department.id,
      eventType: "admin.master_data.department.created",
      payload: { actor_user_id: actor.id, department_code: department.department_code, name: department.name },
      idempotencyKey: `admin.department.created:${department.id}:${department.version}`
    });
    return { department: presentDepartment(department), version: department.version };
  }

  updateDepartment(actor: AuthUser, id: string, input: DepartmentUpdateInput): MasterDataMutationResponse<DepartmentResponse> {
    assertCanManageMasterData(actor);
    if (input.status === "inactive") {
      this.assertNoActiveUsersReference("department", id);
    }
    if (input.parent_department_id !== undefined || input.parent_id !== undefined) {
      this.assertValidDepartmentParent(input.parent_department_id ?? input.parent_id ?? null, id);
    }
    const department = this.repository.updateDepartment(id, input);
    appendOutboxEvent(this.store, {
      aggregateType: "department",
      aggregateId: department.id,
      eventType: "admin.master_data.department.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version"),
        department_code: department.department_code,
        name: department.name
      },
      idempotencyKey: `admin.department.updated:${department.id}:${department.version}`
    });
    return { department: presentDepartment(department), version: department.version };
  }

  listDesignations(actor: AuthUser, query: MasterDataQuery): Paginated<DesignationResponse> {
    assertCanManageMasterData(actor);
    const search = query.search?.trim().toLowerCase();
    const filtered = this.repository
      .listDesignations()
      .filter((designation) => !query.active_only || designation.status === "active")
      .filter((designation) => {
        if (!search) return true;
        return designation.title.toLowerCase().includes(search) || designation.designation_code.toLowerCase().includes(search);
      })
      .sort((a, b) => (a.level ?? 999).toString().localeCompare((b.level ?? 999).toString()) || a.designation_code.localeCompare(b.designation_code));
    return page(filtered.map((designation) => presentDesignation(designation)), query.page, query.page_size);
  }

  createDesignation(actor: AuthUser, input: DesignationCreateInput): MasterDataMutationResponse<DesignationResponse> {
    assertCanManageMasterData(actor);
    const designation = this.repository.createDesignation(input);
    appendOutboxEvent(this.store, {
      aggregateType: "designation",
      aggregateId: designation.id,
      eventType: "admin.master_data.designation.created",
      payload: { actor_user_id: actor.id, designation_code: designation.designation_code, title: designation.title },
      idempotencyKey: `admin.designation.created:${designation.id}:${designation.version}`
    });
    return { designation: presentDesignation(designation), version: designation.version };
  }

  updateDesignation(actor: AuthUser, id: string, input: DesignationUpdateInput): MasterDataMutationResponse<DesignationResponse> {
    assertCanManageMasterData(actor);
    if (input.status === "inactive") {
      this.assertNoActiveUsersReference("designation", id);
    }
    const designation = this.repository.updateDesignation(id, input);
    appendOutboxEvent(this.store, {
      aggregateType: "designation",
      aggregateId: designation.id,
      eventType: "admin.master_data.designation.updated",
      payload: {
        actor_user_id: actor.id,
        changed_fields: Object.keys(input).filter((field) => field !== "expected_version"),
        designation_code: designation.designation_code,
        title: designation.title
      },
      idempotencyKey: `admin.designation.updated:${designation.id}:${designation.version}`
    });
    return { designation: presentDesignation(designation), version: designation.version };
  }

  private assertValidDepartmentParent(parentId: string | null, currentId?: string): void {
    if (!parentId) return;
    if (parentId === currentId) {
      throw conflict("Department cannot be its own parent.", { parent_id: parentId });
    }
    const departments = this.repository.listDepartments();
    const parent = departments.find((department) => department.id === parentId && department.status === "active");
    if (!parent) {
      throw notFound("Parent department not found", { parent_id: parentId });
    }
    let cursor: Department | undefined = parent;
    while (cursor?.parent_department_id) {
      if (cursor.parent_department_id === currentId) {
        throw conflict("Department parent would create a hierarchy cycle.", { parent_id: parentId });
      }
      cursor = departments.find((department) => department.id === cursor?.parent_department_id);
    }
  }

  private assertNoActiveUsersReference(kind: "department" | "designation", id: string): void {
    const hasActiveReference = this.store.users.some(
      (user) =>
        !user.deleted_at &&
        user.employment_status === "active" &&
        (kind === "department" ? user.department_id === id : user.designation_id === id)
    );
    if (hasActiveReference) {
      throw conflict(`Cannot deactivate ${kind} while active employees reference it.`, { id });
    }
  }
}

export interface Paginated<T> {
  items: readonly T[];
  page: number;
  page_size: number;
  total: number;
}

export interface DepartmentResponse {
  id: string;
  department_code: string;
  code: string;
  name: string;
  parent_department_id: string | null;
  parent_id: string | null;
  director_user_id: string | null;
  status: Department["status"];
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export interface DesignationResponse {
  id: string;
  designation_code: string;
  code: string;
  title: string;
  name: string;
  level: number | null;
  status: Designation["status"];
  active: boolean;
  deleted_at: string | null;
  version: number;
}

export interface MasterDataMutationResponse<T> {
  version: number;
  department?: T;
  designation?: T;
}

export interface CompanyProfileResponse {
  id: string;
  company_name: string;
  company_slug: string;
  name: string;
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
  work_hours: number;
  logo_label: string | null;
  logoLabel: string | null;
  status: CompanyProfileRecord["status"];
  bootstrap_completed_at: string | null;
  updated_at: string;
  version: number;
}

function presentCompanyProfile(company: CompanyProfileRecord): CompanyProfileResponse {
  return {
    id: company.id,
    company_name: company.company_name,
    company_slug: company.company_slug,
    name: company.company_name,
    website: company.website,
    industry: company.industry,
    address: company.address,
    timezone: company.timezone,
    locale: company.locale,
    currency: company.currency,
    fiscal_year_start_month: company.fiscal_year_start_month,
    financial_year_start: monthName(company.fiscal_year_start_month),
    working_week: company.working_week,
    work_hours_per_day: company.work_hours_per_day,
    work_hours: company.work_hours_per_day,
    logo_label: company.logo_label,
    logoLabel: company.logo_label,
    status: company.status,
    bootstrap_completed_at: company.bootstrap_completed_at,
    updated_at: company.updated_at,
    version: company.version
  };
}

function presentDepartment(department: Department): DepartmentResponse {
  return {
    id: department.id,
    department_code: department.department_code,
    code: department.department_code,
    name: department.name,
    parent_department_id: department.parent_department_id,
    parent_id: department.parent_department_id,
    director_user_id: department.director_user_id,
    status: department.status,
    active: department.status === "active",
    deleted_at: department.deleted_at,
    version: department.version
  };
}

function presentDesignation(designation: Designation): DesignationResponse {
  return {
    id: designation.id,
    designation_code: designation.designation_code,
    code: designation.designation_code,
    title: designation.title,
    name: designation.title,
    level: designation.level,
    status: designation.status,
    active: designation.status === "active",
    deleted_at: designation.deleted_at,
    version: designation.version
  };
}

function monthName(month: number): string {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ][Math.max(1, Math.min(12, month)) - 1] ?? "January";
}
