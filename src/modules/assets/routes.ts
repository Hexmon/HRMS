import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assetAssignSchema, assetCreateSchema, licenseActivationSchema, paginationQuerySchema } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { AssetService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const qrParamSchema = z.object({ qr_hash: z.string().min(1) });

export const assetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).create(request.actor, assetCreateSchema.parse(request.body));
  });

  fastify.get("/", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    return new AssetService(fastify.store).list(request.actor, query.page, query.page_size);
  });

  fastify.get("/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AssetService(fastify.store).detail(request.actor, params.id);
  });

  fastify.post("/:id/assign", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = assetAssignSchema.parse(request.body);
    return new AssetService(fastify.store).assign(request.actor, params.id, body.assigned_to_user_id, body.expected_version);
  });

  fastify.post("/:id/return", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = z.object({ expected_version: z.number().int().min(1) }).parse(request.body);
    return new AssetService(fastify.store).returnAsset(request.actor, params.id, body.expected_version);
  });

  fastify.post("/scan/:qr_hash", async (request) => {
    const params = qrParamSchema.parse(request.params);
    return new AssetService(fastify.store).scan(params.qr_hash);
  });

  fastify.post("/licenses/activate", async (request) => {
    return new AssetService(fastify.store).activateLicense(licenseActivationSchema.parse(request.body));
  });

  fastify.post("/licenses/validate", async (request) => {
    return new AssetService(fastify.store).validateLicense(
      z.object({ product_id: z.uuid(), hardware_fingerprint: z.string().min(8) }).parse(request.body)
    );
  });

  fastify.post("/licenses/revoke", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).revokeLicense(
      request.actor,
      z.object({ hardware_fingerprint: z.string().min(8) }).parse(request.body)
    );
  });

  fastify.post("/events/employee-terminated", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = z.object({ employee_user_id: z.uuid() }).parse(request.body);
    return new AssetService(fastify.store).consumeEmployeeTerminated(body.employee_user_id);
  });
};
