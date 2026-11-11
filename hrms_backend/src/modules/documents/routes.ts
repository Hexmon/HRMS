import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { documentUploadSchema, paginationQuerySchema } from "#shared";
import { conflict, unauthorized } from "../../platform/errors.js";
import { DocumentService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const documentListQuerySchema = paginationQuerySchema.extend({
  business_object_type: z.string().optional(),
  business_object_id: z.uuid().optional()
});

async function assertNoExpenseDocumentAccess(fastify: FastifyInstance, documentId: string): Promise<void> {
  if (fastify.store.kind !== "postgres") return;
  const linkedInMemory = fastify.store.documents.some((document) =>
    document.id === documentId && document.business_object_type === "expense_ticket") ||
    fastify.store.expenseDocuments.some((link) => link.document_id === documentId);
  const linkedInSql = await fastify.store.persistence?.isExpenseDocumentId?.(documentId);
  if (linkedInSql === undefined || linkedInMemory || linkedInSql) {
    throw conflict("Expense receipt access requires original-company parent authorization");
  }
}

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const upload = await parseDocumentUpload(request);
    const body = documentUploadSchema.parse(upload.fields);
    return new DocumentService(fastify.store).upload(request.actor, {
      ...body,
      file_buffer: upload.fileBuffer
    });
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
    return new DocumentService(fastify.store).upload(request.actor, {
      ...body,
      business_object_type: "expense_ticket",
      business_object_id: params.id,
      file_buffer: upload.fileBuffer
    });
  });

  fastify.get("/documents", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = documentListQuerySchema.parse(request.query);
    if (fastify.store.kind === "postgres") {
      throw conflict("Document list requires tenant-scoped receipt filtering");
    }
    return new DocumentService(fastify.store).list(request.actor, query);
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
    await assertNoExpenseDocumentAccess(fastify, params.id);
    return new DocumentService(fastify.store).metadata(request.actor, params.id);
  });

  fastify.post("/documents/:id/download-url", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, params.id);
    return new DocumentService(fastify.store).downloadUrl(request.actor, params.id, fastify.config.API_BASE_URL);
  });

  fastify.get("/documents/:id/content", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, params.id);
    const content = await new DocumentService(fastify.store).downloadContent(request.actor, params.id);
    reply
      .header("content-type", content.contentType)
      .header("content-length", String(content.size))
      .header("content-disposition", `inline; filename="${safeDispositionFileName(content.fileName)}"`);
    return reply.send(content.body);
  });

  fastify.delete("/documents/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, params.id);
    return new DocumentService(fastify.store).delete(request.actor, params.id);
  });

  fastify.post("/documents/:id/verify", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    await assertNoExpenseDocumentAccess(fastify, params.id);
    return new DocumentService(fastify.store).verify(request.actor, params.id);
  });

  fastify.get("/documents/:id/access-log", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    await assertNoExpenseDocumentAccess(fastify, params.id);
    return new DocumentService(fastify.store).accessLog(request.actor, params.id, query.page, query.page_size);
  });
};

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
