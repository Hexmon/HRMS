import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from "@/shared/api";
import { notificationsApi } from "./api";

describe("notification read-all continuation", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("repeats bounded server batches with one fixed cutoff and returns the cumulative result", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ updated_count: 1000, unread_count: 1, has_more: true })
      .mockResolvedValueOnce({ updated_count: 1, unread_count: 0, has_more: false });

    await expect(notificationsApi.markAllRead({ type: "approval" })).resolves.toMatchObject({
      updated_count: 1001,
      unread_count: 0,
      has_more: false,
    });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    const firstBody = vi.mocked(apiRequest).mock.calls[0]?.[1]?.body;
    const secondBody = vi.mocked(apiRequest).mock.calls[1]?.[1]?.body;
    expect(firstBody).toEqual(secondBody);
    expect(firstBody).toMatchObject({ type: "approval", before: expect.any(String) });
  });

  it("fails closed if a continuation claims more work without making progress", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      updated_count: 0,
      unread_count: 1,
      has_more: true,
    });
    await expect(notificationsApi.markAllRead({})).rejects.toThrow("made no progress");
    expect(apiRequest).toHaveBeenCalledOnce();
  });

  it("stops after the bounded 100-batch continuation budget", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      updated_count: 1,
      unread_count: 1,
      has_more: true,
    });
    await expect(notificationsApi.markAllRead({ type: "approval" })).rejects.toThrow(
      "Too many notifications",
    );
    expect(apiRequest).toHaveBeenCalledTimes(100);
    const cutoffs = vi
      .mocked(apiRequest)
      .mock.calls.map((call) => (call[1]?.body as { before?: string } | undefined)?.before);
    expect(new Set(cutoffs).size).toBe(1);
  });

  it("surfaces a later batch failure after an earlier batch made partial progress", async () => {
    const failure = new Error("network disconnected");
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ updated_count: 1000, unread_count: 1, has_more: true })
      .mockRejectedValueOnce(failure);

    await expect(notificationsApi.markAllRead({})).rejects.toBe(failure);
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
