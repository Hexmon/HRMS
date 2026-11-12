import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", () => ({ apiRequest }));

import { adminApi } from "./api";

describe("Admin company-logo media command", () => {
  beforeEach(() => apiRequest.mockReset());

  it.each([
    { pointer: null, expectedHeader: "none" },
    {
      pointer: "11111111-1111-4111-8111-111111111111",
      expectedHeader: "11111111-1111-4111-8111-111111111111",
    },
  ])(
    "sends the exact durable command headers for pointer $expectedHeader",
    async ({ pointer, expectedHeader }) => {
      const form = new FormData();
      form.append("file", new Blob(["logo"], { type: "image/png" }), "logo.png");
      apiRequest.mockResolvedValue({ document: { id: "doc-1" } });

      await adminApi.uploadCompanyLogo(form, {
        idempotencyKey: "media-command-1",
        expectedVersion: 12,
        expectedPointerDocumentId: pointer,
      });

      expect(apiRequest).toHaveBeenCalledOnce();
      expect(apiRequest).toHaveBeenCalledWith("/api/v1/admin/company-profile/logo", {
        method: "POST",
        body: form,
        headers: {
          "Idempotency-Key": "media-command-1",
          "X-Expected-Version": "12",
          "X-Expected-Pointer-Document-Id": expectedHeader,
        },
      });
    },
  );

  it("propagates a stale command failure without an automatic retry", async () => {
    const stale = new Error("409 stale company logo");
    apiRequest.mockImplementationOnce(async () => {
      throw stale;
    });
    await expect(
      adminApi.uploadCompanyLogo(new FormData(), {
        idempotencyKey: "media-command-stale",
        expectedVersion: 3,
        expectedPointerDocumentId: null,
      }),
    ).rejects.toBe(stale);
    expect(apiRequest).toHaveBeenCalledOnce();
  });
});
