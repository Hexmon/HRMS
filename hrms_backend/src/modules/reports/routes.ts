import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AttendanceApprovalStates,
  Roles,
  paginationQuerySchema,
  type AttendanceApprovalState,
  type AuthUser,
} from "#shared";
import { conflict, unauthorized } from "../../platform/errors.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import { ReportService } from "./service.js";
import { assertReportRole } from "./policy.js";
import { AttendanceReportingEvidenceCategoryValues } from "../attendance/reporting-evidence.js";
import { AttendanceReportSourceCategoryValues } from "../attendance/reporting-projection.js";
import { generatedExportUnavailable, parseReportExportRequest } from "./export-boundary.js";

const attendanceApprovalStateValues = Object.values(AttendanceApprovalStates) as [
  AttendanceApprovalState,
  ...AttendanceApprovalState[],
];

function validCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const normalized = new Date(Date.UTC(year!, month! - 1, day!));
  return !Number.isNaN(normalized.getTime()) &&
    normalized.toISOString().slice(0, 10) === value;
}

function maximumExpenseReportDate(dateFrom: string): string {
  const [year, month, day] = dateFrom.split("-").map(Number);
  const maximumYear = year! + 1;
  const maximumDay = Math.min(
    day!,
    new Date(Date.UTC(maximumYear, month!, 0)).getUTCDate(),
  );
  return `${maximumYear.toString().padStart(4, "0")}-${month!
    .toString()
    .padStart(2, "0")}-${maximumDay.toString().padStart(2, "0")}`;
}

const expenseReportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine(validCalendarDate, "Expense report date must be a valid calendar date");

const reportExpenseQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  expense_type: z.string().optional(),
  expense_sub_type: z.string().optional(),
  payment_type: z.string().optional(),
  department_id: z.uuid().optional(),
  requester_user_id: z.uuid().optional(),
  manager_user_id: z.uuid().optional(),
  finance_user_id: z.uuid().optional(),
  date_from: expenseReportDateSchema.optional(),
  date_to: expenseReportDateSchema.optional(),
  document_status: z.enum(["any", "complete", "missing", "pending", "not_required"]).default("any")
}).superRefine((query, context) => {
  if (!query.date_from || !query.date_to) return;
  if (query.date_from > query.date_to) {
    context.addIssue({
      code: "custom",
      path: ["date_to"],
      message: "Expense report date range is reversed",
    });
    return;
  }
  if (query.date_to > maximumExpenseReportDate(query.date_from)) {
    context.addIssue({
      code: "custom",
      path: ["date_to"],
      message: "Expense report date range cannot exceed 12 months",
    });
  }
});

const reportSummaryQuerySchema = paginationQuerySchema.extend({
  department_id: z.uuid().optional(),
  manager_user_id: z.uuid().optional(),
  user_id: z.uuid().optional(),
  employee_user_id: z.uuid().optional(),
  evidence_category: z.enum(AttendanceReportingEvidenceCategoryValues).optional(),
  reporting_evidence_category: z
    .enum(AttendanceReportingEvidenceCategoryValues)
    .optional(),
  attendance_channel: z.string().trim().max(80).optional(),
  source_category: z.enum(AttendanceReportSourceCategoryValues).optional(),
  work_site_id: z.uuid().optional(),
  approval_state: z.enum(attendanceApprovalStateValues).optional(),
  geo_outcome: z.string().trim().max(80).optional(),
  geo_action: z.string().trim().max(80).optional(),
  review_type: z.enum(["manual_fallback", "geo_decision"]).optional(),
  reason_code: z.string().trim().max(120).optional(),
  project_id: z.uuid().optional(),
  assigned_to_user_id: z.uuid().optional(),
  actor_user_id: z.uuid().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  request_kind: z.enum(["leave", "wfh"]).optional(),
  client: z.string().optional(),
  category_id: z.uuid().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  report_type: z.string().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional()
});

