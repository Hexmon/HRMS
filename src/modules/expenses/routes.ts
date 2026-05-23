import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  PaymentTypes,
  expenseCreateSchema,
  expenseDecisionSchema,
  financeVerifySchema,
  isoDateSchema,
  managerBackupAssignmentCreateSchema,
  moneySchema,
  paginationQuerySchema,
  paymentReleaseSchema,
  settlementSchema
} from "#shared";
import { badRequest, unauthorized } from "../../platform/errors.js";
import { ExpenseService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const documentParamSchema = z.object({ id: z.uuid(), documentId: z.uuid() });
const mappingIdParamSchema = z.object({ id: z.uuid() });
const versionQuerySchema = z.object({ expected_version: z.coerce.number().int().min(1).optional() });
const expenseDashboardQuerySchema = z.object({
  date_from: isoDateSchema.optional(),
  date_to: isoDateSchema.optional(),
  status: z.enum([
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
  ]).optional()
});
const expenseWithdrawSchema = z.object({
  expected_version: z.number().int().min(1),
  remarks: z.string().trim().min(1).max(2000).optional()
});
const expenseClarificationSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  document_ids: z.array(z.uuid()).default([]),
  expected_version: z.number().int().min(1).optional()
});
const financeQueueQuerySchema = paginationQuerySchema.extend({
  status: z.enum([
    ExpenseStatuses.ManagerVerified,
    ExpenseStatuses.FinanceHold,
    ExpenseStatuses.ClarificationRequired,
    ExpenseStatuses.FinanceApproved,
    ExpenseStatuses.PaymentReleased,
    ExpenseStatuses.BillsSubmitted,
    ExpenseStatuses.PendingAdjustment,
    ExpenseStatuses.Closed
  ]).optional(),
  requester: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
  date_from: isoDateSchema.optional(),
  date_to: isoDateSchema.optional(),
  payment_type: z.enum([PaymentTypes.Advance, PaymentTypes.ReimbursementAccrued]).optional(),
  expense_type: z.enum([ExpenseTypes.Project, ExpenseTypes.SalesPreSales]).optional(),
  expense_sub_type: z.enum([
    ExpenseSubTypes.ProjectTravel,
    ExpenseSubTypes.MaterialConsumables,
    ExpenseSubTypes.LodgingBoarding,
    ExpenseSubTypes.ClientMeeting,
    ExpenseSubTypes.DemoPresentation,
    ExpenseSubTypes.MarketingEvent,
    ExpenseSubTypes.SalesTravel,
    ExpenseSubTypes.MiscSalesExpense
  ]).optional(),
  amount_min: moneySchema.optional(),
  amount_max: moneySchema.optional(),
  document_status: z.enum(["any", "complete", "missing"]).default("any"),
  sla_bucket: z.enum(["any", "0-24h", "24-72h", "72h-plus"]).default("any"),
  sort: z.enum(["sla", "created_at", "amount", "status"]).default("sla")
});

export const expenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/expenses", async (request) => {
    const actor = request.actor;
    if (!actor) {
      throw unauthorized();
    }
    const body = expenseCreateSchema.parse(request.body);
    return new ExpenseService(fastify.store).createTicket(actor, body);
  });

  fastify.get("/expenses/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).listMyTickets(request.actor, query.page, query.page_size);
  });

  fastify.get("/expenses/metadata", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new ExpenseService(fastify.store).metadata(request.actor);
  });

  fastify.get("/expenses/dashboard-summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = expenseDashboardQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).dashboardSummary(request.actor, query);
  });

  fastify.get("/expenses/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new ExpenseService(fastify.store).getTicket(request.actor, params.id);
  });

  fastify.post("/expenses/:id/submit", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = z.object({ expected_version: z.number().int().min(1) }).parse(request.body);
    return new ExpenseService(fastify.store).submitTicket(request.actor, params.id, body.expected_version);
  });

  fastify.post("/expenses/:id/withdraw", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = expenseWithdrawSchema.parse(request.body);
    return new ExpenseService(fastify.store).withdrawTicket(request.actor, params.id, body.expected_version, body.remarks);
  });

  fastify.post("/expenses/:id/clarifications", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = expenseClarificationSchema.parse(request.body);
    return new ExpenseService(fastify.store).addClarification(request.actor, params.id, body);
  });

  fastify.get("/expenses/queue/manager", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).managerQueue(request.actor, query.page, query.page_size);
  });

  fastify.post("/expenses/:id/manager/verify", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = expenseDecisionSchema.parse(request.body);
    return new ExpenseService(fastify.store).managerVerify(request.actor, params.id, body.decision, body.remarks, body.expected_version);
  });

  fastify.get("/expenses/queue/finance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = financeQueueQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).financeQueue(request.actor, query);
  });

  fastify.get("/expenses/:id/finance-detail", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new ExpenseService(fastify.store).financeDetail(request.actor, params.id);
  });

  fastify.post("/expenses/:id/finance/approve", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = financeVerifySchema.parse(request.body);
    return new ExpenseService(fastify.store).financeApprove(request.actor, params.id, body.decision, body.remarks, body.expected_version);
  });

  fastify.post("/expenses/:id/finance/payment", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = paymentReleaseSchema.parse(request.body);
    return new ExpenseService(fastify.store).releasePayment(request.actor, params.id, {
      payment_date: body.payment_date,
      amount: body.amount,
      payment_mode: body.payment_mode,
      reference_no: body.reference_no,
      expected_version: body.expected_version
    });
  });

  fastify.post("/expenses/:id/bills", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = z.object({ expected_version: z.number().int().min(1) }).parse(request.body);
    return new ExpenseService(fastify.store).submitBills(request.actor, params.id, body.expected_version);
  });

  fastify.post("/expenses/:id/documents/:documentId/verify", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = documentParamSchema.parse(request.params);
    return new ExpenseService(fastify.store).verifyExpenseDocument(request.actor, params.id, params.documentId);
  });

  fastify.post("/expenses/:id/settlement", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = settlementSchema.parse(request.body);
    return new ExpenseService(fastify.store).settle(request.actor, params.id, body.actual_amount, body.remarks, body.expected_version);
  });

  fastify.get("/expenses/:id/timeline", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new ExpenseService(fastify.store).timeline(request.actor, params.id);
  });

  fastify.get("/expenses/:id/audit", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).audit(request.actor, params.id, query.page, query.page_size);
  });

  fastify.get("/manager-backups", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).listManagerBackupAssignments(request.actor, query.page, query.page_size);
  });

  fastify.post("/manager-backups", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = managerBackupAssignmentCreateSchema.parse(request.body);
    return new ExpenseService(fastify.store).createManagerBackupAssignment(request.actor, body);
  });

  fastify.delete("/manager-backups/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = mappingIdParamSchema.parse(request.params);
    const query = versionQuerySchema.parse(request.query);
    return new ExpenseService(fastify.store).revokeManagerBackupAssignment(request.actor, params.id, query.expected_version);
  });

  fastify.patch("/expenses/:id", async () => {
    throw badRequest("Ticket edit endpoint is intentionally restricted to draft/returned flows and is not yet exposed in this minimal shell");
  });
};
