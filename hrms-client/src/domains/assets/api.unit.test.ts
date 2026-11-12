import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", () => ({ apiRequest, ApiError: class ApiError extends Error {} }));

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
});
