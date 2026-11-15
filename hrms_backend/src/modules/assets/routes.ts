import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assetAssignSchema, assetCreateSchema, EmploymentStatuses, licenseActivationSchema, paginationQuerySchema, Roles, type AuthUser } from "#shared";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../platform/errors.js";
import type { AssetCommandExecutionContext, AssetCommandInput, AssetReadQuery, DataStore } from "../../platform/data-store.js";
import { canonicalJsonHash } from "../attendance/canonical-json.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import { assertAssetManager } from "./policy.js";
import { AssetService } from "./service.js";

async function readStore(store: DataStore, operation: string, query?: AssetReadQuery): Promise<DataStore> {
  return store.persistence?.assetReadStore?.(undefined, undefined, undefined, operation, query) ?? store;
}

async function readContext(
  store: DataStore,
  actor: AuthUser,
  operation: string,
  query?: AssetReadQuery,
): Promise<{ store: DataStore; actor: AuthUser }> {
  const membership = resolveActiveCompanyMembershipContext(store, {
    userId: actor.id,
    operation,
    requireActiveEmployment: true,
  });
  const snapshot = await store.persistence?.assetReadStore?.(
    undefined,
    membership.companyId,
    actor.id,
    operation,
    query,
  ) ?? store;
  const currentActor = snapshot.users.find((user) => user.id === actor.id);
  if (!currentActor) throw unauthorized("User no longer exists");
  return { store: snapshot, actor: currentActor };
}

async function assetMutation<T>(
  store: DataStore,
  request: FastifyRequest,
  actionKey: string,
  body: Record<string, unknown>,
  authorize: (store: DataStore, actor: AuthUser, companyId: string, replayBody?: T) => void,
  execute: (service: AssetService, actor: AuthUser, context: AssetCommandExecutionContext) => T,
  commandContext: Pick<AssetCommandInput,
    "assigneeUserId" | "lifecycleEventId" | "terminatedEmployeeUserId" |
    "resourceId" | "relatedAssetId" | "relatedVendorId" | "requestAssetType" | "vendorName"
    | "assetCode"
    | "licenseProductId" | "licenseEntitlementId" | "licenseFingerprintHash"
  >,
): Promise<T> {
  if (!request.actor) throw unauthorized();
  const actor = request.actor;
  if (!store.persistence?.assetCommand) {
    const membership = resolveActiveCompanyMembershipContext(store, {
      userId: actor.id,
      operation: actionKey,
      requireActiveEmployment: true,
    });
    authorize(store, actor, membership.companyId);
    if (commandContext.assigneeUserId) {
      const assignee = store.users.find((candidate) =>
        candidate.id === commandContext.assigneeUserId &&
        !candidate.deleted_at &&
        candidate.employment_status === EmploymentStatuses.Active
      );
      const sameCompany = store.userSessionPreferences.some((preference) =>
        preference.user_id === commandContext.assigneeUserId && preference.company_id === membership.companyId
      );
      if (!assignee || !sameCompany) {
        throw forbidden("Assignee is not an active employee in the actor's company.");
      }
    }
    return execute(new AssetService(store), actor, {});
  }
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,199}$/u.test(key)) {
    throw badRequest("A unique Idempotency-Key header is required for asset changes.");
  }
  const membership = resolveActiveCompanyMembershipContext(store, {
    userId: actor.id,
    operation: actionKey,
    requireActiveEmployment: true,
  });
  return store.persistence.assetCommand(
    {
      companyId: membership.companyId,
      actorUserId: actor.id,
      actionKey,
      idempotencyKey: key,
      requestHash: canonicalJsonHash({ actionKey, body }),
      ...commandContext,
    },
    (snapshot, freshActor, replayBody) => authorize(snapshot, freshActor, membership.companyId, replayBody),
    (staged, freshActor, context) => execute(new AssetService(staged), freshActor, context),
  );
}

function authorizeOwnRequest(store: DataStore, actor: AuthUser, companyId: string, id: string): void {
  if (!store.assetRequests.some((item) =>
    item.id === id && item.company_id === companyId && !item.deleted_at && item.requester_user_id === actor.id
  )) {
    throw notFound("Asset request not found", { id });
  }
}

