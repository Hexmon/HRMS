import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { EmploymentStatuses } from "#shared";
import { paginationQuerySchema } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { CoreService } from "./service.js";

const userListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  department_id: z.uuid().optional(),
  designation_id: z.uuid().optional(),
  role: z.string().optional(),
  employment_status: z.enum([
    EmploymentStatuses.Active,
    EmploymentStatuses.Inactive,
    EmploymentStatuses.Terminated,
    EmploymentStatuses.Suspended
  ]).optional(),
  manager_user_id: z.uuid().optional(),
  login_state: z.enum(["enabled", "disabled"]).optional()
});

export const coreRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/users", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = userListQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    return service.listUsers(request.actor, query);
  });

  fastify.get("/users/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const service = new CoreService(fastify.store);
    return service.getUser(request.actor, params.id);
  });

  fastify.get("/users/:id/subtree", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    return service.resolveSubtreeView(request.actor, params.id, query.page, query.page_size);
  });
};
