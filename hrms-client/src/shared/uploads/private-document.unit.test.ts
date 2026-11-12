import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiConfig } from "@/shared/api/config";
import { privateDocumentApiPath, usePrivateDocumentUrl } from "./private-document";

const apiBlobRequest = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiBlobRequest }));

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const firstPath = `/api/v1/documents/${firstId}/content`;
const secondPath = `/api/v1/documents/${secondId}/content`;

describe("private document URL normalization", () => {
  it("accepts only exact UUID content paths on the configured API origin", () => {
    const origin = new URL(apiConfig.baseUrl).origin;
    expect(privateDocumentApiPath(firstPath)).toBe(firstPath);
    expect(privateDocumentApiPath(`${origin}${firstPath}`)).toBe(firstPath);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["foreign HTTPS", `https://attacker.example${firstPath}`],
    ["foreign HTTP", `http://attacker.example${firstPath}`],
    ["former Cloudinary URL", "https://res.cloudinary.com/demo/image/upload/private.jpg"],
    ["data URL", "data:image/png;base64,AAAA"],
    ["externally supplied blob URL", "blob:https://example.test/untrusted"],
    ["javascript URL", "javascript:alert(1)"],
    ["file URL", "file:///tmp/private.jpg"],
    ["invalid UUID", "/api/v1/documents/not-a-uuid/content"],
    ["extra path", `${firstPath}/preview`],
    ["query", `${firstPath}?download=1`],
    ["fragment", `${firstPath}#preview`],
    ["protocol relative", `//${new URL(apiConfig.baseUrl).host}${firstPath}`],
    ["path-relative", firstPath.slice(1)],
  ])("rejects %s", (_case, value) => {
    expect(privateDocumentApiPath(value)).toBeNull();
  });
});

describe("usePrivateDocumentUrl", () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    apiBlobRequest.mockReset();
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    cleanup();
  });

  it("fetches a canonical path with authentication and renders only its generated blob URL", async () => {
    const blob = new Blob(["private-image"], { type: "image/png" });
    createObjectURL.mockReturnValue("blob:authenticated-private-image");
    apiBlobRequest.mockResolvedValue(blob);

    const view = render(createElement(PrivateImageProbe, { source: firstPath }));

    await waitFor(() => {
      expect(view.getByRole("img")).toHaveAttribute("src", "blob:authenticated-private-image");
    });
    expect(apiBlobRequest).toHaveBeenCalledTimes(1);
    expect(apiBlobRequest).toHaveBeenCalledWith(firstPath);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(blob);

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:authenticated-private-image");
  });

  it.each([
    `https://attacker.example${firstPath}`,
    "https://res.cloudinary.com/demo/image/upload/private.jpg",
    "data:image/png;base64,AAAA",
    "blob:https://example.test/untrusted",
    "javascript:alert(1)",
    "file:///tmp/private.jpg",
    "/api/v1/documents/not-a-uuid/content",
    `${firstPath}?download=1`,
    `${firstPath}#preview`,
  ])("renders and requests nothing for rejected source %s", async (source) => {
    const view = render(createElement(PrivateImageProbe, { source }));
    await act(async () => Promise.resolve());
    expect(view.queryByRole("img")).toBeNull();
    expect(apiBlobRequest).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it.each([new Error("401 unauthorized"), new Error("network unavailable")])(
    "keeps media hidden when the authenticated request fails: %s",
    async (error) => {
      apiBlobRequest.mockRejectedValue(error);
      const { result } = renderHook(({ source }) => usePrivateDocumentUrl(source), {
        initialProps: { source: firstPath as string | null },
      });
      await waitFor(() => expect(apiBlobRequest).toHaveBeenCalledTimes(1));
      await act(async () => Promise.resolve());
      expect(result.current).toBeUndefined();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalled();
    },
  );

  it("ignores an old source completion and revokes the accepted source exactly once", async () => {
    const first = deferred<Blob>();
    const second = deferred<Blob>();
    apiBlobRequest.mockImplementation((path: string) =>
      path === firstPath ? first.promise : second.promise,
    );
    createObjectURL.mockReturnValue("blob:current-private-image");
    const { result, rerender, unmount } = renderHook(
      ({ source }) => usePrivateDocumentUrl(source),
      { initialProps: { source: firstPath } },
    );

    await waitFor(() => expect(apiBlobRequest).toHaveBeenCalledWith(firstPath));
    rerender({ source: secondPath });
    await waitFor(() => expect(apiBlobRequest).toHaveBeenCalledWith(secondPath));
    await act(async () => first.resolve(new Blob(["stale"])));
    expect(result.current).toBeUndefined();
    expect(createObjectURL).not.toHaveBeenCalled();

    await act(async () => second.resolve(new Blob(["current"])));
    await waitFor(() => expect(result.current).toBe("blob:current-private-image"));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:current-private-image");
  });

  it("does not create or revoke an object URL when a pending request finishes after unmount", async () => {
    const pending = deferred<Blob>();
    apiBlobRequest.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePrivateDocumentUrl(firstPath));
    await waitFor(() => expect(apiBlobRequest).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => pending.resolve(new Blob(["late"])));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

function PrivateImageProbe({ source }: { source: string }) {
  const url = usePrivateDocumentUrl(source);
  return url ? createElement("img", { src: url, alt: "Private document" }) : null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
