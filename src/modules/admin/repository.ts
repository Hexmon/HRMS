import { randomUUID } from "node:crypto";
import type { Department, Designation } from "#shared";
import type { CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, notFound } from "../../platform/errors.js";
import type {
  CompanyProfileUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
  DesignationCreateInput,
  DesignationUpdateInput
} from "./schemas.js";

export class AdminRepository {
  constructor(private readonly store: MemoryDataStore) {}

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
