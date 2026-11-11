import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
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
});
