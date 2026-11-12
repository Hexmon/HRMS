import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { documentUploadSchema, paginationQuerySchema } from "#shared";
import { conflict, notFound, unauthorized } from "../../platform/errors.js";
import { DocumentService, presentDocument } from "./service.js";
import { MediaLifecycleService } from "./media-lifecycle.js";

const idParamSchema = z.object({ id: z.uuid() });
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const documentListQuerySchema = paginationQuerySchema.extend({
  business_object_type: z.string().optional(),
  business_object_id: z.uuid().optional()
});

async function assertNoExpenseDocumentAccess(
  fastify: FastifyInstance,
  actorId: string,
  documentId: string,
  mode: "metadata" | "raw" | "workflow",
): Promise<void> {
  if (fastify.store.kind !== "postgres") return;
  const access = await fastify.store.persistence?.classifyExpenseDocumentAccess?.(
    actorId, documentId, mode,
  );
  if (access === "expense-authorized") {
    throw conflict("Expense receipt access requires original-company parent authorization");
  }
  if (access !== "other") throw notFound("Document not found");
}

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const upload = await parseDocumentUpload(request);
    const body = documentUploadSchema.parse(upload.fields);
    if (fastify.store.kind === "postgres") {
      if (!fastify.store.pgPool || !fastify.store.objectStorage || !upload.fileBuffer) {
        throw conflict("Durable media storage is not configured");
      }
      if (body.business_object_type === "expense_ticket") {
        throw conflict("Expense receipt upload requires transaction-owned parent authorization");
      }
      if (body.business_object_type !== "core_user") {
        throw conflict("This document parent is not yet supported by the durable media protocol");
      }
      const policy = new DocumentService(fastify.store).uploadPolicy();
      const normalizedMime = body.mime_type.trim().toLowerCase();
      if (!policy.allowed_mime_types.includes(normalizedMime)) {
        throw conflict("This file type is not allowed for media uploads");
      }
      if (upload.fileBuffer.length > policy.max_bytes) {
        throw conflict("File is larger than the configured media upload limit", {
          max_bytes: policy.max_bytes,
          actual_bytes: upload.fileBuffer.length,
        });
      }
      const result = await new MediaLifecycleService(fastify.store.pgPool, fastify.store.objectStorage).upload({
        actor: request.actor,
        operation: "create",
        parentType: "core_user",
        parentId: body.business_object_id,
        businessObjectType: body.business_object_type,
        ownerUserId: body.business_object_id,
        classification: body.classification,
        documentType: body.document_type,
        fileName: body.file_name,
        mimeType: normalizedMime,
        body: upload.fileBuffer,
        idempotencyKey: idempotencyKeySchema.parse(request.headers["idempotency-key"]),
      });
      return presentDocument(result.document);
    }
    assertTenantOwnedDocumentBoundary(fastify);
    return presentDocument(await new DocumentService(fastify.store).upload(request.actor, {
      ...body,
      file_buffer: upload.fileBuffer
    }));
  });

  fastify.post("/expenses/:id/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    if (fastify.store.kind === "postgres") {
      throw conflict("Expense receipt upload requires transaction-owned parent authorization");
    }
    const upload = await parseDocumentUpload(request);
    const body = documentUploadSchema
      .omit({ business_object_type: true, business_object_id: true })
      .parse(upload.fields);
    return presentDocument(await new DocumentService(fastify.store).upload(request.actor, {
      ...body,
      business_object_type: "expense_ticket",
      business_object_id: params.id,
      file_buffer: upload.fileBuffer
    }));
  });

  fastify.get("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = documentListQuerySchema.parse(request.query);
    if (fastify.store.kind === "postgres") {
      throw conflict("Document list requires tenant-scoped receipt filtering");
    }
    const result = new DocumentService(fastify.store).list(request.actor, query);
    return { ...result, items: result.items.map(presentDocument) };
  });

  fastify.get("/documents/upload-policy", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new DocumentService(fastify.store).uploadPolicy();
  });

  fastify.get("/documents/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "metadata");
    if (fastify.store.kind === "postgres" && fastify.store.pgPool && fastify.store.objectStorage) {
      return presentDocument(await new MediaLifecycleService(
        fastify.store.pgPool, fastify.store.objectStorage,
      ).activeDocument(request.actor.id, params.id));
    }
    const service = new DocumentService(fastify.store);
    return presentDocument(service.metadata(request.actor, params.id));
  });

  fastify.post("/documents/:id/download-url", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "raw");
    if (fastify.store.kind === "postgres" && fastify.store.pgPool && fastify.store.objectStorage) {
      await new MediaLifecycleService(fastify.store.pgPool, fastify.store.objectStorage)
        .activeDocument(request.actor.id, params.id);
      return { document_id: params.id, url: `/api/v1/documents/${params.id}/content`, expires_in_seconds: 0 };
    }
    const service = new DocumentService(fastify.store);
    return service.downloadUrl(request.actor, params.id, fastify.config.API_BASE_URL);
  });

  fastify.get("/documents/:id/content", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "raw");
    if (fastify.store.kind === "postgres" && fastify.store.pgPool && fastify.store.objectStorage) {
      const content = await durableMediaContent(fastify, request.actor.id, params.id);
      reply
        .header("content-type", content.contentType)
        .header("content-length", String(content.size))
        .header("content-disposition", `attachment; filename="${safeDispositionFileName(content.fileName)}"`)
        .header("cache-control", "private, no-store")
        .header("x-content-type-options", "nosniff");
      return reply.send(content.body);
    }
    const service = new DocumentService(fastify.store);
    const content = await service.downloadContent(request.actor, params.id);
    reply
      .header("content-type", content.contentType)
      .header("content-length", String(content.size))
      .header("content-disposition", `attachment; filename="${safeDispositionFileName(content.fileName)}"`)
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff");
    return reply.send(content.body);
  });

  fastify.delete("/documents/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "workflow");
    assertTenantOwnedDocumentBoundary(fastify);
    return new DocumentService(fastify.store).delete(request.actor, params.id);
  });

  fastify.post("/documents/:id/verify", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "workflow");
    assertTenantOwnedDocumentBoundary(fastify);
    return presentDocument(new DocumentService(fastify.store).verify(request.actor, params.id));
  });

  fastify.get("/documents/:id/access-log", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "workflow");
    assertTenantOwnedDocumentBoundary(fastify);
    return new DocumentService(fastify.store).accessLog(request.actor, params.id, query.page, query.page_size);
  });
};