function authorizeAcknowledgement(store: DataStore, actor: AuthUser, companyId: string, id: string, replayBody?: unknown): void {
  const asset = store.assets.find((item) => item.id === id && item.company_id === companyId && !item.deleted_at);
  if (!asset) throw forbidden("Only the assigned employee can acknowledge this asset.");
  if (replayBody !== undefined) {
    const body = replayBody && typeof replayBody === "object" ? replayBody as Record<string, unknown> : null;
    const acknowledgement = body?.acknowledgement && typeof body.acknowledgement === "object"
      ? body.acknowledgement as Record<string, unknown> : null;
    const recorded = store.assetAcknowledgements.find((item) =>
      item.id === acknowledgement?.id && item.company_id === companyId && item.asset_id === id && item.employee_user_id === actor.id
    );
    const originalEmployeeAssignment = recorded?.assignment_id && store.assetAssignments.some((assignment) =>
      assignment.id === recorded.assignment_id && assignment.company_id === companyId && assignment.asset_id === id && assignment.assigned_to_user_id === actor.id
    );
    if (recorded && originalEmployeeAssignment) return;
    throw forbidden("Only the original assigned employee can replay this acknowledgement.");
  }
  if (asset.current_assigned_user_id !== actor.id) {
    throw forbidden("Only the assigned employee can acknowledge this asset.");
  }
}

function authorizeAssetManagerResource(store: DataStore, actor: AuthUser, companyId: string, id: string): void {
  assertAssetManager(actor);
  if (!store.assets.some((asset) => asset.id === id && asset.company_id === companyId && !asset.deleted_at)) {
    throw notFound("Asset not found", { id });
  }
}

function authorizeAssetManagerRequest(store: DataStore, actor: AuthUser, companyId: string, id: string): void {
  assertAssetManager(actor);
  if (!store.assetRequests.some((request) => request.id === id && request.company_id === companyId && !request.deleted_at)) {
    throw notFound("Asset request not found", { id });
  }
}

function authorizeAssetManagerVendor(store: DataStore, actor: AuthUser, companyId: string, id: string): void {
  assertAssetManager(actor);
  if (!store.assetVendors.some((vendor) => vendor.id === id && vendor.company_id === companyId && !vendor.deleted_at)) {
    throw notFound("Asset vendor not found", { id });
  }
}

function authorizeAssetManagerRecovery(store: DataStore, actor: AuthUser, companyId: string, id: string): void {
  assertAssetManager(actor);
  if (!store.assetRecoveryTickets.some((ticket) => ticket.id === id && ticket.company_id === companyId)) {
    throw notFound("Asset recovery ticket not found", { id });
  }
}

function authorizeTermination(actor: AuthUser): void {
  if (![Roles.Admin, Roles.HRManager].some((role) => actor.roles.includes(role))) {
    throw forbidden("HR or Admin role required.");
  }
}

function authorizeMemoryTermination(
  store: DataStore,
  companyId: string,
  input: { employee_user_id: string; lifecycle_event_id: string },
): void {
  const employee = store.users.find((user) => user.id === input.employee_user_id);
  const lifecycle = store.outbox.find((event) =>
    event.event_id === input.lifecycle_event_id &&
    event.aggregate_type === "core.user" &&
    event.aggregate_id === input.employee_user_id &&
    event.event_type === "core.user.terminated"
  );
  const assigned = store.assetAssignments.some((assignment) =>
    assignment.company_id === companyId &&
    assignment.assigned_to_user_id === input.employee_user_id &&
    assignment.status === "active"
  );
  if (employee?.employment_status !== EmploymentStatuses.Terminated || !lifecycle || !assigned) {
    throw conflict("Employee termination event is not eligible for asset recovery.");
  }
}

const idParamSchema = z.object({ id: z.uuid() });
const qrParamSchema = z.object({ qr_hash: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/u) });
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
  acknowledgement_type: z.literal("received"),
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
const assetVendorCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contact_email: z.email().nullable().optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
const assetVendorUpdateSchema = assetVendorCreateSchema.partial().extend({
  expected_version: z.number().int().positive()
});
const recoveryQuerySchema = paginationQuerySchema.extend({
  user_id: z.uuid().optional(),
  status: z.string().min(1).max(40).optional()
});
const recoverySettlementSchema = z.object({
  settlement_status: z.enum(["recovered", "deduction", "waived", "lost_damaged"]),
  settlement_amount: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  remarks: z.string().trim().max(2000).nullable().optional(),
  expected_version: z.number().int().positive()
});
const warrantyAlertsQuerySchema = paginationQuerySchema.extend({
  window_days: z.coerce.number().int().min(0).max(365).optional(),
  include_expired: z.coerce.boolean().optional()
});

