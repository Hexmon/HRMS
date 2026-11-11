import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  PaymentTypes,
  type AuthUser,
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
import { badRequest, conflict, unauthorized } from "../../platform/errors.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { ExpenseService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const documentParamSchema = z.object({ id: z.uuid(), documentId: z.uuid() });
const mappingIdParamSchema = z.object({ id: z.uuid() });
const versionQuerySchema = z.object({ expected_version: z.coerce.number().int().min(1).optional() });
const expenseCommandKeySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
function expenseCommandResult(ticket: { id: string; status: string; version: number }) {
  return { id: ticket.id, status: ticket.status, version: ticket.version };
}
function commandIdentity(request: { headers: Record<string, unknown> }, ticketId: string, action: string, body: unknown) {
  const idempotencyKey = expenseCommandKeySchema.parse(request.headers["idempotency-key"]);
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ ticket_id: ticketId, action, body }))
    .digest("hex");
  return { idempotencyKey, requestHash };
}
type ExpenseCommandResponse = ReturnType<typeof expenseCommandResult>;
type MemoryCommandResult = { requestHash: string; response: ExpenseCommandResponse };
const memoryCommandResults = new WeakMap<MemoryDataStore, Map<string, MemoryCommandResult>>();
const MAX_MEMORY_COMMAND_RESULTS_PER_STORE = 10_000;
function runMemoryFinanceCommand(input: {
  store: MemoryDataStore;
  actor: AuthUser;
  action: "finance.approve" | "finance.payment" | "settlement";
  identity: ReturnType<typeof commandIdentity>;
  run: () => ExpenseCommandResponse;
}): ExpenseCommandResponse {
  const companyId = input.store.userSessionPreferences.find(
    (preference) => preference.user_id === input.actor.id,
  )?.company_id ?? "no-company";
  const resultKey = [companyId, input.actor.id, input.action, input.identity.idempotencyKey].join(":");
  const results = memoryCommandResults.get(input.store) ?? new Map<string, MemoryCommandResult>();
  memoryCommandResults.set(input.store, results);
  const existing = results.get(resultKey);
  if (existing) {
    if (existing.requestHash !== input.identity.requestHash) {
      throw conflict("Idempotency key was already used with a different request", {
        action: input.action,
      });
    }
    return existing.response;
  }
  // Memory persistence is restricted to local/test runtimes. Fail closed at a
  // fixed bound instead of evicting a replay record and accidentally executing
  // an old idempotency key twice.
  if (results.size >= MAX_MEMORY_COMMAND_RESULTS_PER_STORE) {
    throw conflict(
      "Memory expense command replay capacity is exhausted; restart the isolated local/test instance",
    );
  }
  const response = input.run();
  results.set(resultKey, { requestHash: input.identity.requestHash, response });
  return response;
}
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

async function expenseReadService(fastify: FastifyInstance, actor: AuthUser, ticketId: string) {
  if (fastify.store.kind !== "postgres") {
    return { actor, service: new ExpenseService(fastify.store) };
  }
  const context = await fastify.store.persistence?.expenseReadContext?.(actor.id, ticketId);
  if (!context) throw conflict("Expense read is temporarily unavailable");
  return {
    actor: context.actor,
    service: new ExpenseService(context.store, context.companyId),
  };
}

