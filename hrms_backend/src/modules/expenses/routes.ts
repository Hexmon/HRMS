import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  PaymentTypes,
  type AuthUser,
  type ExpenseTicket,
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
import { BoundedMemoryCommandReplay } from "./memory-command-replay.js";
import { ExpenseService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const documentParamSchema = z.object({ id: z.uuid(), documentId: z.uuid() });
const mappingIdParamSchema = z.object({ id: z.uuid() });
const versionQuerySchema = z.object({ expected_version: z.coerce.number().int().min(1).optional() });
const expenseCommandKeySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
function expenseCommandResult(
  ticket: Pick<ExpenseTicket, "id" | "status" | "version">,
) {
  return { id: ticket.id, status: ticket.status, version: ticket.version };
}
function commandIdentity(request: { headers: Record<string, unknown> }, resourceId: string, action: string, body: unknown) {
  const idempotencyKey = expenseCommandKeySchema.parse(request.headers["idempotency-key"]);
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ resource_id: resourceId, action, body }))
    .digest("hex");
  return { idempotencyKey, requestHash };
}
type ExpenseCommandResponse = ReturnType<typeof expenseCommandResult>;
const memoryCommandResults = new WeakMap<
  MemoryDataStore,
  BoundedMemoryCommandReplay<unknown>
