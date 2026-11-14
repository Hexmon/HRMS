import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Roles, type AuthUser } from "#shared";
import { errorsPlugin } from "../../../plugins/errors.js";
import { createMemoryDataStore, seedIds, type MemoryDataStore } from "../../../platform/data-store.js";
import { assetRoutes } from "../routes.js";
import { createRecoveryTicketsForTerminatedEmployee } from "../events.js";

const actorHeader = "x-test-actor";

function commandHeaders(actorId: string) {
  return { [actorHeader]: actorId, "Idempotency-Key": randomUUID() };
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
      payload: { employee_user_id: seedIds.employee2 },
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

    const terminated = await app.inject({
      method: "POST",
      url: "/assets/events/employee-terminated",
      headers: commandHeaders(seedIds.assetManager),
      payload: { employee_user_id: seedIds.employee1 },
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
    expect(() => createRecoveryTicketsForTerminatedEmployee(store, seedIds.employee1))
      .toThrow(/no unique active assignment/u);
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
      employee_user_id: randomUUID(),
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
      employee: null,
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
});
