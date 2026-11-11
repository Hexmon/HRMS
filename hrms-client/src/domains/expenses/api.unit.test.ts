import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest, setApiAccessToken } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody } from "@/shared/api";
import { expensesApi } from "./api";

function tokenFor(actor: string): string {
  return `header.${btoa(JSON.stringify({ sub: actor }))}.signature`;
}

describe("expense command API adapter", () => {
  beforeEach(() => {
    vi.mocked(apiRequest)
      .mockReset()
      .mockResolvedValue({ id: "ticket-a", status: "ok", version: 2 });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    window.sessionStorage.clear();
    setApiAccessToken(tokenFor("finance-a"));
  });

  it.each([
    ["create", { task_title: "Travel" }, "/api/v1/expenses"],
    ["submit", { expected_version: 1 }, "/api/v1/expenses/ticket-a/submit"],
    [
      "withdraw",
      { expected_version: 1, remarks: "Cancelled" },
      "/api/v1/expenses/ticket-a/withdraw",
    ],
    [
      "clarification",
      { expected_version: 1, message: "Receipt attached" },
      "/api/v1/expenses/ticket-a/clarifications",
    ],
    [
      "manager",
      { expected_version: 1, decision: "approve" },
      "/api/v1/expenses/ticket-a/manager/verify",
    ],
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
    ["bills", { expected_version: 4 }, "/api/v1/expenses/ticket-a/bills"],
  ])("wires the %s command route, body, and idempotency header", async (label, body, path) => {
    const recordBody = body as ApiRecord;
    const versionBody = body as ExpectedVersionBody;
    if (label === "create") await expensesApi.create(recordBody);
    else if (label === "submit") await expensesApi.submit("ticket-a", versionBody);
    else if (label === "withdraw") await expensesApi.withdraw("ticket-a", versionBody);
    else if (label === "clarification") await expensesApi.addClarification("ticket-a", recordBody);
    else if (label === "manager") await expensesApi.managerVerify("ticket-a", versionBody);
    else if (label === "bills") await expensesApi.submitBills("ticket-a", recordBody);
    else if (label === "approve") await expensesApi.financeApprove("ticket-a", versionBody);
    else if (label === "payment") await expensesApi.recordPayment("ticket-a", versionBody);
    else await expensesApi.settle("ticket-a", versionBody);
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