>();
function runMemoryExpenseCommand<T>(input: {
  store: MemoryDataStore;
  actor: AuthUser;
  action: string;
  identity: ReturnType<typeof commandIdentity>;
  run: () => T;
}): T {
  const companyId = input.store.userSessionPreferences.find(
    (preference) => preference.user_id === input.actor.id,
  )?.company_id ?? "no-company";
  const resultKey = [companyId, input.actor.id, input.action, input.identity.idempotencyKey].join(":");
  const results = memoryCommandResults.get(input.store)
    ?? new BoundedMemoryCommandReplay<unknown>();
  memoryCommandResults.set(input.store, results);
  return results.execute({
    key: resultKey,
    requestHash: input.identity.requestHash,
    action: input.action,
    run: input.run,
  }) as T;
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
  document_ids: z.array(z.uuid()).max(20).refine(
    (ids) => new Set(ids).size === ids.length,
    { message: "Clarification document IDs must be unique" },
  ).default([]),
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

async function expenseMutation(
  fastify: FastifyInstance,
  actor: AuthUser,
  request: { headers: Record<string, unknown> },
  action: "create" | "submit" | "withdraw" | "clarification" | "manager.verify" | "bills",
  ticketId: string | undefined,
  body: unknown,
  run: (context: { actor: AuthUser; companyId: string; store: MemoryDataStore }) => ExpenseCommandResponse,
): Promise<ExpenseCommandResponse> {
  const identity = commandIdentity(request, ticketId ?? "new", action, body);
  if (fastify.store.kind !== "postgres") {
    return runMemoryExpenseCommand({
      store: fastify.store,
      actor,
      action,
      identity,
      run: () => run({ actor, companyId: "", store: fastify.store }),
    });
  }
  const persistence = fastify.store.persistence;
  if (!persistence?.expenseMutationCommand) {
    throw conflict("Expense command is temporarily unavailable");
  }
  return persistence.expenseMutationCommand({
    userId: actor.id,
    ...(ticketId ? { ticketId } : {}),
    action,
    ...identity,
    run: ({ actor: currentActor, companyId, store }) =>
      run({ actor: currentActor, companyId, store }),
  });
}

function isTransactionOwnedExpenseRoute(method: string, url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (method === "POST" && path === "/api/v1/expenses") return true;
  if (method === "POST" && path === "/api/v1/manager-backups") return true;
  if (method === "DELETE" && /^\/api\/v1\/manager-backups\/[^/]+$/u.test(path)) return true;
  if (
    method === "POST" &&
    /^\/api\/v1\/expenses\/[^/]+\/(?:submit|withdraw|clarifications|manager\/verify|bills)$/u.test(path)
  ) {
    return true;
  }
  return method === "PATCH" && /^\/api\/v1\/expenses\/[^/]+$/u.test(path);
}

export const expenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request) => {
    if (fastify.store.kind === "postgres" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!request.actor) throw unauthorized();
      if (request.method === "POST" &&
          /^\/api\/v1\/expenses\/[^/]+\/(?:finance\/(?:approve|payment)|settlement)$/u.test(request.url.split("?")[0] ?? "")) {
        return;
      }
      if (isTransactionOwnedExpenseRoute(request.method, request.url)) return;
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
    return expenseMutation(fastify, actor, request, "create", undefined, body, ({ actor: currentActor, companyId, store }) =>
      expenseCommandResult(new ExpenseService(store, companyId || undefined).createTicket(currentActor, body)));
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
    if (fastify.store.kind === "postgres") {
      const context = await fastify.store.persistence?.expenseMetadataContext?.(
        request.actor.id,
      );
      if (!context) throw conflict("Expense metadata is temporarily unavailable");
      return new ExpenseService(context.store, context.companyId).metadata(
        context.actor,
      );
    }
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
    return expenseMutation(fastify, request.actor, request, "submit", params.id, body, ({ actor, companyId, store }) =>
      expenseCommandResult(new ExpenseService(store, companyId || undefined)
        .submitTicket(actor, params.id, body.expected_version)));
  });

  fastify.post("/expenses/:id/withdraw", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = expenseWithdrawSchema.parse(request.body);
    return expenseMutation(fastify, request.actor, request, "withdraw", params.id, body, ({ actor, companyId, store }) => {
      const service = new ExpenseService(store, companyId || undefined);
      service.withdrawTicket(actor, params.id, body.expected_version, body.remarks);
      return expenseCommandResult(store.tickets.find((ticket) => ticket.id === params.id)!);
    });
  });

  fastify.post("/expenses/:id/clarifications", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = expenseClarificationSchema.parse(request.body);
    return expenseMutation(fastify, request.actor, request, "clarification", params.id, body, ({ actor, companyId, store }) => {
      const service = new ExpenseService(store, companyId || undefined);
      service.addClarification(actor, params.id, body);
      return expenseCommandResult(store.tickets.find((ticket) => ticket.id === params.id)!);
    });
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
    return expenseMutation(fastify, request.actor, request, "manager.verify", params.id, body, ({ actor, companyId, store }) =>
      expenseCommandResult(new ExpenseService(store, companyId || undefined).managerVerify(
        actor, params.id, body.decision, body.remarks, body.expected_version,
      )));
  });

  fastify.get("/expenses/queue/finance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = financeQueueQuerySchema.parse(request.query);
    if (fastify.store.kind === "postgres") {
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
          requester: query.requester,
          department: query.department,
          document_status: query.document_status,
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
    return runMemoryExpenseCommand({
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
    return runMemoryExpenseCommand({
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
    return expenseMutation(fastify, request.actor, request, "bills", params.id, body, ({ actor, companyId, store }) =>
      expenseCommandResult(new ExpenseService(store, companyId || undefined)
        .submitBills(actor, params.id, body.expected_version)));
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
    return runMemoryExpenseCommand({
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
      const context = await fastify.store.persistence?.managerBackupListContext?.({
        userId: request.actor.id,
        page: query.page,
        pageSize: query.page_size,
      });
      if (!context) throw conflict("Manager backup listing is unavailable");
      return {
        items: context.assignments,
        page: query.page,
        page_size: query.page_size,
        total: context.total,
      };
    }
    return new ExpenseService(fastify.store).listManagerBackupAssignments(request.actor, query.page, query.page_size);
  });

  fastify.post("/manager-backups", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = managerBackupAssignmentCreateSchema.parse(request.body);
    const identity = commandIdentity(request, body.employee_user_id, "reviewer-routing.create", body);
    if (fastify.store.kind === "postgres") {
      const persistence = fastify.store.persistence;
      if (!persistence?.managerBackupCommand) {
        throw conflict("Manager backup command is unavailable");
      }
      return persistence.managerBackupCommand({
        userId: request.actor.id,
        action: "reviewer-routing.create",
        ...identity,
        create: {
          employeeUserId: body.employee_user_id,
          backupManagerUserId: body.backup_manager_user_id,
          effectiveFrom: body.effective_from,
          effectiveTo: body.effective_to ?? null,
        },
      });
    }
    return new ExpenseService(fastify.store).createManagerBackupAssignment(request.actor, body);
  });

  fastify.delete("/manager-backups/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = mappingIdParamSchema.parse(request.params);
    const query = versionQuerySchema.extend({
      expected_version: z.coerce.number().int().min(1),
    }).parse(request.query);
    const identity = commandIdentity(request, params.id, "reviewer-routing.revoke", query);
    if (fastify.store.kind === "postgres") {
      const persistence = fastify.store.persistence;
      if (!persistence?.managerBackupCommand) {
        throw conflict("Manager backup command is unavailable");
      }
      return persistence.managerBackupCommand({
        userId: request.actor.id,
        action: "reviewer-routing.revoke",
        ...identity,
        mappingId: params.id,
        expectedVersion: query.expected_version,
      });
    }
    return new ExpenseService(fastify.store).revokeManagerBackupAssignment(request.actor, params.id, query.expected_version);
  });

  fastify.patch("/expenses/:id", async () => {
    throw badRequest("Ticket edit endpoint is intentionally restricted to draft/returned flows and is not yet exposed in this minimal shell");
  });
};
