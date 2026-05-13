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
});
