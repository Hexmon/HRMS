import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest, setApiAccessToken } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody } from "@/shared/api";
import { adminApi } from "@/domains/admin/api";
import { loadManagerBackupsQuery } from "@/domains/admin/queries";
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

  it.each([
    {
      label: "create",
      invoke: () =>
        adminApi.createManagerBackup({
          employee_user_id: "employee-a",
          backup_manager_user_id: "reviewer-a",
          effective_from: "2027-01-01",
          effective_to: "2027-12-31",
        }),
      path: "/api/v1/manager-backups",
      method: "POST",
      body: {
        employee_user_id: "employee-a",
        backup_manager_user_id: "reviewer-a",
        effective_from: "2027-01-01",
        effective_to: "2027-12-31",
      },
      query: undefined,
    },
    {
      label: "revoke",
      invoke: () => adminApi.deleteManagerBackup("mapping-a", 7),
      path: "/api/v1/manager-backups/mapping-a",
      method: "DELETE",
      body: undefined,
      query: { expected_version: 7 },
    },
  ])(
    "wires manager-backup $label with an exact request and generated command key",
    async ({ invoke, path, method, body, query }) => {
      await invoke();
      expect(apiRequest).toHaveBeenCalledOnce();
      const [actualPath, options] = vi.mocked(apiRequest).mock.calls[0] ?? [];
      expect(actualPath).toBe(path);
      expect(options?.method).toBe(method);
      expect(options?.body).toEqual(body);
      expect(options?.query).toEqual(query);
      expect(options?.headers).toEqual({
        "Idempotency-Key": expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        ),
      });
    },
  );

  it.each([
    ["adapter", () => adminApi.listManagerBackups()],
    ["query", () => loadManagerBackupsQuery()],
  ])("loads manager-backup assignment 101 through the %s path", async (_label, invoke) => {
    const assignments = Array.from({ length: 101 }, (_, index) => ({
      id: `mapping-${index + 1}`,
    }));
    vi.mocked(apiRequest).mockImplementation(async (_path, options) => {
      const page = Number(options?.query?.page);
      return {
        items: assignments.slice((page - 1) * 100, page * 100),
        page,
        page_size: 100,
        total: assignments.length,
      };
    });

    await expect(invoke()).resolves.toEqual(assignments);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiRequest).mock.calls.map(([, options]) => options?.query)).toEqual([
      { page: 1, page_size: 100 },
      { page: 2, page_size: 100 },
    ]);
  });

  it("rejects manager-backup totals above the explicit safety bound", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      items: [{ id: "mapping-1" }],
      page: 1,
      page_size: 100,
      total: 10_001,
    });

    await expect(adminApi.listManagerBackups()).rejects.toThrow("10,000 record safety limit");
    expect(apiRequest).toHaveBeenCalledOnce();
  });

  it.each([
    ["changed total", { items: [{ id: "mapping-101" }], page: 2, page_size: 100, total: 102 }],
    ["wrong page", { items: [{ id: "mapping-101" }], page: 1, page_size: 100, total: 101 }],
    ["stopped early", { items: [], page: 2, page_size: 100, total: 101 }],
    ["duplicate item", { items: [{ id: "mapping-1" }], page: 2, page_size: 100, total: 101 }],
  ])("fails visibly when manager-backup pagination is inconsistent: %s", async (_label, second) => {
    const first = Array.from({ length: 100 }, (_, index) => ({ id: `mapping-${index + 1}` }));
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ items: first, page: 1, page_size: 100, total: 101 })
      .mockResolvedValueOnce(second);

    await expect(adminApi.listManagerBackups()).rejects.toThrow(/Manager backup pagination/u);
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: "create",
      invoke: () =>
        adminApi.createManagerBackup({
          employee_user_id: "employee-a",
          backup_manager_user_id: "reviewer-a",
          effective_from: "2027-01-01",
          effective_to: null,
        }),
    },
    {
      label: "revoke",
      invoke: () => adminApi.deleteManagerBackup("mapping-a", 7),
    },
  ])(
    "reuses the manager-backup $label key after failure and rotates it after success",
    async ({ invoke }) => {
      const keys: string[] = [];
      vi.mocked(apiRequest).mockImplementation(async (_path, options) => {
        keys.push(new Headers(options?.headers).get("Idempotency-Key") ?? "");
        if (keys.length === 1) throw new Error("response lost");
        return { id: "mapping-a", status: "active", version: 1 };
      });

      await expect(invoke()).rejects.toThrow("response lost");
      await expect(invoke()).resolves.toMatchObject({ id: "mapping-a" });
      await expect(invoke()).resolves.toMatchObject({ id: "mapping-a" });

      expect(keys[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      expect(keys[1]).toBe(keys[0]);
      expect(keys[2]).not.toBe(keys[1]);
    },
  );

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
