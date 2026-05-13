import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paginationQuerySchema, type AuthUser } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { ReportService } from "./service.js";

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const withActor = (request: { actor?: AuthUser }) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return request.actor;
  };

  fastify.get("/expenses/my", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).myExpenses(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/manager-queue", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).managerQueue(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/manager-history", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).managerHistory(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/finance-dashboard", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).financeDashboard(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/finance-history", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).financeHistory(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/finance-analytics", async (request) => {
    const actor = withActor(request);
    return new ReportService(fastify.store).financeAnalytics(actor);
  });

  fastify.get("/expenses/register", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).register(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/advance-aging", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).advanceAging(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/payments", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).paymentRegister(actor, query.page, query.page_size);
  });

  fastify.get("/expenses/audit", async (request) => {
    const actor = withActor(request);
    const query = paginationQuerySchema.parse(request.query);
    return new ReportService(fastify.store).audit(actor, query.page, query.page_size);
  });

  fastify.post("/exports", async (request) => {
    const actor = withActor(request);
    const body = z.object({ format: z.enum(["csv", "xlsx"]).default("csv") }).parse(request.body ?? {});
    return new ReportService(fastify.store).createExport(actor, body.format);
  });
};
