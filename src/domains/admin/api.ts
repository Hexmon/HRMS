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
