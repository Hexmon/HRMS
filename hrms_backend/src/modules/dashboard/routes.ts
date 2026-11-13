import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../platform/errors.js";
import { DashboardService } from "./service.js";

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    if (fastify.store.kind === "postgres") {
      const context = await fastify.store.persistence?.dashboardExpenseReadContext?.(
        request.actor.id,
      );
      if (!context) throw unauthorized("Dashboard context is unavailable");
      return new DashboardService(context.store).summary(context.actor, context.exactMetrics);
    }
    return new DashboardService(fastify.store).summary(request.actor);
  });
};
