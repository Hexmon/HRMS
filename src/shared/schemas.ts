import { z } from "zod";
import {
  AttendancePunchEventTypes,
  AssetStatuses,
  DocumentClassifications,
  ExpenseDecisions,
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  LeaveRequestStatuses,
  LeaveTypes,
  PaymentTypes,
  TimesheetStatuses
} from "./constants.js";

export const uuidSchema = z.uuid();
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const isoDateTimeSchema = z.iso.datetime();
export const moneySchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/u, "Use a fixed precision decimal string");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().max(64).optional()
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    page_size: z.number().int().min(1),
    total: z.number().int().min(0)
  });

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  request_id: z.string()
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const expenseLineItemInputSchema = z.object({
  line_category: z.string().min(1),
  description: z.string().min(1),
  quantity: moneySchema.optional(),
  unit_cost: moneySchema.optional(),
  line_total: moneySchema,
  tax_amount: moneySchema.optional(),
  vendor_name: z.string().optional()
});

export const expenseCreateSchema = z.object({
  submit: z.boolean().default(false),
  expense_type: z.enum([ExpenseTypes.Project, ExpenseTypes.SalesPreSales]),
  expense_sub_type: z.enum([
    ExpenseSubTypes.ProjectTravel,
    ExpenseSubTypes.MaterialConsumables,
    ExpenseSubTypes.LodgingBoarding,
    ExpenseSubTypes.ClientMeeting,
    ExpenseSubTypes.DemoPresentation,
    ExpenseSubTypes.MarketingEvent,
    ExpenseSubTypes.SalesTravel,
    ExpenseSubTypes.MiscSalesExpense
  ]),
  project_code: z.string().optional(),
  client_name: z.string().optional(),
  task_title: z.string().min(1),
  task_description: z.string().min(1),
  location: z.string().optional(),
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  estimated_amount: moneySchema,
  payment_type: z.enum([PaymentTypes.Advance, PaymentTypes.ReimbursementAccrued]),
  advance_amount: moneySchema.optional(),
  advance_justification: z.string().optional(),
  line_items: z.array(expenseLineItemInputSchema).min(1)
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const managerBackupAssignmentCreateSchema = z.object({
  employee_user_id: uuidSchema,
  backup_manager_user_id: uuidSchema,
  effective_from: isoDateSchema,
  effective_to: isoDateSchema.optional()
});

export const expenseDecisionSchema = z.object({
  decision: z.enum([ExpenseDecisions.Approve, ExpenseDecisions.Reject, ExpenseDecisions.Return]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const financeVerifySchema = z.object({
  decision: z.enum([
    ExpenseDecisions.Verify,
    ExpenseDecisions.Hold,
    ExpenseDecisions.Clarification
  ]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const paymentReleaseSchema = z.object({
  payment_date: isoDateSchema,
  amount: moneySchema,
  payment_mode: z.string().min(1),
  reference_no: z.string().min(1),
  expected_version: z.number().int().min(1)
});

export const settlementSchema = z.object({
  actual_amount: moneySchema,
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const documentUploadSchema = z.object({
  business_object_type: z.string().min(1),
  business_object_id: uuidSchema,
  classification: z.enum([
    DocumentClassifications.Normal,
    DocumentClassifications.Finance,
    DocumentClassifications.Medical,
    DocumentClassifications.Compensation,
    DocumentClassifications.Legal,
    DocumentClassifications.Audit
  ]),
  document_type: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().min(1),
  checksum_sha256: z.string().optional()
});

export const assetCreateSchema = z.object({
  asset_code: z.string().min(1),
  asset_type: z.string().min(1),
  name: z.string().min(1),
  serial_no: z.string().optional()
});

export const assetAssignSchema = z.object({
  assigned_to_user_id: uuidSchema,
  expected_version: z.number().int().min(1)
});

export const licenseActivationSchema = z.object({
  product_id: uuidSchema,
  entitlement_id: uuidSchema,
  hardware_fingerprint: z.string().min(8)
});

export const workSegmentSchema = z.object({
  work_date: isoDateSchema,
  project_code: z.string().optional(),
  task_code: z.string().optional(),
  hours: moneySchema,
  description: z.string().optional(),
  billable: z.boolean().default(false)
});

export const timesheetSubmissionSchema = z.object({
  cycle_start: isoDateSchema,
  cycle_end: isoDateSchema
});

export const timesheetDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "return"]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const attendancePunchSchema = z.object({
  event_type: z.enum([
    AttendancePunchEventTypes.CheckIn,
    AttendancePunchEventTypes.BreakStart,
    AttendancePunchEventTypes.BreakEnd,
    AttendancePunchEventTypes.CheckOut
  ]),
  occurred_at: isoDateTimeSchema.optional(),
  work_mode: z.enum(["office", "remote", "wfh", "field"]).default("office"),
  source: z.enum(["web", "mobile", "kiosk", "admin"]).default("web"),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const attendanceRegularizationCreateSchema = z.object({
  work_date: isoDateSchema,
  reason: z.string().min(3).max(1000),
  requested_punches: z
    .array(
      z.object({
        event_type: z.enum([
          AttendancePunchEventTypes.CheckIn,
          AttendancePunchEventTypes.BreakStart,
          AttendancePunchEventTypes.BreakEnd,
          AttendancePunchEventTypes.CheckOut
        ]),
        occurred_at: isoDateTimeSchema
      })
    )
    .default([])
});

export const attendanceRegularizationDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "return"]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export const leaveRequestCreateSchema = z.object({
  leave_type: z.enum([
    LeaveTypes.Casual,
    LeaveTypes.Sick,
    LeaveTypes.Earned,
    LeaveTypes.Unpaid,
    LeaveTypes.CompOff
  ]),
  date_from: isoDateSchema,
  date_to: isoDateSchema,
  half_day: z.boolean().default(false),
  reason: z.string().min(3).max(1000),
  document_ids: z.array(uuidSchema).default([])
});

export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>;

export const wfhRequestCreateSchema = z.object({
  date_from: isoDateSchema,
  date_to: isoDateSchema,
  half_day: z.boolean().default(false),
  reason: z.string().min(3).max(1000),
  project_ref: z.string().trim().max(120).optional()
});

export type WfhRequestCreateInput = z.infer<typeof wfhRequestCreateSchema>;

export const leaveWfhDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "return"]),
  remarks: z.string().optional(),
  expected_version: z.number().int().min(1)
});

export type LeaveWfhDecisionInput = z.infer<typeof leaveWfhDecisionSchema>;

export const leaveWfhCancelSchema = z.object({
  remarks: z.string().max(1000).optional(),
  expected_version: z.number().int().min(1)
});

export type LeaveWfhCancelInput = z.infer<typeof leaveWfhCancelSchema>;

export const holidayUpsertSchema = z.object({
  name: z.string().min(2).max(160),
  date: isoDateSchema,
  region: z.string().trim().min(1).max(80).default("All"),
  optional: z.boolean().default(false),
  expected_version: z.number().int().min(1).optional()
});

export type HolidayUpsertInput = z.infer<typeof holidayUpsertSchema>;

export const workflowDefinitionSchema = z.object({
  name: z.string().min(1),
  definition: z.object({
    approver_strategy: z.enum(["ltree_manager", "project_manager", "hr_manager"]),
    require_billable_review: z.boolean().default(false)
  })
});

export const statusContractSchemas = {
  expense: z.enum([
    ExpenseStatuses.Draft,
    ExpenseStatuses.Submitted,
    ExpenseStatuses.PendingManagerVerification,
    ExpenseStatuses.ManagerReturned,
    ExpenseStatuses.ManagerRejected,
    ExpenseStatuses.ManagerVerified,
    ExpenseStatuses.FinanceHold,
    ExpenseStatuses.ClarificationRequired,
    ExpenseStatuses.FinanceApproved,
    ExpenseStatuses.PaymentReleased,
    ExpenseStatuses.BillsSubmitted,
    ExpenseStatuses.PendingAdjustment,
    ExpenseStatuses.Closed,
    ExpenseStatuses.FinanceRoutingException,
    ExpenseStatuses.Cancelled
  ]),
  asset: z.enum([
    AssetStatuses.Procured,
    AssetStatuses.InStock,
    AssetStatuses.Assigned,
    AssetStatuses.InMaintenance,
    AssetStatuses.ReturnPending,
    AssetStatuses.Returned,
    AssetStatuses.Retired,
    AssetStatuses.LostStolen
  ]),
  timesheet: z.enum([
    TimesheetStatuses.Draft,
    TimesheetStatuses.Submitted,
    TimesheetStatuses.PendingApproval,
    TimesheetStatuses.Approved,
    TimesheetStatuses.Returned,
    TimesheetStatuses.Rejected
  ]),
  leave: z.enum([
    LeaveRequestStatuses.PendingManager,
    LeaveRequestStatuses.Approved,
    LeaveRequestStatuses.Returned,
    LeaveRequestStatuses.Rejected,
    LeaveRequestStatuses.Cancelled
  ])
};
