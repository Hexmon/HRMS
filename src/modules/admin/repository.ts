import { randomUUID } from "node:crypto";
import type { CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict } from "../../platform/errors.js";
import type { CompanyProfileUpdateInput } from "./schemas.js";

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