export const expenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request) => {
    if (fastify.store.kind === "postgres" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!request.actor) throw unauthorized();
      if (request.method === "POST" &&
          /^\/api\/v1\/expenses\/[0-9a-f-]+\/(?:finance\/(?:approve|payment)|settlement)$/iu.test(request.url.split("?")[0] ?? "")) {
        return;
      }
      // Until each mutation owns its SQL transaction, running the legacy
      // memory service would create ghost state after the 0068 DB fence rejects
      // its response-end flush. Keep writes visibly unavailable meanwhile.
      throw conflict("Expense changes are temporarily unavailable during the transaction cutover");
    }
  });
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
    if (fastify.store.kind === "postgres") {
      const context = await fastify.store.persistence?.expensePageContext?.(request.actor.id, {
        kind: "my", page: query.page, pageSize: query.page_size,
      });
      if (!context) throw conflict("Expense history list is temporarily unavailable");
      return new ExpenseService(context.store, context.companyId).presentScopedPage(
        context.actor, query.page, query.page_size, context.total,
      );
    }
    return new ExpenseService(fastify.store).listMyTickets(request.actor, query.page, query.page_size);
  });

  fastify.get("/expenses/metadata", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    if (fastify.store.kind === "postgres") throw conflict("Expense metadata requires company-scoped selectors");
    return new ExpenseService(fastify.store).metadata(request.actor);
  });

  fastify.get("/expenses/dashboard-summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = expenseDashboardQuerySchema.parse(request.query);
    if (fastify.store.kind === "postgres") {
      const context = await fastify.store.persistence?.expenseDashboardContext?.(request.actor.id, query);
      if (!context) throw conflict("Expense dashboard is temporarily unavailable");
      return new ExpenseService(context.store, context.companyId).presentSqlDashboard(
        context.actor, context.aggregate,
      );
    }
    return new ExpenseService(fastify.store).dashboardSummary(request.actor, query);
  });

  fastify.get("/expenses/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const { actor, service } = await expenseReadService(fastify, request.actor, params.id);
    return service.getTicket(actor, params.id);
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
    if (fastify.store.kind === "postgres") {
      const context = await fastify.store.persistence?.expensePageContext?.(request.actor.id, {
        kind: "manager", page: query.page, pageSize: query.page_size,
      });
      if (!context) throw conflict("Manager expense queue is temporarily unavailable");
      return new ExpenseService(context.store, context.companyId).presentScopedPage(
        context.actor, query.page, query.page_size, context.total,
      );
    }
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
    if (fastify.store.kind === "postgres") {
      if (query.requester || query.department || query.document_status !== "any") {
        throw conflict("Expense name, department and document filters require historical scoped indexes");
      }
      const context = await fastify.store.persistence?.expensePageContext?.(request.actor.id, {
        kind: "finance", page: query.page, pageSize: query.page_size,
        filters: {
          status: query.status,
          date_from: query.date_from,
          date_to: query.date_to,
          payment_type: query.payment_type,
          expense_type: query.expense_type,
          expense_sub_type: query.expense_sub_type,
          amount_min: query.amount_min,
          amount_max: query.amount_max,
          sla_bucket: query.sla_bucket,
          sort: query.sort,
        },
      });
      if (!context) throw conflict("Finance expense queue is temporarily unavailable");
      return new ExpenseService(context.store, context.companyId).presentScopedPage(
        context.actor, query.page, query.page_size, context.total,
      );
    }
    return new ExpenseService(fastify.store).financeQueue(request.actor, query);
  });

  fastify.get("/expenses/:id/finance-detail", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const { actor, service } = await expenseReadService(fastify, request.actor, params.id);
    return service.financeDetail(actor, params.id);
  });

  fastify.post("/expenses/:id/finance/approve", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = financeVerifySchema.parse(request.body);
    const action = "finance.approve" as const;
    const identity = commandIdentity(request, params.id, action, body);
    if (fastify.store.kind === "postgres") {
      const persistence = fastify.store.persistence;
      if (!persistence?.expenseFinanceCommand) throw conflict("Expense Finance command is unavailable");
      return persistence.expenseFinanceCommand({ userId: request.actor.id, ticketId: params.id, action,
        ...identity, expectedVersion: body.expected_version,
        run: ({ actor, companyId, store }) => new ExpenseService(store, companyId)
          .financeApprove(actor, params.id, body.decision, body.remarks, body.expected_version),
      });
    }
    return runMemoryFinanceCommand({
      store: fastify.store,
      actor: request.actor,
      action,
      identity,
      run: () => expenseCommandResult(
        new ExpenseService(fastify.store).financeApprove(
          request.actor!, params.id, body.decision, body.remarks, body.expected_version,
        ),
      ),
    });
  });

  fastify.post("/expenses/:id/finance/payment", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = paymentReleaseSchema.parse(request.body);
    const action = "finance.payment" as const;
    const identity = commandIdentity(request, params.id, action, body);
    if (fastify.store.kind === "postgres") {
      const persistence = fastify.store.persistence;
      if (!persistence?.expenseFinanceCommand) throw conflict("Expense Finance command is unavailable");
      return persistence.expenseFinanceCommand({ userId: request.actor.id, ticketId: params.id, action,
        ...identity, expectedVersion: body.expected_version,
        run: ({ actor, companyId, store }) => new ExpenseService(store, companyId)
          .releasePayment(actor, params.id, body),
      });
    }
    return runMemoryFinanceCommand({
      store: fastify.store,
      actor: request.actor,
      action,
      identity,
      run: () => expenseCommandResult(new ExpenseService(fastify.store).releasePayment(request.actor!, params.id, {
        payment_date: body.payment_date,
        amount: body.amount,
        payment_mode: body.payment_mode,
        reference_no: body.reference_no,
        expected_version: body.expected_version,
      })),
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
    const action = "settlement" as const;
    const identity = commandIdentity(request, params.id, action, body);
    if (fastify.store.kind === "postgres") {
      const persistence = fastify.store.persistence;
      if (!persistence?.expenseFinanceCommand) throw conflict("Expense Finance command is unavailable");
      return persistence.expenseFinanceCommand({ userId: request.actor.id, ticketId: params.id, action,
        ...identity, expectedVersion: body.expected_version,
        run: ({ actor, companyId, store }) => new ExpenseService(store, companyId)
          .settle(actor, params.id, body.actual_amount, body.remarks, body.expected_version),
      });
    }
    return runMemoryFinanceCommand({
      store: fastify.store,
      actor: request.actor,
      action,
      identity,
      run: () => expenseCommandResult(
        new ExpenseService(fastify.store).settle(
          request.actor!, params.id, body.actual_amount, body.remarks, body.expected_version,
        ),
      ),
    });
  });

  fastify.get("/expenses/:id/timeline", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const { actor, service } = await expenseReadService(fastify, request.actor, params.id);
    return service.timeline(actor, params.id);
  });

  fastify.get("/expenses/:id/audit", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const { actor, service } = await expenseReadService(fastify, request.actor, params.id);
    return service.audit(actor, params.id, query.page, query.page_size);
  });

  fastify.get("/manager-backups", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    if (fastify.store.kind === "postgres") {
      throw conflict("Manager backup listing requires company-scoped governance data");
    }
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
