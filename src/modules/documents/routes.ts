import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { documentUploadSchema, paginationQuerySchema } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { DocumentService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const documentListQuerySchema = paginationQuerySchema.extend({
  business_object_type: z.string().optional(),
  business_object_id: z.uuid().optional()
});

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = documentUploadSchema.parse(request.body);
    return new DocumentService(fastify.store).upload(request.actor, body);
  });

  fastify.post("/expenses/:id/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = documentUploadSchema
      .omit({ business_object_type: true, business_object_id: true })
      .parse(request.body);
    return new DocumentService(fastify.store).upload(request.actor, {
      ...body,
      business_object_type: "expense_ticket",
      business_object_id: params.id
    });
  });

  fastify.get("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = documentListQuerySchema.parse(request.query);
    return new DocumentService(fastify.store).list(request.actor, query);
  });

  fastify.get("/documents/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new DocumentService(fastify.store).metadata(request.actor, params.id);
  });

  fastify.post("/documents/:id/download-url", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new DocumentService(fastify.store).downloadUrl(request.actor, params.id);
  });

  fastify.post("/documents/:id/verify", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new DocumentService(fastify.store).verify(request.actor, params.id);
  });

  fastify.get("/documents/:id/access-log", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    return new DocumentService(fastify.store).accessLog(request.actor, params.id, query.page, query.page_size);
  });
};
