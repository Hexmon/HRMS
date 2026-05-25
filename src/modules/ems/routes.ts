import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  documentUploadSchema,
  emsAdminChecklistUpdateSchema,
  emsDecisionSchema,
  emsPolicyUpdateSchema,
  emsPolicyAcknowledgeSchema,
  emsProbationDecisionSchema,
  emsProfileChangeCreateSchema,
  emsProfilePatchSchema,
  emsRequestCreateSchema,
  emsServiceRequestDecisionSchema,
  paginationQuerySchema
} from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { EmsService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const userIdParamSchema = z.object({ user_id: z.uuid() });

const emsQuerySchema = paginationQuerySchema.extend({
  status: z.string().max(64).optional(),
  type: z.string().max(64).optional(),
  user_id: z.uuid().optional(),
  department_id: z.uuid().optional()
});
const emsDocumentQuerySchema = paginationQuerySchema.extend({
  document_type: z.string().max(80).optional()
});
const emsDocumentUploadSchema = documentUploadSchema.omit({
  business_object_type: true,
  business_object_id: true
}).extend({
  replace_document_id: z.uuid().optional()
});

export const emsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/ems/profile/me", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).getMyProfile(request.actor);
  });

  fastify.patch("/ems/profile/me", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).patchMyProfile(
      request.actor,
      emsProfilePatchSchema.parse(request.body)
    );
  });

  fastify.post("/ems/profile-change-requests", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).createProfileChangeRequest(
      request.actor,
      emsProfileChangeCreateSchema.parse(request.body)
    );
  });

  fastify.get("/ems/profile-change-requests/my", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listMyProfileChangeRequests(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.get("/ems/profile-change-requests/queue/hr", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).profileChangeQueue(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.post("/ems/profile-change-requests/:id/decision", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new EmsService(fastify.store).decideProfileChange(
      request.actor,
      params.id,
      emsDecisionSchema.parse(request.body)
    );
  });

  fastify.post("/ems/requests", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).createServiceRequest(
      request.actor,
      emsRequestCreateSchema.parse(request.body)
    );
  });

  fastify.get("/ems/requests/my", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listMyServiceRequests(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.get("/ems/requests/queue/hr", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).serviceRequestQueue(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.post("/ems/requests/:id/decision", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new EmsService(fastify.store).decideServiceRequest(
      request.actor,
      params.id,
      emsServiceRequestDecisionSchema.parse(request.body)
    );
  });

  fastify.get("/ems/admin/onboarding", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listAdminChecklists(
      request.actor,
      "onboarding",
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.patch("/ems/admin/onboarding/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new EmsService(fastify.store).updateAdminChecklist(
      request.actor,
      "onboarding",
      params.id,
      emsAdminChecklistUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/ems/admin/probation", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listProbationReviews(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.post("/ems/admin/probation/:id/decision", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new EmsService(fastify.store).decideProbation(
      request.actor,
      params.id,
      emsProbationDecisionSchema.parse(request.body)
    );
  });

  fastify.get("/ems/admin/exits", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listAdminChecklists(
      request.actor,
      "exit",
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.patch("/ems/admin/exits/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new EmsService(fastify.store).updateAdminChecklist(
      request.actor,
      "exit",
      params.id,
      emsAdminChecklistUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/ems/letters", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listLetters(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.post("/ems/letters/:id/acknowledge", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    const body = emsPolicyAcknowledgeSchema.parse(request.body);
    return new EmsService(fastify.store).acknowledgeLetter(
      request.actor,
      params.id,
      body.expected_version
    );
  });

  fastify.get("/ems/policies", async (request) => {
    if (!request.actor) throw unauthorized();
    return new EmsService(fastify.store).listPolicies(
      request.actor,
      emsQuerySchema.parse(request.query)
    );
  });

  fastify.post("/ems/policies/:id/acknowledge", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    const body = emsPolicyAcknowledgeSchema.parse(request.body);
    return new EmsService(fastify.store).acknowledgePolicy(
      request.actor,
      params.id,
      body.expected_version
    );
  });

  fastify.put("/ems/policies/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new EmsService(fastify.store).updatePolicy(
      request.actor,
      params.id,
      emsPolicyUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/ems/employees/:user_id/documents", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = userIdParamSchema.parse(request.params);
    return new EmsService(fastify.store).listEmployeeDocuments(
      request.actor,
      params.user_id,
      emsDocumentQuerySchema.parse(request.query)
    );
  });

  fastify.post("/ems/employees/:user_id/documents", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = userIdParamSchema.parse(request.params);
    const upload = await parseEmsDocumentUpload(request);
    return new EmsService(fastify.store).attachEmployeeDocument(
      request.actor,
      params.user_id,
      {
        ...emsDocumentUploadSchema.parse(upload.fields),
        file_buffer: upload.fileBuffer
      }
    );
  });
};

async function parseEmsDocumentUpload(request: FastifyRequest): Promise<{
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
