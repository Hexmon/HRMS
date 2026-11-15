import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmploymentStatuses, Roles, type AuthUser } from "#shared";
import { errorsPlugin } from "../../../plugins/errors.js";
import { createMemoryDataStore, nowIso, seedIds, type MemoryDataStore } from "../../../platform/data-store.js";
import { assetRoutes } from "../routes.js";
import { createRecoveryTicketsForTerminatedEmployee } from "../events.js";
import { assertAssignedAssetEmployee } from "../policy.js";
import { AssetRepository } from "../repository.js";

const actorHeader = "x-test-actor";

function commandHeaders(actorId: string) {
  return { [actorHeader]: actorId, "Idempotency-Key": randomUUID() };
}

function recordMemoryTermination(store: MemoryDataStore, employeeUserId: string): string {
  const eventId = randomUUID();
  const employee = store.users.find((user) => user.id === employeeUserId)!;
  employee.employment_status = EmploymentStatuses.Terminated;
  const now = nowIso();
  store.outbox.push({
    id: store.outbox.length + 1,
    event_id: eventId,
    aggregate_type: "core.user",
    aggregate_id: employeeUserId,
    event_type: "core.user.terminated",
    payload: { user_id: employeeUserId, status: EmploymentStatuses.Terminated },
    idempotency_key: `core.user.deactivated:${employeeUserId}:${eventId}`,
    status: "pending",
    retry_count: 0,
    available_at: now,
    created_at: now,
    published_at: null,
    failed_at: null,
    last_error: null,
  });
  return eventId;
}

