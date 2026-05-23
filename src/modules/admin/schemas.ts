import { z } from "zod";

export const masterDataQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  active_only: z.coerce.boolean().optional(),
  search: z.string().max(160).optional()
});

const statusSchema = z.enum(["active", "inactive"]);

export const departmentCreateSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(40).optional(),
  department_code: z.string().min(2).max(40).optional(),
  parent_id: z.uuid().nullable().optional(),
  parent_department_id: z.uuid().nullable().optional(),
  status: statusSchema.optional()
});

export const departmentUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  department_code: z.string().min(2).max(40).optional(),
  parent_id: z.uuid().nullable().optional(),
  parent_department_id: z.uuid().nullable().optional(),
  status: statusSchema.optional(),
  expected_version: z.number().int().min(1)
});

export const designationCreateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  title: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  designation_code: z.string().min(2).max(40).optional(),
  level: z.number().int().min(0).max(100).nullable().optional(),
  status: statusSchema.optional()
});

export const designationUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  title: z.string().min(2).max(160).optional(),
  code: z.string().min(2).max(40).optional(),
  designation_code: z.string().min(2).max(40).optional(),
  level: z.number().int().min(0).max(100).nullable().optional(),
  status: statusSchema.optional(),
  expected_version: z.number().int().min(1)
});

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

export type MasterDataQuery = z.infer<typeof masterDataQuerySchema>;
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;
export type DesignationCreateInput = z.infer<typeof designationCreateSchema>;
export type DesignationUpdateInput = z.infer<typeof designationUpdateSchema>;
export type CompanyProfileUpdateInput = z.infer<typeof companyProfileUpdateSchema>;
