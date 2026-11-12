import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiBlobRequest = vi.hoisted(() => vi.fn());
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", () => ({ apiBlobRequest, apiRequest }));

import { documentsApi } from "./api";

describe("private document API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiBlobRequest.mockReset();
    apiRequest.mockReset();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:private-document"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("downloads authenticated bytes before creating a browser-local URL", async () => {
    const blob = new Blob(["private"]);
    apiBlobRequest.mockResolvedValue(blob);

    await expect(documentsApi.createDownloadUrl("doc-1")).resolves.toEqual({
      document_id: "doc-1",
      url: "blob:private-document",
      expires_in_seconds: 60,
    });
    expect(apiBlobRequest).toHaveBeenCalledWith("/api/v1/documents/doc-1/content");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-document");
  });

  it("does not create a URL when the authenticated byte request fails", async () => {
    apiBlobRequest.mockRejectedValue(new Error("denied"));
    await expect(documentsApi.createDownloadUrl("foreign-doc")).rejects.toThrow("denied");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
