import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", () => ({ apiRequest }));

import { coreApi } from "./api";

describe("Core profile-photo media commands", () => {
  beforeEach(() => apiRequest.mockReset());

  it("uploads with the exact version, pointer and idempotency headers", async () => {
    const form = new FormData();
    apiRequest.mockResolvedValue({ id: "user-1", version: 5 });
    await coreApi.uploadProfilePhoto("user-1", form, {
      idempotencyKey: "profile-upload-1",
      expectedVersion: 4,
      expectedPointerDocumentId: null,
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/core/users/user-1/profile-photo", {
      method: "POST",
      body: form,
      headers: {
        "Idempotency-Key": "profile-upload-1",
        "X-Expected-Version": "4",
        "X-Expected-Pointer-Document-Id": "none",
      },
    });
  });

  it("removes only the exact current pointer and sends no request body", async () => {
    apiRequest.mockResolvedValue({ id: "user-1", version: 6 });
    await coreApi.deleteProfilePhoto("user-1", {
      idempotencyKey: "profile-remove-1",
      expectedVersion: 5,
      expectedPointerDocumentId: "22222222-2222-4222-8222-222222222222",
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/core/users/user-1/profile-photo", {
      method: "DELETE",
      headers: {
        "Idempotency-Key": "profile-remove-1",
        "X-Expected-Version": "5",
        "X-Expected-Pointer-Document-Id": "22222222-2222-4222-8222-222222222222",
      },
    });
  });

  it("surfaces a denied or stale command without fallback or retry", async () => {
    const denied = new Error("403 denied");
    apiRequest.mockImplementationOnce(async () => {
      throw denied;
    });
    await expect(
      coreApi.uploadProfilePhoto("foreign-user", new FormData(), {
        idempotencyKey: "profile-denied",
        expectedVersion: 1,
      }),
    ).rejects.toBe(denied);
    expect(apiRequest).toHaveBeenCalledOnce();
  });
});
