import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  documentUploadSchema,
  emsDecisionSchema,
  emsPolicyAcknowledgeSchema,
  emsProfileChangeCreateSchema,
  emsProfilePatchSchema,
  emsRequestCreateSchema,
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
    return new EmsService(fastify.store).attachEmployeeDocument(
      request.actor,
      params.user_id,
      emsDocumentUploadSchema.parse(request.body)
    );
  });
};
