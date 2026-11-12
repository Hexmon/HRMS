import { createHash, randomUUID } from "node:crypto";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it } from "vitest";
import { R2ObjectStorage } from "./object-storage.js";

const endpoint = process.env.R2_INTEGRATION_ENDPOINT;
const bucket = process.env.R2_INTEGRATION_BUCKET ?? "hrms-private-integration";
const accessKeyId = process.env.R2_INTEGRATION_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_INTEGRATION_SECRET_ACCESS_KEY ?? "";

const suite = describe.runIf(Boolean(endpoint && accessKeyId && secretAccessKey));

suite("R2 adapter against disposable S3-compatible storage", () => {
  const options = {
    accountId: "0123456789abcdef0123456789abcdef",
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    requestTimeoutMs: 2_000,
    forcePathStyle: true,
  };

  beforeAll(async () => {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const name = error && typeof error === "object" ? (error as { name?: string }).name : undefined;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw error;
    } finally {
      client.destroy();
    }
  });

  it("persists exact bytes across adapter instances and deletes consistently", async () => {
    const first = new R2ObjectStorage(options);
    const second = new R2ObjectStorage(options);
    await first.ensureReady();
    await second.ensureReady();
    const key = `${randomUUID()}/${randomUUID()}.bin`;
    const body = Buffer.from(`private-r2-${randomUUID()}`);
    const expectedHash = createHash("sha256").update(body).digest("hex");

    await expect(first.putObject(key, body, { "content-type": "application/octet-stream" }))
      .resolves.toMatchObject({ size: body.length });
    await expect(second.statObject(key)).resolves.toEqual({ size: body.length });
    const downloaded = await second.getObject(key);
    expect(downloaded?.contentType).toBe("application/octet-stream");
    expect(createHash("sha256").update(downloaded!.body).digest("hex")).toBe(expectedHash);

    await first.removeObject(key);
    await expect(second.getObject(key)).resolves.toBeNull();
    await expect(second.statObject(key)).resolves.toBeNull();
    await expect(second.removeObject(key)).resolves.toBeUndefined();
  });
});
