import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { MemoryObjectStorage, ObjectStorageProviderError, R2ObjectStorage } from "./object-storage.js";

const options = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "access-123",
  secretAccessKey: "secret-123",
  bucket: "bucket-123",
  requestTimeoutMs: 500,
};

function missing(name = "NoSuchKey") {
  return Object.assign(new Error("sensitive provider detail"), {
    name,
    $metadata: { httpStatusCode: 404 },
  });
}

describe("private R2 object storage", () => {
  it("writes private bytes and approved metadata without a public URL", async () => {
    const send = vi.fn(async (_command: unknown, _options?: { abortSignal?: AbortSignal }) => ({ ETag: "etag-1" }));
    const storage = new R2ObjectStorage(options, { send });

    const body = Buffer.from("private-data");
    await expect(storage.putObject("opaque/id.txt", body, {
      "content-type": "text/plain",
      "x-hrms-document-id": "doc-1",
      "untrusted-provider-setting": "must-not-leak",
      "bad\nname": "ignored",
    })).resolves.toEqual({ size: body.length, etag: "etag-1" });

    const command = send.mock.calls[0]![0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "bucket-123",
      Key: "opaque/id.txt",
      Body: body,
      ContentLength: body.length,
      ContentType: "text/plain",
      Metadata: { "x-hrms-document-id": "doc-1" },
    });
    expect(await storage.putObject("opaque/second.txt", body)).not.toHaveProperty("url");
  });

  it("returns exact private bytes and content metadata", async () => {
    const send = vi.fn(async (_command: unknown, _options?: { abortSignal?: AbortSignal }) => ({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentLength: 3,
      ContentType: "application/octet-stream",
    }));
    const storage = new R2ObjectStorage(options, { send });

    await expect(storage.getObject("opaque/data.bin")).resolves.toEqual({
      body: Buffer.from([1, 2, 3]),
      contentType: "application/octet-stream",
      size: 3,
    });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
  });

  it("fails closed when a provider body cannot be consumed", async () => {
    const storage = new R2ObjectStorage(options, { send: vi.fn(async () => ({ Body: {} })) });
    await expect(storage.getObject("opaque/data.bin")).rejects.toMatchObject({
      name: "ObjectStorageProviderError",
      code: "unavailable",
    });
  });

  it("fails closed when the provider body length does not match metadata", async () => {
    const storage = new R2ObjectStorage(options, {
      send: vi.fn(async () => ({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
        ContentLength: 3,
      })),
    });
    await expect(storage.getObject("opaque/data.bin")).rejects.toMatchObject({
      code: "unavailable",
      message: "Private object storage returned an incomplete object body.",
    });
  });

  it("destroys and rejects object bodies above the configured cap", async () => {
    const destroy = vi.fn();
    const storage = new R2ObjectStorage({ ...options, maxObjectBytes: 2 }, {
      send: vi.fn(async () => ({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]), destroy },
        ContentLength: 3,
      })),
    });
    await expect(storage.getObject("opaque/data.bin")).rejects.toMatchObject({ code: "unavailable" });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("enforces a deadline even when the command client ignores abort signals", async () => {
    vi.useFakeTimers();
    try {
      const storage = new R2ObjectStorage(options, {
        send: vi.fn(() => new Promise(() => undefined)),
      });
      const pending = storage.ensureReady();
      const expectation = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(501);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("distinguishes missing objects from bucket and provider failures", async () => {
    const objectMissing = new R2ObjectStorage(options, { send: vi.fn(async () => { throw missing(); }) });
    await expect(objectMissing.getObject("opaque/missing.bin")).resolves.toBeNull();
    await expect(objectMissing.statObject("opaque/missing.bin")).resolves.toBeNull();
    await expect(objectMissing.removeObject("opaque/missing.bin")).resolves.toBeUndefined();

    const bucketMissing = new R2ObjectStorage(options, {
      send: vi.fn(async () => { throw missing("NoSuchBucket"); }),
    });
    await expect(bucketMissing.getObject("opaque/missing.bin")).rejects.toMatchObject({
      name: "ObjectStorageProviderError",
      code: "unavailable",
      message: "Private object storage could not read object.",
    });
    await expect(bucketMissing.putObject("opaque/data.bin", Buffer.from("x"))).rejects.toBeInstanceOf(ObjectStorageProviderError);
  });

  it("returns a validated HEAD size and rejects malformed metadata", async () => {
    const send = vi.fn(async (_command: unknown, _options?: { abortSignal?: AbortSignal }) => ({ ContentLength: 42 }));
    const storage = new R2ObjectStorage(options, { send });
    await expect(storage.statObject("opaque/data.bin")).resolves.toEqual({ size: 42 });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);

    const malformed = new R2ObjectStorage(options, { send: vi.fn(async () => ({})) });
    await expect(malformed.statObject("opaque/data.bin")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("uses bounded readiness and delete commands without listing", async () => {
    const send = vi.fn(async (_command: unknown, _options?: { abortSignal?: AbortSignal }) => ({}));
    const storage = new R2ObjectStorage(options, { send });
    await storage.ensureReady();
    await storage.removeObject("opaque/data.bin");
    expect(send.mock.calls[0]![0]).toBeInstanceOf(HeadBucketCommand);
    expect(send.mock.calls[1]![0]).toBeInstanceOf(DeleteObjectCommand);
    for (const call of send.mock.calls) {
      expect(call[1]?.abortSignal).toBeInstanceOf(AbortSignal);
    }
  });

  it("sanitizes provider failures and classifies aborts", async () => {
    const provider = new R2ObjectStorage(options, {
      send: vi.fn(async () => { throw new Error("secret-123 bucket-123 opaque/data.bin"); }),
    });
    await expect(provider.getObject("opaque/data.bin")).rejects.toEqual(expect.objectContaining({
      code: "unavailable",
      message: "Private object storage could not read object.",
    }));
    await expect(provider.getObject("opaque/data.bin")).rejects.not.toThrow(/secret-123|bucket-123|opaque\/data/u);
    await expect(provider.getObject("opaque/data.bin")).rejects.not.toHaveProperty("cause");

    const aborted = new R2ObjectStorage(options, {
      send: vi.fn(async () => { throw Object.assign(new Error("late secret"), { name: "AbortError" }); }),
    });
    await expect(aborted.statObject("opaque/data.bin")).rejects.toMatchObject({
      code: "timeout",
      message: "Private object storage timed out while attempting to inspect object.",
    });
  });

  it("bounds delayed body consumption", async () => {
    vi.useFakeTimers();
    try {
      const storage = new R2ObjectStorage(options, {
        send: vi.fn(async () => ({
          Body: { transformToByteArray: () => new Promise<Uint8Array>(() => undefined) },
          ContentLength: 1,
        })),
      });
      const read = storage.getObject("opaque/data.bin");
      const expectation = expect(read).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(500);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects unsafe keys and placeholder configuration", async () => {
    const storage = new R2ObjectStorage(options, { send: vi.fn(async () => ({})) });
    await expect(storage.putObject("/not-opaque", Buffer.from("x"))).rejects.toThrow("Invalid private object key");
    await expect(storage.getObject("bad\\key")).rejects.toThrow("Invalid private object key");
    expect(() => new R2ObjectStorage({ ...options, accessKeyId: "local-key" })).toThrow("R2_ACCESS_KEY_ID");
    expect(() => new R2ObjectStorage({ ...options, requestTimeoutMs: 61_000 })).toThrow("R2_REQUEST_TIMEOUT_MS");
  });
});

describe("memory object storage parity", () => {
  it("copies buffers, preserves content type and treats delete as idempotent", async () => {
    const storage = new MemoryObjectStorage();
    const source = Buffer.from("original");
    await expect(storage.putObject("opaque/data.txt", source, { "content-type": "text/plain" }))
      .resolves.toEqual({ size: 8 });
    source.fill(0);
    const first = await storage.getObject("opaque/data.txt");
    expect(first).toEqual({ body: Buffer.from("original"), contentType: "text/plain", size: 8 });
    first!.body.fill(0);
    await expect(storage.getObject("opaque/data.txt")).resolves.toMatchObject({ body: Buffer.from("original") });
    await storage.removeObject("opaque/data.txt");
    await storage.removeObject("opaque/data.txt");
    await expect(storage.getObject("opaque/data.txt")).resolves.toBeNull();
  });
});
