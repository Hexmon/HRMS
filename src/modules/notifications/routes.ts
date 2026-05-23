import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paginationQuerySchema } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { NotificationsService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });

const notificationsQuerySchema = paginationQuerySchema.extend({
  unread_only: z.coerce.boolean().optional(),
  type: z.string().min(1).max(80).optional()
});

const markReadSchema = z.object({
  expected_version: z.number().int().positive().optional()
});

const markAllReadSchema = z.object({
  type: z.string().min(1).max(80).optional(),
  before: z.string().datetime().optional()
});

export const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/notifications", async (request) => {
    if (!request.actor) throw unauthorized();
    return new NotificationsService(fastify.store).list(
      request.actor,
      notificationsQuerySchema.parse(request.query)
    );
  });

  fastify.get("/notifications/unread-count", async (request) => {
    if (!request.actor) throw unauthorized();
    return new NotificationsService(fastify.store).unreadCount(request.actor);
  });

  fastify.post("/notifications/:id/read", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new NotificationsService(fastify.store).markRead(
      request.actor,
      params.id,
      markReadSchema.parse(request.body ?? {})
    );
  });

  fastify.post("/notifications/read-all", async (request) => {
    if (!request.actor) throw unauthorized();
    return new NotificationsService(fastify.store).markAllRead(
      request.actor,
      markAllReadSchema.parse(request.body ?? {})
    );
  });
};
