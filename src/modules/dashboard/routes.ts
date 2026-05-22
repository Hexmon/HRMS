import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../platform/errors.js";
import { DashboardService } from "./service.js";

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new DashboardService(fastify.store).summary(request.actor);
  });
};
