import { describe, expect, it } from "vitest";
import { createMediaIdempotencyKey } from "./media-command";

describe("media command idempotency key", () => {
  it("is stable for a lost-response retry and changes with content or parent version", async () => {
    const base = {
      operation: "replace_profile_photo" as const,
      parentId: "employee-1",
      expectedVersion: 4,
      expectedPointerDocumentId: null,
      file: new Blob(["same-image"], { type: "image/jpeg" }),
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    };

    const first = await createMediaIdempotencyKey(base);
    expect(await createMediaIdempotencyKey({ ...base, file: new Blob(["same-image"]) })).toBe(
      first,
    );
    expect(
      await createMediaIdempotencyKey({ ...base, file: new Blob(["changed-image"]) }),
    ).not.toBe(first);
    expect(await createMediaIdempotencyKey({ ...base, expectedVersion: 5 })).not.toBe(first);
    expect(await createMediaIdempotencyKey({ ...base, fileName: "renamed.jpg" })).not.toBe(first);
    expect(await createMediaIdempotencyKey({ ...base, mimeType: "image/png" })).not.toBe(first);
    expect(first).toMatch(/^media-[0-9a-f]{64}$/u);
  });
});
