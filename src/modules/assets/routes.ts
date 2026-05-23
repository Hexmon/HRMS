import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assetAssignSchema, assetCreateSchema, licenseActivationSchema, paginationQuerySchema } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { AssetService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const qrParamSchema = z.object({ qr_hash: z.string().min(1) });
const assetRequestSchema = z.object({
  request_type: z.enum(["new", "replacement", "repair", "return"]),
  asset_type: z.string().min(1).max(80),
  asset_id: z.uuid().nullable().optional(),
  reason: z.string().min(3).max(2000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  needed_by: z.iso.date().nullable().optional(),
  preferred_specs: z.record(z.string(), z.unknown()).optional()
});
const assetRequestQuerySchema = paginationQuerySchema.extend({
  status: z.string().min(1).max(40).optional(),
  type: z.string().min(1).max(80).optional(),
  department_id: z.uuid().optional()
});
const assetRequestDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "returned", "fulfilled"]),
  remarks: z.string().max(2000).nullable().optional(),
  expected_version: z.number().int().positive(),
  asset_id: z.uuid().nullable().optional()
});
const assetRequestCancelSchema = z.object({
  remarks: z.string().max(2000).nullable().optional(),
  expected_version: z.number().int().positive()
});
const acknowledgementSchema = z.object({
  acknowledgement_type: z.enum(["received", "returned"]),
  expected_version: z.number().int().positive()
});
const maintenanceQuerySchema = paginationQuerySchema.extend({
  status: z.string().min(1).max(40).optional()
});
const maintenanceSchema = z.object({
  maintenance_type: z.enum(["repair", "preventive", "warranty", "inspection", "other"]),
  vendor_id: z.uuid().nullable().optional(),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  started_on: z.iso.date(),
  completed_on: z.iso.date().nullable().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
  expected_version: z.number().int().positive()
});
const vendorQuerySchema = paginationQuerySchema.extend({
  active_only: z.coerce.boolean().optional(),
  search: z.string().min(1).max(120).optional()
});
const recoveryQuerySchema = paginationQuerySchema.extend({
  user_id: z.uuid().optional(),
  status: z.string().min(1).max(40).optional()
});

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

  fastify.post("/requests", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).createRequest(request.actor, assetRequestSchema.parse(request.body));
  });

  fastify.get("/requests/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).myRequests(
      request.actor,
      assetRequestQuerySchema.parse(request.query)
    );
  });

  fastify.get("/requests/queue", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).requestQueue(
      request.actor,
      assetRequestQuerySchema.parse(request.query)
    );
  });

  fastify.post("/requests/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AssetService(fastify.store).decideRequest(
      request.actor,
      params.id,
      assetRequestDecisionSchema.parse(request.body)
    );
  });

  fastify.post("/requests/:id/cancel", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AssetService(fastify.store).cancelRequest(
      request.actor,
      params.id,
      assetRequestCancelSchema.parse(request.body)
    );
  });

  fastify.post("/:id/acknowledgements", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AssetService(fastify.store).acknowledge(
      request.actor,
      params.id,
      acknowledgementSchema.parse(request.body)
    );
  });

  fastify.get("/:id/maintenance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AssetService(fastify.store).listMaintenance(
      request.actor,
      params.id,
      maintenanceQuerySchema.parse(request.query)
    );
  });

  fastify.post("/:id/maintenance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AssetService(fastify.store).createMaintenance(
      request.actor,
      params.id,
      maintenanceSchema.parse(request.body)
    );
  });

  fastify.get("/vendors", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).vendors(request.actor, vendorQuerySchema.parse(request.query));
  });

  fastify.get("/recovery-queue", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AssetService(fastify.store).recoveryQueue(
      request.actor,
      recoveryQuerySchema.parse(request.query)
    );
  });
};
