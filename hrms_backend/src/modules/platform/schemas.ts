import { paginationQuerySchema } from "#shared";
import { z } from "zod";

const devicePlatformSchema = z.enum(["ios", "android"]);
const deviceLifecycleStatusSchema = z.enum([
  "registered",
  "suspended",
  "revoked",
]);

export const deviceRegistrationSchema = z.object({
  installation_id_hash: z.string().regex(/^[0-9a-f]{64}$/u),
  platform: devicePlatformSchema
}).strict();

export const deviceLifecycleReasonSchema = z.enum([
  "lost",
  "replaced",
  "user_requested",
  "security",
  "administrative",
]);

export const deviceLifecycleSchema = z.object({
  reason: deviceLifecycleReasonSchema.optional(),
}).strict();

export const deviceAdminListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(160).optional(),
  status: deviceLifecycleStatusSchema.optional(),
  platform: devicePlatformSchema.optional(),
  sort: z
    .enum([
      "updated_at_desc",
      "status_changed_at_desc",
      "employee_code_asc",
    ])
    .default("updated_at_desc"),
});

export type DeviceAdminListQuery = z.infer<typeof deviceAdminListQuerySchema>;

export const financeGovernanceUpdateSchema = z.object({
  primary_finance_manager_user_id: z.uuid(),
  manager_backup_user_id: z.uuid().nullable(),
  finance_approval_backup_user_id: z.uuid().nullable(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  expected_version: z.number().int().min(1)
});