const idParamSchema = z.object({ id: z.uuid() });
type ExpenseReportAudience =
  | "company"
  | "requester"
  | "manager_queue"
  | "manager_history"
  | "finance_assigned"
  | "finance_history"
  | "advance_aging"
  | "payment_register"
  | "audit";

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const withActor = (request: { actor?: AuthUser }) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return request.actor;
  };
  const expenseReportContext = async (
    actor: AuthUser,
    audience: ExpenseReportAudience,
    query?: z.infer<typeof reportExpenseQuerySchema>,
  ) => {
    const context = fastify.store.persistence?.expenseReportReadContext
      ? await fastify.store.persistence.expenseReportReadContext(actor.id, {
          audience,
          filters: query,
        })
      : { actor, companyId: undefined, store: fastify.store };
    return { actor: context.actor, service: new ReportService(context.store) };
  };
  const currentContext = async (actor: AuthUser, operation: string) => {
    if (fastify.store.persistence?.reportActorContext) {
      return fastify.store.persistence.reportActorContext(actor.id, operation);
    }
    const company = resolveActiveCompanyMembershipContext(fastify.store, {
      userId: actor.id,
      operation,
      requireActiveEmployment: true,
    });
    return { actor, companyId: company.companyId };
  };
  const ownershipUnavailable = async (actor: AuthUser, roles: Parameters<typeof assertReportRole>[1], operation: string) => {
    const current = await currentContext(actor, operation);
    assertReportRole(current.actor, roles);
    throw conflict("Report unavailable until historical company ownership is verified");
  };

  fastify.get("/expenses/my", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "requester", query);
    return context.service.myExpenses(context.actor, query);
  });

  fastify.get("/expenses/manager-queue", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "manager_queue", query);
    return context.service.managerQueue(context.actor, query);
  });

  fastify.get("/expenses/manager-history", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "manager_history", query);
    return context.service.managerHistory(context.actor, query);
  });

  fastify.get("/expenses/finance-dashboard", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "finance_assigned", query);
    return context.service.financeDashboard(context.actor, query);
  });

  fastify.get("/expenses/finance-history", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "finance_history", query);
    return context.service.financeHistory(context.actor, query);
  });

  fastify.get("/expenses/finance-analytics", async (request) => {
    const actor = withActor(request);
    const context = await expenseReportContext(actor, "finance_assigned");
    return context.service.financeAnalytics(context.actor);
  });

  fastify.get("/expenses/register", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "finance_assigned", query);
    return context.service.register(context.actor, query);
  });

  fastify.get("/expenses/advance-aging", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "advance_aging");
    return context.service.advanceAging(context.actor, query.page, query.page_size);
  });

  fastify.get("/expenses/payments", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "payment_register");
    return context.service.paymentRegister(context.actor, query.page, query.page_size);
  });

  fastify.get("/expenses/audit", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    const context = await expenseReportContext(actor, "audit");
    return context.service.audit(context.actor, query.page, query.page_size);
  });

  fastify.get("/hr/employees", async (request) => {
    const actor = withActor(request);
    reportSummaryQuerySchema.parse(request.query);
    return ownershipUnavailable(actor, [Roles.HRManager, Roles.Admin, Roles.Auditor], "reports.hr.employees");
  });

  fastify.get("/attendance/summary", async (request) => {
    const actor = withActor(request);
    const query = reportSummaryQuerySchema.parse(request.query);
    const sqlContext = fastify.store.persistence?.attendanceReportReadContext
      ? await fastify.store.persistence.attendanceReportReadContext(actor.id)
      : null;
    const company = sqlContext ?? await currentContext(actor, "reports.attendance.summary");
    if (query.department_id || query.manager_user_id) {
      throw conflict("Historical attendance department and manager ownership is not yet verified.");
    }
    const store = sqlContext
      ? sqlContext.store
      : {
          ...fastify.store,
          attendanceDayRecords: fastify.store.attendanceDayRecords.filter((row) => row.company_id === company.companyId),
          attendancePunches: fastify.store.attendancePunches.filter((row) => row.company_id === company.companyId),
          attendanceRegularizations: fastify.store.attendanceRegularizations.filter((row) => row.company_id === company.companyId),
          attendanceGeoFallbackReviews: fastify.store.attendanceGeoFallbackReviews.filter((row) => row.company_id === company.companyId),
          outbox: fastify.store.outbox.filter((row) => row.payload.company_id === company.companyId),
        };
    return new ReportService(store).attendanceSummary(company.actor, query, company.companyId);
  });

  fastify.get("/leave-wfh/summary", async (request) => {
    const actor = withActor(request);
    reportSummaryQuerySchema.parse(request.query);
    return ownershipUnavailable(actor, [Roles.HRManager, Roles.Admin, Roles.Auditor, Roles.Reviewer, Roles.Director], "reports.leave_wfh.summary");
  });

  fastify.get("/projects/summary", async (request) => {
    const actor = withActor(request);
    reportSummaryQuerySchema.parse(request.query);
    return ownershipUnavailable(actor, [Roles.HRManager, Roles.Admin, Roles.Auditor, Roles.Reviewer, Roles.Director], "reports.projects.summary");
  });

  fastify.get("/timesheets/summary", async (request) => {
    const actor = withActor(request);
    reportSummaryQuerySchema.parse(request.query);
    return ownershipUnavailable(actor, [Roles.HRManager, Roles.Admin, Roles.Auditor, Roles.Reviewer, Roles.Director], "reports.timesheets.summary");
  });

  fastify.get("/assets/summary", async (request) => {
    const actor = withActor(request);
    reportSummaryQuerySchema.parse(request.query);
    return ownershipUnavailable(actor, [Roles.AssetManager, Roles.Admin, Roles.Auditor], "reports.assets.summary");
  });

  fastify.get("/helpdesk/summary", async (request) => {
    const actor = withActor(request);
    reportSummaryQuerySchema.parse(request.query);
    return ownershipUnavailable(actor, [Roles.HRManager, Roles.AssetManager, Roles.FinanceManager, Roles.Admin, Roles.Auditor], "reports.helpdesk.summary");
  });

  fastify.get("/audit", async (request) => {
    const actor = withActor(request);
    const context = fastify.store.persistence?.auditReportReadContext
      ? await fastify.store.persistence.auditReportReadContext(actor.id)
      : { actor, store: fastify.store, companyId: undefined };
    return new ReportService(context.store).auditReport(
      context.actor,
      reportSummaryQuerySchema.parse(request.query),
      context.companyId,
    );
  });

  fastify.get("/exports", async (request) => {
    const actor = withActor(request);
    const current = fastify.store.persistence?.reportExportReadContext
      ? await fastify.store.persistence.reportExportReadContext(actor.id)
      : { ...await currentContext(actor, "reports.exports.list"), store: fastify.store };
    return new ReportService(current.store).listExports(current.actor, reportSummaryQuerySchema.parse(request.query), current.companyId);
  });

  fastify.get("/exports/:id", async (request) => {
    const actor = withActor(request);
    const params = idParamSchema.parse(request.params);
    const current = fastify.store.persistence?.reportExportReadContext
      ? await fastify.store.persistence.reportExportReadContext(actor.id, params.id)
      : { ...await currentContext(actor, "reports.exports.get"), store: fastify.store };
    return new ReportService(current.store).getExport(current.actor, params.id, current.companyId);
  });

  fastify.post("/exports", async (request) => {
    const actor = withActor(request);
    const body = parseReportExportRequest(request.body);
    const current = await currentContext(actor, "reports.exports.create");
    if (["hr", "hr/employees", "leave", "leave-wfh", "leave-wfh/summary", "projects", "projects/summary", "timesheets", "timesheets/summary", "assets", "assets/summary", "helpdesk", "helpdesk/summary"].includes(body.report_type)) {
      throw conflict("Export unavailable until historical company ownership is verified");
    }
    assertReportRole(current.actor, [Roles.HRManager, Roles.FinanceManager, Roles.Auditor, Roles.Admin]);
    return generatedExportUnavailable();
  });
};
