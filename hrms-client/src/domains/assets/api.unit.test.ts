import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", () => ({
  apiRequest,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(input: { status: number; message: string }) {
      super(input.message);
      this.status = input.status;
    }
  },
}));

describe("asset command intent keys", () => {
  beforeEach(() => {
    vi.resetModules();
    apiRequest.mockReset();
    sessionStorage.clear();
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  });

  it("reuses a key after a lost response and refresh, then issues a fresh key for another confirmed submit", async () => {
    apiRequest.mockRejectedValueOnce(new Error("connection lost after commit"));
    const first = (await import("./api")).assetsApi;
    const body = { asset_code: "S25-A", asset_type: "Laptop", name: "Test device" };
    await expect(first.create(body)).rejects.toThrow(/connection lost/u);
    const lostKey = apiRequest.mock.calls[0]?.[1]?.headers?.["Idempotency-Key"];
    expect(lostKey).toMatch(/^[0-9a-f-]{36}$/u);

    vi.resetModules();
    apiRequest.mockResolvedValue({ id: "asset-a" });
    const afterRefresh = (await import("./api")).assetsApi;
    await afterRefresh.create(body);
    expect(apiRequest.mock.calls[1]?.[1]?.headers?.["Idempotency-Key"]).toBe(lostKey);
    await afterRefresh.create(body);
    expect(apiRequest.mock.calls[2]?.[1]?.headers?.["Idempotency-Key"]).not.toBe(lostKey);
  });

  it("uses one key for concurrent duplicate submits", async () => {
    const waiting: Array<(value: unknown) => void> = [];
    apiRequest.mockImplementation(() => new Promise((resolve) => waiting.push(resolve)));
    const api = (await import("./api")).assetsApi;
    const body = { reason: "Need device", request_type: "new", asset_type: "Laptop" };
    const first = api.createRequest(body);
    const second = api.createRequest(body);
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    expect(apiRequest.mock.calls[0]?.[1]?.headers?.["Idempotency-Key"]).toBe(
      apiRequest.mock.calls[1]?.[1]?.headers?.["Idempotency-Key"],
    );
    waiting.forEach((resolve) => resolve({ id: "same" }));
    await Promise.all([first, second]);
  });

  it("routes every asset read and command through the intended API contract", async () => {
    apiRequest.mockResolvedValue({ items: [] });
    const { assetsApi } = await import("./api");
    await assetsApi.create({ asset_code: "A-1" });
    await assetsApi.list({ page: 2 });
    await assetsApi.myAssets();
    await assetsApi.assignees("A&B");
    await assetsApi.get("asset-one");
    await assetsApi.assign("asset-a", { expected_version: 1 });
    await assetsApi.returnAsset("asset-a", { expected_version: 2 });
    await assetsApi.scan("qr/value");
    await assetsApi.activateLicense({ product_id: "product-a" });
    await assetsApi.validateLicense({ product_id: "product-a" });
    await assetsApi.revokeLicense({ activation_id: "activation-a" });
    await assetsApi.employeeTerminatedEvent({ employee_user_id: "employee-a" });
    await assetsApi.createRequest({ request_type: "new" });
    await assetsApi.myRequests();
    await assetsApi.requestQueue({ page_size: 25 });
    await assetsApi.decideRequest("request-a", { decision: "approved" });
    await assetsApi.cancelRequest("request-a", { expected_version: 1 });
    await assetsApi.acknowledge("asset-a", {
      acknowledgement_type: "received",
      expected_version: 3,
    });
    await assetsApi.listMaintenance("asset-a");
    await assetsApi.createMaintenance("asset-a", { maintenance_type: "inspection" });
    await assetsApi.vendors();
    await assetsApi.warrantyAlerts({ page: 1 });
    await assetsApi.createVendor({ name: "Vendor A" });
    await assetsApi.updateVendor("vendor-a", { name: "Vendor B" });
    await assetsApi.recoveryQueue();
    await assetsApi.settleRecovery("ticket-a", { settlement_status: "recovered" });

    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/assets/",
      "/api/v1/assets/",
      "/api/v1/assets/my",
      "/api/v1/assets/assignees",
      "/api/v1/assets/asset-one",
      "/api/v1/assets/asset-a/assign",
      "/api/v1/assets/asset-a/return",
      "/api/v1/assets/scan/qr%2Fvalue",
      "/api/v1/assets/licenses/activate",
      "/api/v1/assets/licenses/validate",
      "/api/v1/assets/licenses/revoke",
      "/api/v1/assets/events/employee-terminated",
      "/api/v1/assets/requests",
      "/api/v1/assets/requests/my",
      "/api/v1/assets/requests/queue",
      "/api/v1/assets/requests/request-a/decision",
      "/api/v1/assets/requests/request-a/cancel",
      "/api/v1/assets/asset-a/acknowledgements",
      "/api/v1/assets/asset-a/maintenance",
      "/api/v1/assets/asset-a/maintenance",
      "/api/v1/assets/vendors",
      "/api/v1/assets/warranty-alerts",
      "/api/v1/assets/vendors",
      "/api/v1/assets/vendors/vendor-a",
      "/api/v1/assets/recovery-queue",
      "/api/v1/assets/recovery-queue/ticket-a/settlement",
    ]);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/assets/scan/qr%2Fvalue", {
      method: "POST",
      auth: false,
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/assets/licenses/validate", {
      method: "POST",
      body: { product_id: "product-a" },
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/assets/vendors/vendor-a", {
      method: "PATCH",
      body: { name: "Vendor B" },
      headers: { "Idempotency-Key": expect.any(String) },
    });
  });

  it("drops a terminal client-error intent but retains retryable conflict and rate-limit intents", async () => {
    const { ApiError } = await import("@/shared/api");
    const api = (await import("./api")).assetsApi;
    const body = { asset_code: "S25-ERROR", asset_type: "Laptop", name: "Error device" };

    apiRequest.mockRejectedValueOnce(
      new ApiError({ status: 400, code: "INVALID_INPUT", message: "invalid" }),
    );
    await expect(api.create(body)).rejects.toThrow("invalid");
    const terminalKey = apiRequest.mock.calls.at(-1)?.[1]?.headers?.["Idempotency-Key"];
    apiRequest.mockResolvedValueOnce({ id: "created" });
    await api.create(body);
    expect(apiRequest.mock.calls.at(-1)?.[1]?.headers?.["Idempotency-Key"]).not.toBe(terminalKey);

    for (const status of [409, 429, 500]) {
      apiRequest.mockRejectedValueOnce(
        new ApiError({ status, code: "RETRYABLE", message: `retry ${status}` }),
      );
      await expect(api.create(body)).rejects.toThrow(`retry ${status}`);
      const retryKey = apiRequest.mock.calls.at(-1)?.[1]?.headers?.["Idempotency-Key"];
      apiRequest.mockResolvedValueOnce({ id: `created-${status}` });
      await api.create(body);
      expect(apiRequest.mock.calls.at(-1)?.[1]?.headers?.["Idempotency-Key"]).toBe(retryKey);
    }
  });
});
