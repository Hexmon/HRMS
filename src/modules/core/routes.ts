import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paginationQuerySchema } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { CoreService } from "./service.js";

const userListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional()
});

export const coreRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/users", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = userListQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    const result = service.listUsers(query);
    return {
      ...result,
      page: query.page,
      page_size: query.page_size
    };
  });

  fastify.get("/users/:id", async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const service = new CoreService(fastify.store);
    return service.getUser(params.id);
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
