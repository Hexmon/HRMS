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

const reportExpenseQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  expense_type: z.string().optional(),
  expense_sub_type: z.string().optional(),
  payment_type: z.string().optional(),
  department_id: z.uuid().optional(),
  requester_user_id: z.uuid().optional(),
  manager_user_id: z.uuid().optional(),
  finance_user_id: z.uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  document_status: z.enum(["any", "complete", "missing", "pending", "not_required"]).default("any")
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

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const withActor = (request: { actor?: AuthUser }) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return request.actor;
  };
  const expenseRead = async (actor: AuthUser) => {
    if (fastify.store.persistence?.auditReportReadContext) {
      const context = await fastify.store.persistence.auditReportReadContext(actor.id);
      return { actor: context.actor, service: new ReportService(context.store) };
    }
    const company = resolveActiveCompanyMembershipContext(fastify.store, {
      userId: actor.id,
      operation: "reports.expenses.read",
      requireActiveEmployment: true,
    });
    const tickets = fastify.store.tickets.filter((ticket) => ticket.context_payload.company_id === company.companyId);
    const ticketIds = new Set(tickets.map((ticket) => ticket.id));
    const store = {
      ...fastify.store,
      tickets,
      auditLogs: fastify.store.auditLogs.filter((row) => ticketIds.has(row.ticket_id)),
      expenseApprovals: fastify.store.expenseApprovals.filter((row) => ticketIds.has(row.ticket_id)),
      expenseDocuments: fastify.store.expenseDocuments.filter((row) => ticketIds.has(row.ticket_id)),
      payments: fastify.store.payments.filter((row) => ticketIds.has(row.ticket_id)),
    };
    return { actor, service: new ReportService(store) };
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
    const scoped = await expenseRead(actor);
    return scoped.service.myExpenses(scoped.actor, query);
  });

  fastify.get("/expenses/manager-queue", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.managerQueue(scoped.actor, query);
  });

  fastify.get("/expenses/manager-history", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.managerHistory(scoped.actor, query);
  });

  fastify.get("/expenses/finance-dashboard", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.financeDashboard(scoped.actor, query);
  });

  fastify.get("/expenses/finance-history", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.financeHistory(scoped.actor, query);
  });

  fastify.get("/expenses/finance-analytics", async (request) => {
    const actor = withActor(request);
    const scoped = await expenseRead(actor);
    return scoped.service.financeAnalytics(scoped.actor);
  });

  fastify.get("/expenses/register", async (request) => {
    const actor = withActor(request);
    const query = reportExpenseQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.register(scoped.actor, query);
  });

  fastify.get("/expenses/advance-aging", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.advanceAging(scoped.actor, query.page, query.page_size);
  });

  fastify.get("/expenses/payments", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.paymentRegister(scoped.actor, query.page, query.page_size);
  });

  fastify.get("/expenses/audit", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    const scoped = await expenseRead(actor);
    return scoped.service.audit(scoped.actor, query.page, query.page_size);
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
