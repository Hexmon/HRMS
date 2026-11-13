import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBlobRequest } from "./client";
import { API_UNAUTHORIZED_EVENT, setApiAccessToken } from "./session";

describe("authenticated private byte requests", () => {
  beforeEach(() => {
    setApiAccessToken("access-token");
  });

  afterEach(() => {
    setApiAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("fetches exact bytes with bearer and cookie credentials", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("private-bytes", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await apiBlobRequest("/api/v1/documents/doc-1/content", {
      query: { version: 1 },
    });
    expect(await blob.text()).toBe("private-bytes");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request = {}] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/documents/doc-1/content?version=1");
    expect(request.credentials).toBe("include");
    expect(new Headers(request.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("supports an explicitly unauthenticated byte request without a bearer header", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("public", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await apiBlobRequest("/public", { auth: false, method: "GET" });
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has("authorization")).toBe(false);
  });

  it("normalizes network failures without leaking the underlying error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider endpoint secret");
      }),
    );
    await expect(apiBlobRequest("/api/v1/documents/doc-1/content")).rejects.toMatchObject({
      name: "ApiUnavailableError",
      message:
        "We could not reach the HRMS server. Please check your internet connection and try again.",
    });
  });

  it("notifies the session boundary on an authenticated 401", async () => {
    const listener = vi.fn();
    window.addEventListener(API_UNAUTHORIZED_EVENT, listener);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(apiBlobRequest("/api/v1/documents/doc-1/content")).rejects.toMatchObject({
      status: 401,
    });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(API_UNAUTHORIZED_EVENT, listener);
  });

  it("preserves a bounded retry-after value on rate limiting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "RATE_LIMITED" }), {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "0" },
          }),
      ),
    );
    await expect(apiBlobRequest("/api/v1/documents/doc-1/content")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 0,
    });
  });
});
