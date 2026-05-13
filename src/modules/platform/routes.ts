import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../platform/errors.js";
import { PlatformService } from "./service.js";
import { financeGovernanceUpdateSchema } from "./schemas.js";

export const platformRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/finance-governance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new PlatformService(fastify.store).getFinanceGovernance(request.actor);
  });

  fastify.put("/finance-governance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = financeGovernanceUpdateSchema.parse(request.body);
    return new PlatformService(fastify.store).updateFinanceGovernance(request.actor, body);
  });
};
