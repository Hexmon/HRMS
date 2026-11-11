import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setApiAccessToken } from "@/shared/api";
import { withExpenseCommandKey } from "./command-key";

function tokenFor(actor: string): string {
  return `header.${btoa(JSON.stringify({ sub: actor }))}.signature`;
}

describe("expense Finance intent keys", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    window.sessionStorage.clear();
    setApiAccessToken(tokenFor("actor-a"));
  });

  it("retains one key through an uncertain response and refresh retry, then rotates for a new action", async () => {
    const seen: string[] = [];
    const input = { expected_version: 2, amount: "100.00" };
    await expect(
      withExpenseCommandKey("ticket-a", "finance.payment", input, async (key) => {
        seen.push(key);
        throw new Error("response lost after commit");
      }),
    ).rejects.toThrow("response lost");
    expect(window.sessionStorage.length).toBe(2); // access token plus pending intent
    await withExpenseCommandKey("ticket-a", "finance.payment", input, async (key) => {
      seen.push(key);
      return { status: "Payment Released" };
    });
    expect(seen[1]).toBe(seen[0]);
    expect(window.sessionStorage.length).toBe(1);
    await withExpenseCommandKey("ticket-a", "finance.payment", input, async (key) => {
      seen.push(key);
      return { status: "Payment Released" };
    });
    expect(seen[2]).not.toBe(seen[0]);
    await withExpenseCommandKey(
      "ticket-a",
      "finance.payment",
      { ...input, expected_version: 3 },
      async (key) => {
        seen.push(key);
        return { status: "Payment Released" };
      },
    );
    expect(seen[3]).not.toBe(seen[2]);
  });

  it("separates actors and changed payloads", async () => {
    const seen: string[] = [];
    const pending = async (key: string): Promise<never> => {
      seen.push(key);
      throw new Error("offline");
    };
    await expect(
      withExpenseCommandKey("ticket-a", "settlement", { actual_amount: "10.00" }, pending),
    ).rejects.toThrow();
    await expect(
      withExpenseCommandKey("ticket-a", "settlement", { actual_amount: "11.00" }, pending),
    ).rejects.toThrow();
    setApiAccessToken(tokenFor("actor-b"));
    await expect(
      withExpenseCommandKey("ticket-a", "settlement", { actual_amount: "10.00" }, pending),
    ).rejects.toThrow();
    expect(new Set(seen).size).toBe(3);
  });

  it("shares one pending key across concurrent identical submissions", async () => {
    const seen: string[] = [];
    const release: Array<() => void> = [];
    const send = (key: string) =>
      new Promise<string>((resolve) => {
        seen.push(key);
        release.push(() => resolve(key));
      });
    const input = { expected_version: 2, decision: "verify" };
    const first = withExpenseCommandKey("ticket-a", "finance.approve", input, send);
    const second = withExpenseCommandKey("ticket-a", "finance.approve", input, send);
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toBe(seen[0]);
    release.forEach((resolve) => resolve());
    await expect(Promise.all([first, second])).resolves.toEqual([seen[0], seen[0]]);
  });

  it("fails closed for missing identity, crypto, or writable session storage", async () => {
    setApiAccessToken(null);
    await expect(
      withExpenseCommandKey("ticket-a", "settlement", {}, async () => "sent"),
    ).rejects.toThrow("Sign in again");

    setApiAccessToken(tokenFor("actor-a"));
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    await expect(
      withExpenseCommandKey("ticket-a", "settlement", {}, async () => "sent"),
    ).rejects.toThrow("Secure retry tracking is unavailable");

    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    await expect(
      withExpenseCommandKey("ticket-a", "settlement", {}, async () => "sent"),
    ).rejects.toThrow("Secure retry tracking is unavailable");
    getItem.mockRestore();
  });

  it.each([
    ["malformed", "not-a-token"],
    ["missing sub", `header.${btoa(JSON.stringify({ role: "Finance" }))}.signature`],
    ["non-string sub", `header.${btoa(JSON.stringify({ sub: 42 }))}.signature`],
  ])("fails closed for a %s access token", async (_label, token) => {
    setApiAccessToken(token);
    await expect(
      withExpenseCommandKey("ticket-a", "finance.approve", {}, async () => "sent"),
    ).rejects.toThrow("Sign in again");
  });

  it("fails closed when either WebCrypto primitive is missing", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: webcrypto.randomUUID.bind(webcrypto) },
    });
    await expect(
      withExpenseCommandKey("ticket-a", "finance.approve", {}, async () => "sent"),
    ).rejects.toThrow("Secure retry tracking is unavailable");

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { subtle: webcrypto.subtle },
    });
    await expect(
      withExpenseCommandKey("ticket-a", "finance.approve", {}, async () => "sent"),
    ).rejects.toThrow("Secure retry tracking is unavailable");
  });

  it("reuses the pending command key after an actual module reload", async () => {
    vi.resetModules();
    const firstModule = await import("./command-key");
    let firstKey = "";
    await expect(
      firstModule.withExpenseCommandKey(
        "ticket-a",
        "finance.payment",
        { expected_version: 2 },
        async (key) => {
          firstKey = key;
          throw new Error("response lost");
        },
      ),
    ).rejects.toThrow("response lost");

    vi.resetModules();
    const reloadedModule = await import("./command-key");
    let reloadedKey = "";
    await reloadedModule.withExpenseCommandKey(
      "ticket-a",
      "finance.payment",
      { expected_version: 2 },
      async (key) => {
        reloadedKey = key;
        return "sent";
      },
    );
    expect(reloadedKey).toBe(firstKey);
  });

  it("does not turn a confirmed server success into failure when cleanup is blocked", async () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage cleanup blocked");
    });
    await expect(
      withExpenseCommandKey("ticket-a", "finance.payment", { expected_version: 2 }, async () => ({
        ok: true,
      })),
    ).resolves.toEqual({ ok: true });
    removeItem.mockRestore();
  });
});