async function durableMediaContent(fastify: FastifyInstance, actorId: string, documentId: string) {
  const content = await new MediaLifecycleService(
    fastify.store.pgPool!, fastify.store.objectStorage!,
  ).activeContent(actorId, documentId);
  return {
    body: content.body,
    contentType: content.contentType,
    fileName: content.document.file_name,
    size: content.size,
  };
}

function assertTenantOwnedDocumentBoundary(fastify: FastifyInstance): void {
  if (fastify.store.kind === "postgres") {
    throw conflict("Document access requires immutable tenant ownership");
  }
}

async function parseDocumentUpload(request: FastifyRequest): Promise<{
  fields: Record<string, unknown>;
  fileBuffer?: Buffer;
}> {
  if (!request.isMultipart()) {
    return { fields: request.body as Record<string, unknown> };
  }

  const fields: Record<string, unknown> = {};
  let fileBuffer: Buffer | undefined;
  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuffer = await part.toBuffer();
      fields.file_name ??= part.filename;
      fields.mime_type ??= part.mimetype;
      fields.size_bytes = fileBuffer.length;
      continue;
    }
    fields[part.fieldname] = part.value;
  }
  if (typeof fields.size_bytes === "string") {
    fields.size_bytes = Number(fields.size_bytes);
  }
  return { fields, fileBuffer };
}

function safeDispositionFileName(fileName: string): string {
  return fileName.replace(/["\\\r\n]/gu, "_").slice(0, 160) || "document";
}
