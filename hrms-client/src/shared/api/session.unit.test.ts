import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("API session actor scope", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores, replaces and clears a valid company-bound actor scope", async () => {
    window.sessionStorage.setItem(
      "hawkaii_api_actor_scope",
      JSON.stringify({ userId: "user-a", companyId: "company-a" }),
    );
    const session = await import("./session");
    expect(session.getApiActorScope()).toEqual({ userId: "user-a", companyId: "company-a" });

    session.setApiActorScope("user-b", "company-b");
    expect(session.getApiActorScope()).toEqual({ userId: "user-b", companyId: "company-b" });
    expect(JSON.parse(window.sessionStorage.getItem("hawkaii_api_actor_scope")!)).toEqual({
      userId: "user-b",
      companyId: "company-b",
    });

    session.setApiActorScope("", "company-b");
    expect(session.getApiActorScope()).toBeNull();
    session.clearApiActorScope();
    expect(window.sessionStorage.getItem("hawkaii_api_actor_scope")).toBeNull();
  });

  it.each([
    ["missing", null],
    ["malformed", "{"],
    ["empty user", JSON.stringify({ userId: "", companyId: "company-a" })],
    ["empty company", JSON.stringify({ userId: "user-a", companyId: "" })],
  ])("fails closed for %s stored scope", async (_label, stored) => {
    if (stored !== null) window.sessionStorage.setItem("hawkaii_api_actor_scope", stored);
    const session = await import("./session");
    expect(session.getApiActorScope()).toBeNull();
  });

  it("does not let blocked browser storage break actor-scope changes", async () => {
    const session = await import("./session");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    expect(() => session.setApiActorScope("user-a", "company-a")).not.toThrow();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    expect(() => session.clearApiActorScope()).not.toThrow();
  });

  it("dispatches unauthorized notifications and removes subscribed listeners", async () => {
    const session = await import("./session");
    const listener = vi.fn();
    const unsubscribe = session.onApiUnauthorized(listener);
    session.notifyApiUnauthorized();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    session.notifyApiUnauthorized();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fails closed without browser storage during server-side rendering", async () => {
    vi.stubGlobal("window", undefined);
    vi.resetModules();
    const session = await import("./session");
    expect(session.getApiActorScope()).toBeNull();
    expect(() => session.setApiActorScope("server-user", "server-company")).not.toThrow();
    expect(session.getApiActorScope()).toEqual({
      userId: "server-user",
      companyId: "server-company",
    });
  });
});
