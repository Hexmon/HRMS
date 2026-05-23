import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../platform/errors.js";
import { AdminService } from "./service.js";
import { companyProfileUpdateSchema } from "./schemas.js";

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/company-profile", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).getCompanyProfile(request.actor);
  });

  fastify.put("/company-profile", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).updateCompanyProfile(
      request.actor,
      companyProfileUpdateSchema.parse(request.body)
    );
  });
};
