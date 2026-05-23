import { z } from "zod";

export const companyProfileUpdateSchema = z.object({
  company_name: z.string().min(2).max(160).optional(),
  website: z.string().max(240).nullable().optional(),
  industry: z.string().max(160).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  timezone: z.string().min(2).max(80).optional(),
  locale: z.string().min(2).max(20).optional(),
  currency: z.string().min(2).max(64).optional(),
  fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
  working_week: z.string().min(3).max(40).optional(),
  work_hours_per_day: z.number().min(1).max(24).optional(),
  logo_label: z.string().max(8).nullable().optional(),
  expected_version: z.number().int().min(1)
});

export type CompanyProfileUpdateInput = z.infer<typeof companyProfileUpdateSchema>;