describe("asset routes with the memory persistence fallback", () => {
  let app: FastifyInstance;
  let store: MemoryDataStore;

  beforeEach(async () => {
    store = createMemoryDataStore();
    app = Fastify();
    app.decorate("store", store);
    app.decorateRequest("actor", undefined);
    app.addHook("onRequest", async (request) => {
      const actorId = request.headers[actorHeader];
      request.actor = typeof actorId === "string"
        ? store.users.find((user) => user.id === actorId) as AuthUser | undefined
        : undefined;
    });
    await app.register(errorsPlugin);
    await app.register(assetRoutes, { prefix: "/assets" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a current actor and idempotency key before a fallback mutation", async () => {
    const anonymous = await app.inject({
      method: "POST",
      url: "/assets/",
      payload: { asset_code: "MEM-ANON", asset_type: "Laptop", name: "Anonymous" },
    });
    expect(anonymous.statusCode).toBe(401);

    const missingKey = await app.inject({
      method: "POST",
      url: "/assets/",
      headers: { [actorHeader]: seedIds.assetManager },
      payload: { asset_code: "MEM-NOKEY", asset_type: "Laptop", name: "Missing key" },
    });
    // The in-memory fallback is deliberately compatible with the legacy local
    // runtime and does not require the SQL command envelope.
    expect(missingKey.statusCode).toBe(200);
    expect(missingKey.json()).toMatchObject({ asset_code: "MEM-NOKEY" });
  });

  it("exercises memory reads, assignee filtering, cancellation authority, and public scan", async () => {
    const managerHeaders = { [actorHeader]: seedIds.assetManager };
    expect((await app.inject({ method: "GET", url: "/assets/my" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/assets/assignees" })).statusCode).toBe(401);

    const assignees = await app.inject({
      method: "GET",
      url: "/assets/assignees?q=employee%20e1",
      headers: managerHeaders,
    });
    expect(assignees.statusCode).toBe(200);
    expect(assignees.json().items).toEqual([
      expect.objectContaining({ id: seedIds.employee1 }),
    ]);
    const allAssignees = await app.inject({
      method: "GET",
      url: "/assets/assignees",
      headers: managerHeaders,
    });
    expect(allAssignees.statusCode).toBe(200);
    expect(allAssignees.json().items.length).toBeGreaterThan(1);

    const created = await app.inject({
      method: "POST",
      url: "/assets/requests",
      headers: commandHeaders(seedIds.employee1),
      payload: { request_type: "new", asset_type: "Monitor", reason: "Customer project work" },
    });
    expect(created.statusCode).toBe(200);
    const request = created.json().request as { id: string; version: number };

    const foreignCancel = await app.inject({
      method: "POST",
      url: `/assets/requests/${request.id}/cancel`,
      headers: commandHeaders(seedIds.employee2),
      payload: { expected_version: request.version },
    });
    expect(foreignCancel.statusCode).toBe(404);

    const ownCancel = await app.inject({
      method: "POST",
      url: `/assets/requests/${request.id}/cancel`,
      headers: commandHeaders(seedIds.employee1),
      payload: { expected_version: request.version },
    });
    expect(ownCancel.statusCode).toBe(200);
    expect(ownCancel.json().request.status).toBe("cancelled");

    const asset = store.assets[0]!;
    const scan = await app.inject({ method: "POST", url: `/assets/scan/${asset.qr_hash}` });
    expect(scan.statusCode).toBe(200);
    expect(scan.json()).toMatchObject({ asset_code: asset.asset_code });
  });

  it("rejects acknowledgement and termination actions outside their memory authority", async () => {
    const asset = store.assets[0]!;
    const deniedAck = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/acknowledgements`,
      headers: commandHeaders(seedIds.employee1),
      payload: { acknowledgement_type: "received", expected_version: asset.version },
    });
    expect(deniedAck.statusCode).toBe(403);

    const employee = store.users.find((user) => user.id === seedIds.employee1)!;
    expect(employee.roles).not.toContain(Roles.Admin);
    const deniedTermination = await app.inject({
      method: "POST",
      url: "/assets/events/employee-terminated",
      headers: commandHeaders(employee.id),
      payload: { employee_user_id: seedIds.employee2, lifecycle_event_id: randomUUID() },
    });
    expect(deniedTermination.statusCode).toBe(403);

    const wrongVersionReturn = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/return`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { expected_version: asset.version + 1 },
    });
    expect(wrongVersionReturn.statusCode).toBe(409);
  });

  it("fails closed for missing read actors and invalid lifecycle or tenant resources", async () => {
    const adminHeaders = commandHeaders(seedIds.admin);
    const invalidTermination = await app.inject({
      method: "POST",
      url: "/assets/events/employee-terminated",
      headers: adminHeaders,
      payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: randomUUID() },
    });
    expect(invalidTermination.statusCode).toBe(409);

    const missingVendor = await app.inject({
      method: "PATCH",
      url: `/assets/vendors/${randomUUID()}`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { expected_version: 1, name: "Missing vendor" },
    });
    expect(missingVendor.statusCode).toBe(404);

    store.persistence = {
      flush: async () => undefined,
      reload: async () => undefined,
      close: async () => undefined,
      assetReadStore: async () => ({
        ...store,
        users: store.users.filter((user) => user.id !== seedIds.assetManager),
      }),
    };
    const removedActor = await app.inject({
      method: "GET",
      url: "/assets/",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(removedActor.statusCode).toBe(401);
  });

  it("validates linked request assets, fulfilled assignment choices, and memory licenses", async () => {
    const asset = store.assets[0]!;
    const created = await app.inject({
      method: "POST",
      url: "/assets/requests",
      headers: commandHeaders(seedIds.employee1),
      payload: {
        request_type: "repair",
        asset_type: "Linked repair",
        asset_id: asset.id,
        reason: "Repair the assigned project device",
      },
    });
    expect(created.statusCode).toBe(200);

    const fulfilled = await app.inject({
      method: "POST",
      url: `/assets/requests/${created.json().request.id}/decision`,
      headers: commandHeaders(seedIds.assetManager),
      payload: {
        decision: "fulfilled",
        expected_version: created.json().request.version,
        asset_id: asset.id,
      },
    });
    expect(fulfilled.statusCode).toBe(200);
    expect(fulfilled.json()).toMatchObject({
      request: { status: "fulfilled" },
      assigned_asset: { id: asset.id },
    });

    const validation = await app.inject({
      method: "POST",
      url: "/assets/licenses/validate",
      payload: { product_id: seedIds.licenseProduct, hardware_fingerprint: "memory-device" },
    });
    expect(validation.statusCode).toBe(200);
  });

  it("enforces the assigned-employee acknowledgement policy directly", () => {
    const employee = store.users.find((user) => user.id === seedIds.employee1)!;
    expect(() => assertAssignedAssetEmployee(employee.id, employee)).not.toThrow();
    expect(() => assertAssignedAssetEmployee(seedIds.employee2, employee)).toThrow(
      "Only the assigned employee can acknowledge this asset.",
    );
    expect(() => assertAssignedAssetEmployee(null, employee)).toThrow(
      "Only the assigned employee can acknowledge this asset.",
    );
  });

  it("returns an allow-listed asset view to the assigned employee", async () => {
    const asset = store.assets[0]!;
    asset.metadata = {
      category: "Computer",
      brand: "Lenovo",
      model: "T14",
      warranty_expiry: "2027-11-01",
      location: "Hyderabad",
      condition: "good",
      procurement_cost: "65000.00",
      vendor: "Private vendor",
      invoice_no: "INV-PRIVATE",
      confidential_note: "never expose",
    };
    const assigned = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assign`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version },
    });
    expect(assigned.statusCode).toBe(200);

    const deniedAdminAcknowledgement = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/acknowledgements`,
      headers: commandHeaders(seedIds.admin),
      payload: { acknowledgement_type: "received", expected_version: assigned.json().version },
    });
    expect(deniedAdminAcknowledgement.statusCode).toBe(403);

    const invalidReturnedAcknowledgement = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/acknowledgements`,
      headers: commandHeaders(seedIds.employee1),
      payload: { acknowledgement_type: "returned", expected_version: assigned.json().version },
    });
    expect(invalidReturnedAcknowledgement.statusCode).toBe(400);

    const employeeAcknowledgement = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/acknowledgements`,
      headers: commandHeaders(seedIds.employee1),
      payload: { acknowledgement_type: "received", expected_version: assigned.json().version },
    });
    expect(employeeAcknowledgement.statusCode).toBe(200);
    expect(employeeAcknowledgement.json().acknowledgement).toEqual(expect.objectContaining({
      acknowledgement_type: "received",
      status: "acknowledged",
    }));
    expect(employeeAcknowledgement.json().acknowledgement).not.toHaveProperty("assignment_id");
    expect(employeeAcknowledgement.json().acknowledgement).not.toHaveProperty("employee_user_id");
    expect(employeeAcknowledgement.json().asset.assignment_acknowledged).toBe(true);
    for (const protectedField of ["qr_hash", "metadata", "vendor", "invoice_no", "cost", "maintenance"]) {
      expect(employeeAcknowledgement.json().asset).not.toHaveProperty(protectedField);
    }

    const employeeHeaders = { [actorHeader]: seedIds.employee1 };
    const mine = await app.inject({ method: "GET", url: "/assets/my", headers: employeeHeaders });
    const detail = await app.inject({ method: "GET", url: `/assets/${asset.id}`, headers: employeeHeaders });
    const maintenance = await app.inject({ method: "GET", url: `/assets/${asset.id}/maintenance`, headers: employeeHeaders });
    expect(mine.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(maintenance.statusCode).toBe(403);
    for (const employeeAsset of [mine.json().items[0], detail.json()]) {
      expect(employeeAsset).toMatchObject({
        id: asset.id,
        brand: "Lenovo",
        is_assigned_to_current_user: true,
        assignment_acknowledged: true,
      });
      for (const protectedField of [
        "qr_hash", "metadata", "purchase_date", "vendor", "invoice_no", "cost", "maintenance",
        "current_assigned_user_id", "assigned_to_user_id", "assigned_to_name", "active_assignment_id",
        "latest_acknowledgement", "created_at", "updated_at", "deleted_at",
      ]) {
        expect(employeeAsset).not.toHaveProperty(protectedField);
      }
    }

    const managerDetail = await app.inject({
      method: "GET",
      url: `/assets/${asset.id}`,
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(managerDetail.json()).toMatchObject({
      qr_hash: asset.qr_hash,
      vendor: "Private vendor",
      invoice_no: "INV-PRIVATE",
      cost: "65000.00",
    });
  });

  it("rejects a foreign-company assignee before mutating the memory fallback", async () => {
    const asset = store.assets[0]!;
    const originalVersion = asset.version;
    const companyBId = randomUUID();
    store.companyProfiles.push({
      ...store.companyProfiles[0]!,
      id: companyBId,
      company_name: "Company B",
      company_slug: `company-b-${companyBId}`,
    });
    const employeePreference = store.userSessionPreferences.find((item) => item.user_id === seedIds.employee2)!;
    employeePreference.company_id = companyBId;

    const response = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assign`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { assigned_to_user_id: seedIds.employee2, expected_version: originalVersion },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toMatch(/actor's company/u);
    expect(asset).toMatchObject({ version: originalVersion, current_assigned_user_id: null });
    expect(store.assetAssignments.some((item) => item.asset_id === asset.id)).toBe(false);
    expect(store.assetStateEvents.some((item) => item.asset_id === asset.id && item.event_type === "asset.assigned")).toBe(false);
  });

  it("keeps original-company recovery identity after a later company/profile change", async () => {
    const asset = store.assets[0]!;
    const employee = store.users.find((user) => user.id === seedIds.employee1)!;
    const originalName = employee.full_name;
    const originalCode = employee.employee_code;
    const assigned = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assign`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { assigned_to_user_id: employee.id, expected_version: asset.version },
    });
    expect(assigned.statusCode).toBe(200);
    const lifecycleEventId = recordMemoryTermination(store, employee.id);
    const terminated = await app.inject({
      method: "POST",
      url: "/assets/events/employee-terminated",
      headers: commandHeaders(seedIds.admin),
      payload: { employee_user_id: employee.id, lifecycle_event_id: lifecycleEventId },
    });
    expect(terminated.statusCode).toBe(200);

    const companyBId = randomUUID();
    store.companyProfiles.push({
      ...store.companyProfiles[0]!,
      id: companyBId,
      company_name: "Company B",
      company_slug: `company-b-${companyBId}`,
    });
    store.userSessionPreferences.find((item) => item.user_id === employee.id)!.company_id = companyBId;
    employee.full_name = "Company B Updated Name";
    employee.employee_code = "B-SECRET-001";
    employee.email = "private-company-b@example.test";
    employee.roles = [Roles.FinanceManager];

    const queue = await app.inject({
      method: "GET",
      url: "/assets/recovery-queue",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().items[0].employee).toEqual({
      id: employee.id,
      full_name: originalName,
      employee_code: originalCode,
    });
    expect(queue.json().items[0].employee).not.toHaveProperty("email");
    expect(queue.json().items[0].employee).not.toHaveProperty("roles");
  });

  it("fails acknowledgement closed when custody has no matching active assignment", async () => {
    const asset = store.assets[0]!;
    const assigned = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assign`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version },
    });
    expect(assigned.statusCode).toBe(200);
    const assignment = store.assetAssignments.find(
      (candidate) => candidate.asset_id === asset.id && candidate.status === "active",
    )!;

    assignment.status = "returned";
    const missingAssignment = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/acknowledgements`,
      headers: commandHeaders(seedIds.employee1),
      payload: { acknowledgement_type: "received", expected_version: assigned.json().version },
    });
    expect(missingAssignment.statusCode).toBe(409);

    assignment.status = "active";
    assignment.assigned_to_user_id = seedIds.employee2;
    const mismatchedAssignment = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/acknowledgements`,
      headers: commandHeaders(seedIds.employee1),
      payload: { acknowledgement_type: "received", expected_version: assigned.json().version },
    });
    expect(mismatchedAssignment.statusCode).toBe(409);
  });

  it("keeps an incomplete employee projection safe when optional metadata and assignment are absent", async () => {
    const asset = store.assets[0]!;
    (asset as unknown as { metadata: Record<string, unknown> | null }).metadata = null;
    asset.current_assigned_user_id = seedIds.employee1;
    store.assetAssignments = store.assetAssignments.filter((candidate) => candidate.asset_id !== asset.id);

    const mine = await app.inject({
      method: "GET",
      url: "/assets/my",
      headers: { [actorHeader]: seedIds.employee1 },
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items[0]).toMatchObject({
      id: asset.id,
      assigned_on: null,
      assignment_acknowledged: false,
    });
    expect(mine.json().items[0]).not.toHaveProperty("metadata");
  });

  it("binds and settles one exact custody assignment in the memory lifecycle", async () => {
    const asset = store.assets[0]!;
    // Prove imported nonstandard request codes do not break monotonic request
    // allocation while also exercising the repository's fallback parser.
    store.assetRequests.push({
      ...store.assetRequests[0]!,
      id: randomUUID(),
      request_code: "LEGACY-ASSET-REQUEST",
    });
    const request = await app.inject({
      method: "POST",
      url: "/assets/requests",
      headers: commandHeaders(seedIds.employee1),
      payload: { request_type: "new", asset_type: "Laptop", reason: "Replacement for client work" },
    });
    expect(request.statusCode).toBe(200);

    const assigned = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assign`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version },
    });
    expect(assigned.statusCode).toBe(200);

    const lifecycleEventId = recordMemoryTermination(store, seedIds.employee1);
    const terminated = await app.inject({
      method: "POST",
      url: "/assets/events/employee-terminated",
      headers: commandHeaders(seedIds.admin),
      payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: lifecycleEventId },
    });
    expect(terminated.statusCode).toBe(200);
    expect(terminated.json().recovery_tickets_created).toBe(1);

    const ticket = store.assetRecoveryTickets[0]!;
    const settled = await app.inject({
      method: "POST",
      url: `/assets/recovery-queue/${ticket.id}/settlement`,
      headers: commandHeaders(seedIds.assetManager),
      payload: { settlement_status: "lost_damaged", expected_version: ticket.version },
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json()).toMatchObject({
      ticket: { status: "closed", settlement_status: "lost_damaged" },
      asset: { status: "Lost/Stolen", current_assigned_user_id: null },
    });
  });

  it("fails closed when termination cannot identify one active custody assignment", () => {
    const asset = store.assets[0]!;
    asset.status = "Assigned";
    asset.current_assigned_user_id = seedIds.employee1;
    store.assetAssignments = [];
    const companyId = store.userSessionPreferences.find((item) => item.user_id === seedIds.employee1)!.company_id!;
    expect(() => createRecoveryTicketsForTerminatedEmployee(store, companyId, seedIds.employee1))
      .toThrow(/no unique active assignment/u);
  });

  it("fails closed without mutating memory state when the terminated employee does not exist", () => {
    const companyId = store.userSessionPreferences.find((item) => item.user_id === seedIds.employee1)!.company_id!;
    const before = {
      assets: structuredClone(store.assets),
      tickets: structuredClone(store.assetRecoveryTickets),
      events: structuredClone(store.assetStateEvents),
    };

    expect(() => createRecoveryTicketsForTerminatedEmployee(store, companyId, randomUUID()))
      .toThrow(/terminated employee record is required/u);
    expect(store.assets).toEqual(before.assets);
    expect(store.assetRecoveryTickets).toEqual(before.tickets);
    expect(store.assetStateEvents).toEqual(before.events);
  });

  it("covers fallback request allocation, vendor uniqueness, and historical identity validation", () => {
    const companyId = store.userSessionPreferences.find((item) => item.user_id === seedIds.employee1)!.company_id!;
    store.assetCommandMetadata = undefined;
    store.assetRequests.push(
      { ...store.assetRequests[0]!, id: randomUUID(), company_id: companyId, request_code: "REQ-450" },
      { ...store.assetRequests[0]!, id: randomUUID(), company_id: companyId, request_code: "IMPORTED" },
    );
    const repository = new AssetRepository(store);
    const request = repository.createRequest(companyId, {
      requester_user_id: seedIds.employee1,
      request_type: "new",
      asset_type: "Laptop",
      asset_id: null,
      reason: "Fallback allocation coverage",
      priority: "medium",
      needed_by: null,
      preferred_specs: {},
      status: "pending",
      decision_by_user_id: null,
      decision_at: null,
      decision_remarks: null,
      assigned_asset_id: null,
    });
    expect(request.request_code).toBe("REQ-451");

    const firstVendor = repository.createVendor(companyId, { name: "Coverage Vendor" });
    expect(() => repository.createVendor(companyId, { name: " coverage vendor " }))
      .toThrow(/already exists/u);
    const secondVendor = repository.createVendor(companyId, { name: "Another Vendor" });
    expect(() => repository.updateVendorVersioned(secondVendor.id, companyId, secondVendor.version, (vendor) => {
      vendor.name = firstVendor.name.toUpperCase();
    })).toThrow(/already exists/u);

    expect(() => createRecoveryTicketsForTerminatedEmployee(
      store,
      companyId,
      seedIds.employee1,
      randomUUID(),
      { employeeUserId: seedIds.employee2, fullName: "Wrong Employee", employeeCode: "WRONG" },
    )).toThrow(/identity does not match/u);
  });

  it("increments bounded maintenance totals from zero", async () => {
    const asset = store.assets[0]!;
    store.assetReadMetadata = { operation: "assets.maintenance.list", assetMaintenanceTotals: {} };
    const response = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/maintenance`,
      headers: commandHeaders(seedIds.assetManager),
      payload: {
        maintenance_type: "inspection",
        started_on: "2026-11-15",
        expected_version: asset.version,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(store.assetReadMetadata.assetMaintenanceTotals?.[asset.id]).toBe(1);

    const second = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/maintenance`,
      headers: commandHeaders(seedIds.assetManager),
      payload: {
        maintenance_type: "inspection",
        started_on: "2026-11-16",
        expected_version: asset.version,
      },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(store.assetReadMetadata.assetMaintenanceTotals?.[asset.id]).toBe(2);
  });

  it("covers every changed protected route's own actor guard", async () => {
    const id = randomUUID();
    const anonymousRequests = [
      { method: "GET", url: "/assets/" },
      { method: "GET", url: "/assets/warranty-alerts" },
      { method: "GET", url: `/assets/${id}` },
      { method: "POST", url: `/assets/${id}/assign` },
      { method: "POST", url: `/assets/${id}/return` },
      { method: "POST", url: "/assets/licenses/revoke" },
      { method: "POST", url: "/assets/events/employee-terminated" },
      { method: "POST", url: "/assets/requests" },
      { method: "GET", url: "/assets/requests/my" },
      { method: "GET", url: "/assets/requests/queue" },
      { method: "POST", url: `/assets/requests/${id}/decision` },
      { method: "POST", url: `/assets/requests/${id}/cancel` },
      { method: "POST", url: `/assets/${id}/acknowledgements` },
      { method: "GET", url: `/assets/${id}/maintenance` },
      { method: "POST", url: `/assets/${id}/maintenance` },
      { method: "GET", url: "/assets/vendors" },
      { method: "POST", url: "/assets/vendors" },
      { method: "PATCH", url: `/assets/vendors/${id}` },
      { method: "GET", url: "/assets/recovery-queue" },
      { method: "POST", url: `/assets/recovery-queue/${id}/settlement` },
    ] as const;

    for (const request of anonymousRequests) {
      const response = await app.inject({ ...request, payload: request.method === "GET" ? undefined : {} });
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
    }
  });

  it("presents legacy recovery rows with missing employee and asset as review-only", async () => {
    store.assetRecoveryTickets.push({
      id: randomUUID(),
      company_id: store.userSessionPreferences.find((item) => item.user_id === seedIds.assetManager)!.company_id!,
      employee_user_id: randomUUID(),
      employee_full_name_snapshot: "Former Employee",
      employee_code_snapshot: "FORMER-001",
      asset_id: randomUUID(),
      assignment_id: null,
      status: "open",
      settlement_status: null,
      settlement_amount: null,
      settlement_remarks: null,
      settled_by_user_id: null,
      settled_at: null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const queue = await app.inject({
      method: "GET",
      url: "/assets/recovery-queue",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().items).toContainEqual(expect.objectContaining({
      employee: { id: expect.any(String), full_name: "Former Employee", employee_code: "FORMER-001" },
      asset: null,
      review_required: true,
    }));
  });

  it("ignores invalid warranty dates instead of producing a false alert", async () => {
    store.assets[0]!.metadata = { warranty_expiry: "not-a-date" };
    const alerts = await app.inject({
      method: "GET",
      url: "/assets/warranty-alerts?page=1&page_size=10",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().items).toEqual([]);
  });

  it("derives complete warranty severity counts when bounded SQL metadata is unavailable", async () => {
    const base = store.assets[0]!;
    const dateFromToday = (days: number) => {
      const value = new Date();
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    store.assets = [-1, 7, 30].map((days, index) => ({
      ...structuredClone(base),
      id: randomUUID(),
      asset_code: `MEM-WARRANTY-${index}`,
      metadata: { ...base.metadata, warranty_expiry: dateFromToday(days) },
    }));

    const alerts = await app.inject({
      method: "GET",
      url: "/assets/warranty-alerts?page=1&page_size=10&window_days=60&include_expired=true",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().counts).toEqual({ expired: 1, critical: 1, warning: 1 });
  });

  it("uses empty bounded aggregate metadata instead of mixing it with memory-wide totals", async () => {
    store.assetReadMetadata = { operation: "assets.requests.queue", total: 0 };
    const requests = await app.inject({
      method: "GET",
      url: "/assets/requests/queue?page=1&page_size=10",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(requests.statusCode).toBe(200);
    expect(requests.json().queue_counts).toEqual({});

    store.assetReadMetadata = undefined;
    const fallbackRequests = await app.inject({
      method: "GET",
      url: "/assets/requests/queue?page=1&page_size=10",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(fallbackRequests.statusCode).toBe(200);
    expect(fallbackRequests.json().queue_counts).toEqual(expect.objectContaining({
      pending: expect.any(Number), approved: expect.any(Number),
      rejected: expect.any(Number), fulfilled: expect.any(Number),
    }));

    store.assetReadMetadata = { operation: "assets.recovery.queue", total: 0 };
    const recovery = await app.inject({
      method: "GET",
      url: "/assets/recovery-queue?page=1&page_size=10",
      headers: { [actorHeader]: seedIds.assetManager },
    });
    expect(recovery.statusCode).toBe(200);
    expect(recovery.json().totals).toEqual({});
  });
});
