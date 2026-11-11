import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest, setApiAccessToken } from "@/shared/api";
import { expensesApi } from "./api";

function tokenFor(actor: string): string {
  return `header.${btoa(JSON.stringify({ sub: actor }))}.signature`;
}

describe("expense Finance API adapter", () => {
  beforeEach(() => {
    vi.mocked(apiRequest)
      .mockReset()
      .mockResolvedValue({ id: "ticket-a", status: "ok", version: 2 });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    window.sessionStorage.clear();
    setApiAccessToken(tokenFor("finance-a"));
  });

  it.each([
    [
      "approve",
      { expected_version: 1, decision: "verify" },
      "/api/v1/expenses/ticket-a/finance/approve",
    ],
    [
      "payment",
      { expected_version: 2, amount: "100.00" },
      "/api/v1/expenses/ticket-a/finance/payment",
    ],
    [
      "settlement",
      { expected_version: 3, actual_amount: "100.00" },
      "/api/v1/expenses/ticket-a/settlement",
    ],
  ])("wires the %s command route, body, and idempotency header", async (label, body, path) => {
    if (label === "approve") await expensesApi.financeApprove("ticket-a", body);
    else if (label === "payment") await expensesApi.recordPayment("ticket-a", body);
    else await expensesApi.settle("ticket-a", body);
    expect(apiRequest).toHaveBeenCalledOnce();
    const [actualPath, options] = vi.mocked(apiRequest).mock.calls[0] ?? [];
    expect(actualPath).toBe(path);
    expect(options).toMatchObject({ method: "POST" });
    expect(options?.body).toEqual(body);
    expect(options?.headers).toEqual({
      "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
  });

  it("keeps the same adapter key after a transport failure and rotates after success", async () => {
    const keys: string[] = [];
    vi.mocked(apiRequest).mockImplementation(async (_path, options) => {
      keys.push(new Headers(options?.headers).get("Idempotency-Key") ?? "");
      if (keys.length === 1) throw new Error("response lost");
      return { id: "ticket-a", status: "Finance Approved", version: 2 };
    });
    const input = { expected_version: 1, decision: "verify" };
    await expect(expensesApi.financeApprove("ticket-a", input)).rejects.toThrow("response lost");
    await expect(expensesApi.financeApprove("ticket-a", input)).resolves.toMatchObject({
      version: 2,
    });
    await expect(expensesApi.financeApprove("ticket-a", input)).resolves.toMatchObject({
      version: 2,
    });
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
