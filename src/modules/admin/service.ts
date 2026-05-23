import type { AuthUser } from "#shared";
import type { CompanyProfileRecord, MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { AdminRepository } from "./repository.js";
import type { CompanyProfileUpdateInput } from "./schemas.js";
import { assertCanManageAdminSettings } from "./policy.js";

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
