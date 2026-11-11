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
    const store = fastify.store.persistence?.notificationReadStore
      ? await fastify.store.persistence.notificationReadStore(request.actor.id)
      : fastify.store;
    return new NotificationsService(store).list(
      request.actor,
      notificationsQuerySchema.parse(request.query)
    );
  });

  fastify.get("/notifications/unread-count", async (request) => {
    if (!request.actor) throw unauthorized();
    const store = fastify.store.persistence?.notificationReadStore
      ? await fastify.store.persistence.notificationReadStore(request.actor.id)
      : fastify.store;
    return new NotificationsService(store).unreadCount(request.actor);
  });

  fastify.post("/notifications/:id/read", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    const body = markReadSchema.parse(request.body ?? {});
    if (fastify.store.persistence?.notificationMarkRead) {
      const result = await fastify.store.persistence.notificationMarkRead({
        userId: request.actor.id,
        notificationId: params.id,
        expectedVersion: body.expected_version,
      });
      const service = new NotificationsService({
        ...fastify.store,
        notifications: [result.notification],
      });
      return {
        notification: service.present(result.notification),
        unread_count: result.unreadCount,
      };
    }
    return new NotificationsService(fastify.store).markRead(request.actor, params.id, body);
  });

  fastify.post("/notifications/read-all", async (request) => {
    if (!request.actor) throw unauthorized();
    const body = markAllReadSchema.parse(request.body ?? {});
    if (fastify.store.persistence?.notificationMarkAllRead) {
      const result = await fastify.store.persistence.notificationMarkAllRead({
        userId: request.actor.id,
        type: body.type,
        before: body.before,
      });
      return { updated_count: result.updatedCount, unread_count: result.unreadCount };
    }
    return new NotificationsService(fastify.store).markAllRead(request.actor, body);
  });
};
