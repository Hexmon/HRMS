import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { documentUploadSchema, paginationQuerySchema } from "#shared";
import { conflict, notFound, unauthorized } from "../../platform/errors.js";
import { DocumentService, presentDocument } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
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

async function tenantMediaAuthorized(
  fastify: FastifyInstance,
  actorId: string,
  documentId: string,
  mode: "metadata" | "raw" | "workflow",
): Promise<boolean> {
  if (fastify.store.kind !== "postgres") return false;
  const access = await fastify.store.persistence?.classifyTenantMediaAccess?.(actorId, documentId, mode);
  if (access === "media-authorized") return true;
  if (access === "hidden") throw notFound("Document not found");
  return false;
}

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    assertTenantOwnedDocumentBoundary(fastify);
    const upload = await parseDocumentUpload(request);
    const body = documentUploadSchema.parse(upload.fields);
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
    const service = new DocumentService(fastify.store);
    if (await tenantMediaAuthorized(fastify, request.actor.id, params.id, "metadata")) {
      return presentDocument(service.tenantMediaMetadata(request.actor, params.id));
    }
    assertTenantOwnedDocumentBoundary(fastify);
    return presentDocument(service.metadata(request.actor, params.id));
  });

  fastify.post("/documents/:id/download-url", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "raw");
    const service = new DocumentService(fastify.store);
    if (await tenantMediaAuthorized(fastify, request.actor.id, params.id, "raw")) {
      return service.tenantMediaDownloadUrl(request.actor, params.id, fastify.config.API_BASE_URL);
    }
    assertTenantOwnedDocumentBoundary(fastify);
    return service.downloadUrl(request.actor, params.id, fastify.config.API_BASE_URL);
  });

  fastify.get("/documents/:id/content", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, request.actor.id, params.id, "raw");
    const service = new DocumentService(fastify.store);
    const content = await tenantMediaAuthorized(fastify, request.actor.id, params.id, "raw")
      ? await service.tenantMediaContent(request.actor, params.id)
      : (assertTenantOwnedDocumentBoundary(fastify), await service.downloadContent(request.actor, params.id));
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
