import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { seedIds } from "../../../platform/data-store.js";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("assets and licenses", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns safe QR scan output and creates recovery tickets on termination", async () => {
    const assetManager = await loginAs(app, "AST");
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/assets?page=1&page_size=10",
      headers: authHeader(assetManager.token)
    });
    const asset = list.json().items[0];

    const assign = await app.inject({
      method: "POST",
      url: `/api/v1/assets/${asset.id}/assign`,
      headers: authHeader(assetManager.token),
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version }
    });
    expect(assign.statusCode).toBe(200);

    const scan = await app.inject({
      method: "POST",
      url: `/api/v1/assets/scan/${asset.qr_hash}`
    });
    expect(scan.statusCode).toBe(200);
    expect(scan.json().id).toBeUndefined();
    expect(JSON.stringify(scan.json())).not.toContain("procurement_cost");

    const recovery = await app.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: authHeader(assetManager.token),
      payload: { employee_user_id: seedIds.employee1 }
    });
    expect(recovery.statusCode).toBe(200);
    expect(recovery.json().recovery_tickets_created).toBe(1);
  });

  it("blocks license overuse and compromised activation", async () => {
    const assetManager = await loginAs(app, "AST");
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/assets/licenses/activate",
      headers: authHeader(assetManager.token),
      payload: {
        product_id: seedIds.licenseProduct,
        entitlement_id: seedIds.entitlement,
        hardware_fingerprint: "device-one"
      }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/assets/licenses/activate",
      headers: authHeader(assetManager.token),
      payload: {
        product_id: seedIds.licenseProduct,
        entitlement_id: seedIds.entitlement,
        hardware_fingerprint: "device-two"
      }
    });
    expect(second.statusCode).toBe(400);

    await app.inject({
      method: "POST",
      url: "/api/v1/assets/licenses/revoke",
      headers: authHeader(assetManager.token),
      payload: { hardware_fingerprint: "device-two" }
    });
    const compromised = await app.inject({
      method: "POST",
      url: "/api/v1/assets/licenses/activate",
      headers: authHeader(assetManager.token),
      payload: {
        product_id: seedIds.licenseProduct,
        entitlement_id: seedIds.entitlement,
        hardware_fingerprint: "device-two"
      }
    });
    expect(compromised.statusCode).toBe(400);
  });

  it("supports asset requests, acknowledgement, maintenance, vendors, and recovery queue", async () => {
    const employee = await loginAs(app, "E1");
    const assetManager = await loginAs(app, "AST");

    const createRequest = await app.inject({
      method: "POST",
      url: "/api/v1/assets/requests",
      headers: authHeader(employee.token),
      payload: {
        request_type: "new",
        asset_type: "Laptop",
        reason: "New project onboarding",
        priority: "high",
        needed_by: "2026-06-01",
        preferred_specs: { memory: "32GB" }
      }
    });
    expect(createRequest.statusCode).toBe(200);
    expect(createRequest.json().request).toMatchObject({
      requester_user_id: seedIds.employee1,
      asset_type: "Laptop",
      status: "pending",
      version: 1
    });

    const mine = await app.inject({
      method: "GET",
      url: "/api/v1/assets/requests/my?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().total).toBeGreaterThanOrEqual(1);

    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/assets/requests/queue?page=1&page_size=10",
      headers: authHeader(assetManager.token)
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().queue_counts.pending).toBeGreaterThanOrEqual(1);

    const decision = await app.inject({
      method: "POST",
      url: `/api/v1/assets/requests/${createRequest.json().request.id}/decision`,
      headers: authHeader(assetManager.token),
      payload: {
        decision: "approved",
        remarks: "Approved by IT",
        expected_version: createRequest.json().request.version
      }
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().request).toMatchObject({ status: "approved", version: 2 });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/assets?page=1&page_size=10",
      headers: authHeader(assetManager.token)
    });
    const asset = list.json().items[0];
    const assign = await app.inject({
      method: "POST",
      url: `/api/v1/assets/${asset.id}/assign`,
      headers: authHeader(assetManager.token),
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version }
    });
    expect(assign.statusCode).toBe(200);

    const acknowledge = await app.inject({
      method: "POST",
      url: `/api/v1/assets/${asset.id}/acknowledgements`,
      headers: authHeader(employee.token),
      payload: { acknowledgement_type: "received", expected_version: assign.json().version }
    });
    expect(acknowledge.statusCode).toBe(200);
    expect(acknowledge.json().acknowledgement).toMatchObject({
      asset_id: asset.id,
      employee_user_id: seedIds.employee1,
      status: "acknowledged"
    });

    const vendors = await app.inject({
      method: "GET",
      url: "/api/v1/assets/vendors?page=1&page_size=10",
      headers: authHeader(assetManager.token)
    });
    expect(vendors.statusCode).toBe(200);
    expect(vendors.json().items[0]).toMatchObject({ name: "Lenovo India", status: "active" });

    await app.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: authHeader(assetManager.token),
      payload: { employee_user_id: seedIds.employee1 }
    });
    const recoveryQueue = await app.inject({
      method: "GET",
      url: "/api/v1/assets/recovery-queue?page=1&page_size=10",
      headers: authHeader(assetManager.token)
    });
    expect(recoveryQueue.statusCode).toBe(200);
    expect(recoveryQueue.json().totals.open).toBeGreaterThanOrEqual(1);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}`,
      headers: authHeader(assetManager.token)
    });
    const maintenance = await app.inject({
      method: "POST",
      url: `/api/v1/assets/${asset.id}/maintenance`,
      headers: authHeader(assetManager.token),
      payload: {
        maintenance_type: "repair",
        vendor_id: vendors.json().items[0].id,
        cost: "1200.00",
        started_on: "2026-05-23",
        status: "in_progress",
        notes: "Keyboard replacement",
        expected_version: detail.json().version
      }
    });
    expect(maintenance.statusCode).toBe(200);
    expect(maintenance.json().maintenance).toMatchObject({
      asset_id: asset.id,
      maintenance_type: "repair",
      vendor_name: "Lenovo India"
    });

    const maintenanceList = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/maintenance?page=1&page_size=10`,
      headers: authHeader(assetManager.token)
    });
    expect(maintenanceList.statusCode).toBe(200);
    expect(maintenanceList.json().total).toBe(1);
  });
});
