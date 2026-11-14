import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../platform/errors.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import { DashboardService } from "./service.js";

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const company = resolveActiveCompanyMembershipContext(fastify.store, {
      userId: request.actor.id,
      operation: "dashboard.summary",
      requireActiveEmployment: true,
    });
    const attendanceStore = fastify.store.persistence?.attendanceReadStore
      ? await fastify.store.persistence.attendanceReadStore({ companyId: company.companyId, includePendingOutbox: true })
      : fastify.store;
    const store = await fastify.store.persistence?.assetReadStore?.(
      attendanceStore,
      company.companyId,
      request.actor.id,
      "dashboard.summary",
    ) ?? attendanceStore;
    return new DashboardService(store).summary(request.actor);
  });
};