export const assetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/", async (request) => {
    const body = assetCreateSchema.parse(request.body);
    return assetMutation(fastify.store, request, "assets.create", body, (_store, actor) => assertAssetManager(actor), (service, actor) => service.create(actor, body), { assetCode: body.asset_code });
  });

  fastify.get("/", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.list", {
      page: query.page,
      pageSize: query.page_size,
    });
    return new AssetService(context.store).list(context.actor, query.page, query.page_size);
  });

  fastify.get("/warranty-alerts", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = warrantyAlertsQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.warranty-alerts", {
      page: query.page,
      pageSize: query.page_size,
      windowDays: query.window_days,
      includeExpired: query.include_expired,
    });
    return new AssetService(context.store).warrantyAlerts(
      context.actor,
      query
    );
  });

  fastify.get("/my", async (request) => {
    if (!request.actor) throw unauthorized();
    const query = paginationQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.my", {
      page: query.page,
      pageSize: query.page_size,
      userId: request.actor.id,
    });
    return new AssetService(context.store).myAssets(context.actor, query.page, query.page_size);
  });

  fastify.get("/assignees", async (request) => {
    if (!request.actor) throw unauthorized();
    const query = z.object({ q: z.string().trim().max(120).optional() }).parse(request.query);
    if (!fastify.store.persistence?.assetAssignees) return new AssetService(fastify.store).assignees(request.actor, query.q);
    const company = resolveActiveCompanyMembershipContext(fastify.store, { userId: request.actor.id, operation: "assets.assignees", requireActiveEmployment: true });
    return fastify.store.persistence.assetAssignees(request.actor.id, company.companyId, query.q);
  });

  fastify.get("/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const context = await readContext(fastify.store, request.actor, "assets.detail", {
      resourceId: params.id,
    });
    return new AssetService(context.store).detail(context.actor, params.id);
  });

  fastify.post("/:id/assign", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = assetAssignSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.assign:${params.id}`, body, (store, actor, companyId) => authorizeAssetManagerResource(store, actor, companyId, params.id), (service, actor) => service.assign(actor, params.id, body.assigned_to_user_id, body.expected_version), { assigneeUserId: body.assigned_to_user_id, resourceId: params.id });
  });

  fastify.post("/:id/return", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = z.object({ expected_version: z.number().int().min(1) }).parse(request.body);
    return assetMutation(fastify.store, request, `assets.return:${params.id}`, body, (store, actor, companyId) => authorizeAssetManagerResource(store, actor, companyId, params.id), (service, actor) => service.returnAsset(actor, params.id, body.expected_version), { resourceId: params.id });
  });

  fastify.post("/scan/:qr_hash", async (request) => {
    const params = qrParamSchema.parse(request.params);
    if (fastify.store.persistence?.assetPublicScan) {
      const asset = await fastify.store.persistence.assetPublicScan(params.qr_hash);
      if (!asset) throw notFound("Asset not found", { qr_hash: params.qr_hash });
      return asset;
    }
    return new AssetService(fastify.store).scan(params.qr_hash);
  });

  fastify.post("/licenses/activate", async (request) => {
    const body = licenseActivationSchema.parse(request.body);
    return assetMutation(fastify.store, request, "assets.licenses.activate", body, (_store, actor) => assertAssetManager(actor), (service) => service.activateLicense(body), {
      licenseProductId: body.product_id,
      licenseEntitlementId: body.entitlement_id,
      licenseFingerprintHash: createHash("sha256").update(body.hardware_fingerprint).digest("hex"),
    });
  });

  fastify.post("/licenses/validate", async (request) => {
    const body = z.object({ product_id: z.uuid(), hardware_fingerprint: z.string().min(8) }).parse(request.body);
    const fingerprintHash = createHash("sha256").update(body.hardware_fingerprint).digest("hex");
    return new AssetService(await readStore(fastify.store, "assets.licenses.validate", {
      licenseProductId: body.product_id,
      licenseFingerprintHash: fingerprintHash,
    })).validateLicense(body);
  });

  fastify.post("/licenses/revoke", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = z.object({ hardware_fingerprint: z.string().min(8) }).parse(request.body);
    return assetMutation(fastify.store, request, "assets.licenses.revoke", body, (_store, actor) => assertAssetManager(actor), (service, actor) => service.revokeLicense(actor, body), {
      licenseFingerprintHash: createHash("sha256").update(body.hardware_fingerprint).digest("hex"),
    });
  });

  fastify.post("/events/employee-terminated", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = z.object({ employee_user_id: z.uuid(), lifecycle_event_id: z.uuid() }).parse(request.body);
    const company = resolveActiveCompanyMembershipContext(fastify.store, {
      userId: request.actor.id,
      operation: "assets.employee-terminated",
      requireActiveEmployment: true,
    });
    authorizeTermination(request.actor);
    if (!fastify.store.persistence?.assetCommand) authorizeMemoryTermination(fastify.store, company.companyId, body);
    return assetMutation(
      fastify.store,
      request,
      `assets.employee-terminated:${body.lifecycle_event_id}`,
      body,
      (_store, actor) => authorizeTermination(actor),
      (service, actor, context) => service.consumeEmployeeTerminated(
        actor,
        body.employee_user_id,
        body.lifecycle_event_id,
        context.terminationIdentity,
      ),
      { lifecycleEventId: body.lifecycle_event_id, terminatedEmployeeUserId: body.employee_user_id },
    );
  });

  fastify.post("/requests", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = assetRequestSchema.parse(request.body);
    return assetMutation(fastify.store, request, "assets.requests.create", body, () => undefined, (service, actor) => service.createRequest(actor, body), { relatedAssetId: body.asset_id ?? undefined, requestAssetType: body.asset_type });
  });

  fastify.get("/requests/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = assetRequestQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.requests.my", {
      page: query.page,
      pageSize: query.page_size,
      userId: request.actor.id,
      status: query.status,
      type: query.type,
    });
    return new AssetService(context.store).myRequests(
      context.actor,
      query
    );
  });

  fastify.get("/requests/queue", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = assetRequestQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.requests.queue", {
      page: query.page,
      pageSize: query.page_size,
      status: query.status,
      type: query.type,
    });
    return new AssetService(context.store).requestQueue(
      context.actor,
      query
    );
  });

  fastify.post("/requests/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = assetRequestDecisionSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.requests.decision:${params.id}`, body, (store, actor, companyId) => authorizeAssetManagerRequest(store, actor, companyId, params.id), (service, actor) => service.decideRequest(actor, params.id, body), { resourceId: params.id, relatedAssetId: body.asset_id ?? undefined });
  });

  fastify.post("/requests/:id/cancel", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = assetRequestCancelSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.requests.cancel:${params.id}`, body, (store, actor, companyId) => authorizeOwnRequest(store, actor, companyId, params.id), (service, actor) => service.cancelRequest(actor, params.id, body), { resourceId: params.id });
  });

  fastify.post("/:id/acknowledgements", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = acknowledgementSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.acknowledge:${params.id}`, body, (store, actor, companyId, replayBody) => authorizeAcknowledgement(store, actor, companyId, params.id, replayBody), (service, actor) => service.acknowledge(actor, params.id, body), { resourceId: params.id });
  });

  fastify.get("/:id/maintenance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const query = maintenanceQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.maintenance.list", {
      resourceId: params.id,
      page: query.page,
      pageSize: query.page_size,
      status: query.status,
    });
    return new AssetService(context.store).listMaintenance(
      context.actor,
      params.id,
      query
    );
  });

  fastify.post("/:id/maintenance", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = maintenanceSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.maintenance.create:${params.id}`, body, (store, actor, companyId) => authorizeAssetManagerResource(store, actor, companyId, params.id), (service, actor) => service.createMaintenance(actor, params.id, body), { resourceId: params.id, relatedVendorId: body.vendor_id ?? undefined });
  });

  fastify.get("/vendors", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = vendorQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.vendors.list", {
      page: query.page,
      pageSize: query.page_size,
      activeOnly: query.active_only,
      search: query.search,
    });
    return new AssetService(context.store).vendors(context.actor, query);
  });

  fastify.post("/vendors", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = assetVendorCreateSchema.parse(request.body);
    return assetMutation(fastify.store, request, "assets.vendors.create", body, (_store, actor) => assertAssetManager(actor), (service, actor) => service.createVendor(actor, body), { vendorName: body.name });
  });

  fastify.patch("/vendors/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = assetVendorUpdateSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.vendors.update:${params.id}`, body, (store, actor, companyId) => authorizeAssetManagerVendor(store, actor, companyId, params.id), (service, actor) => service.updateVendor(actor, params.id, body), { resourceId: params.id, vendorName: body.name });
  });

  fastify.get("/recovery-queue", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = recoveryQuerySchema.parse(request.query);
    const context = await readContext(fastify.store, request.actor, "assets.recovery.queue", {
      page: query.page,
      pageSize: query.page_size,
      userId: query.user_id,
      status: query.status,
    });
    return new AssetService(context.store).recoveryQueue(
      context.actor,
      query
    );
  });

  fastify.post("/recovery-queue/:id/settlement", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = recoverySettlementSchema.parse(request.body);
    return assetMutation(fastify.store, request, `assets.recovery.settle:${params.id}`, body, (store, actor, companyId) => authorizeAssetManagerRecovery(store, actor, companyId, params.id), (service, actor) => service.settleRecovery(actor, params.id, body), { resourceId: params.id });
  });
};
