import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { ObjectStorageGetResult, ObjectStoragePort, ObjectStoragePutResult } from "./data-store.js";

export interface R2ObjectStorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
  requestTimeoutMs: number;
  forcePathStyle?: boolean;
  maxObjectBytes?: number;
}

interface ObjectStorageCommandClient {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
}

interface StorageErrorShape {
  name?: unknown;
  $metadata?: { httpStatusCode?: unknown };
}

interface ProviderObjectBody {
  transformToByteArray?: () => Promise<Uint8Array>;
  destroy?: (error?: Error) => void;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
}

export class ObjectStorageProviderError extends Error {
  readonly code: "timeout" | "unavailable";

  constructor(code: "timeout" | "unavailable", message: string) {
    super(message);
    this.name = "ObjectStorageProviderError";
    this.code = code;
  }
}

export class MemoryObjectStorage implements ObjectStoragePort {
  readonly kind = "memory";
  readonly bucket = "memory";
  private readonly objects = new Map<string, { body: Buffer; contentType?: string }>();

  async putObject(
    key: string,
    body: Buffer,
    metadata: Record<string, string> = {},
  ): Promise<ObjectStoragePutResult> {
    assertObjectKey(key);
    this.objects.set(key, {
      body: Buffer.from(body),
      contentType: metadata["content-type"],
    });
    return { size: body.length };
  }

  async getObject(key: string): Promise<ObjectStorageGetResult | null> {
    assertObjectKey(key);
    const object = this.objects.get(key);
    return object
      ? { body: Buffer.from(object.body), contentType: object.contentType, size: object.body.length }
      : null;
  }

  async statObject(key: string): Promise<{ size: number } | null> {
    assertObjectKey(key);
    const object = this.objects.get(key);
    return object ? { size: object.body.length } : null;
  }

  async removeObject(key: string): Promise<void> {
    assertObjectKey(key);
    this.objects.delete(key);
  }
}

export class R2ObjectStorage implements ObjectStoragePort {
  readonly kind = "r2";
  readonly bucket: string;
  private readonly client: ObjectStorageCommandClient;

  constructor(
    private readonly options: R2ObjectStorageOptions,
    client?: ObjectStorageCommandClient,
  ) {
    assertHostedR2EndpointPolicy(options);
    this.bucket = requireConfigValue("R2_BUCKET_NAME", options.bucket);
    if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs < 500 || options.requestTimeoutMs > 60_000) {
      throw new Error("R2_REQUEST_TIMEOUT_MS must be an integer between 500 and 60000.");
    }
    if (options.maxObjectBytes !== undefined &&
        (!Number.isSafeInteger(options.maxObjectBytes) || options.maxObjectBytes < 1)) {
      throw new Error("R2 maxObjectBytes must be a positive safe integer.");
    }
    const accountId = requireConfigValue("R2_ACCOUNT_ID", options.accountId);
    if (!/^[a-f0-9]{32}$/iu.test(accountId) && !options.endpoint) {
      throw new Error("R2_ACCOUNT_ID must be a 32-character Cloudflare account identifier.");
    }
    const endpoint = options.endpoint?.trim() ? validateEndpoint(options.endpoint) : r2Endpoint(accountId);
    const config: S3ClientConfig = {
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: requireConfigValue("R2_ACCESS_KEY_ID", options.accessKeyId),
        secretAccessKey: requireConfigValue("R2_SECRET_ACCESS_KEY", options.secretAccessKey),
      },
      forcePathStyle: options.forcePathStyle ?? false,
      maxAttempts: 2,
    };
    this.client = client ?? new S3Client(config);
  }

  async ensureReady(): Promise<void> {
    await this.send(new HeadBucketCommand({ Bucket: this.bucket }), "check readiness");
  }

  async putObject(
    key: string,
    body: Buffer,
    metadata: Record<string, string> = {},
  ): Promise<ObjectStoragePutResult> {
    assertObjectKey(key);
    const contentType = metadata["content-type"]?.trim() || "application/octet-stream";
    const result = await this.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType,
      Metadata: providerSafeMetadata(metadata),
    }), "store object") as { ETag?: string };
    return { size: body.length, etag: result.ETag };
  }

  async getObject(key: string): Promise<ObjectStorageGetResult | null> {
    assertObjectKey(key);
    const deadline = Date.now() + this.options.requestTimeoutMs;
    let result: {
      Body?: ProviderObjectBody;
      ContentLength?: number;
      ContentType?: string;
    };
    try {
      result = await this.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        "read object",
        true,
        Math.max(1, deadline - Date.now()),
      ) as typeof result;
    } catch (error) {
      if (isMissingObjectError(error)) return null;
      throw error;
    }
    if (!result.Body?.transformToByteArray && !result.Body?.[Symbol.asyncIterator]) {
      throw new ObjectStorageProviderError("unavailable", "Private object storage returned an unreadable body.");
    }
    const maxObjectBytes = this.options.maxObjectBytes ?? 64 * 1024 * 1024;
    if (result.ContentLength !== undefined && result.ContentLength > maxObjectBytes) {
      result.Body.destroy?.();
      throw new ObjectStorageProviderError("unavailable", "Private object storage returned an oversized object body.");
    }
    let bytes: Uint8Array;
    try {
      bytes = await this.withDeadline(
        this.readBoundedBody(result.Body, maxObjectBytes),
        "read object body",
        Math.max(1, deadline - Date.now()),
      );
    } catch (error) {
      result.Body.destroy?.(error instanceof Error ? error : undefined);
      throw error;
    }
    const body = Buffer.from(bytes);
    if (body.length > maxObjectBytes) {
      result.Body.destroy?.();
      throw new ObjectStorageProviderError("unavailable", "Private object storage returned an oversized object body.");
    }
    if (result.ContentLength !== undefined && result.ContentLength !== body.length) {
      throw new ObjectStorageProviderError("unavailable", "Private object storage returned an incomplete object body.");
    }
    return {
      body,
      contentType: result.ContentType,
      size: result.ContentLength ?? body.length,
    };
  }

  private async readBoundedBody(
    body: ProviderObjectBody,
    maxObjectBytes: number,
  ): Promise<Uint8Array> {
    const iterator = body[Symbol.asyncIterator];
    if (iterator) {
      const chunks: Buffer[] = [];
      let size = 0;
      const iterable: AsyncIterable<Uint8Array | Buffer | string> = {
        [Symbol.asyncIterator]: () => iterator.call(body),
      };
      for await (const chunk of iterable) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxObjectBytes) {
          body.destroy?.();
          throw new ObjectStorageProviderError("unavailable", "Private object storage returned an oversized object body.");
        }
        chunks.push(buffer);
      }
      return Buffer.concat(chunks, size);
    }
    return body.transformToByteArray!();
  }

  async statObject(key: string): Promise<{ size: number } | null> {
    assertObjectKey(key);
    try {
      const result = await this.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        "inspect object",
        true,
      ) as { ContentLength?: number };
      if (!Number.isSafeInteger(result.ContentLength) || (result.ContentLength ?? -1) < 0) {
        throw new ObjectStorageProviderError("unavailable", "Private object storage returned invalid object metadata.");
      }
      return { size: result.ContentLength! };
    } catch (error) {
      if (isMissingObjectError(error)) return null;
      throw error;
    }
  }

  async removeObject(key: string): Promise<void> {
    assertObjectKey(key);
    try {
      await this.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), "delete object", true);
    } catch (error) {
      if (!isMissingObjectError(error)) throw error;
    }
  }

  private async send(
    command: unknown,
    operation: string,
    allowMissing = false,
    timeoutMs = this.options.requestTimeoutMs,
  ): Promise<unknown> {
    try {
      return await this.withDeadline(
        this.client.send(command, { abortSignal: AbortSignal.timeout(timeoutMs) }),
        operation,
        timeoutMs,
      );
    } catch (error) {
      if (allowMissing && isMissingObjectError(error)) throw error;
      if (error instanceof ObjectStorageProviderError) throw error;
      if (isAbortError(error)) {
        throw new ObjectStorageProviderError("timeout", `Private object storage timed out while attempting to ${operation}.`);
      }
      throw new ObjectStorageProviderError("unavailable", `Private object storage could not ${operation}.`);
    }
  }

  private async withDeadline<T>(promise: Promise<T>, operation: string, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new ObjectStorageProviderError("timeout", `Private object storage timed out while attempting to ${operation}.`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

export function assertHostedR2EndpointPolicy(
  options: Pick<R2ObjectStorageOptions, "endpoint">,
  environment?: Record<string, string | undefined>,
): void {
  const currentEnvironment = environment ?? process.env;
  const appEnvironment = currentEnvironment.APP_ENV?.trim().toLowerCase();
  const hosted = currentEnvironment.NODE_ENV === "production" ||
    appEnvironment === "qa" || appEnvironment === "production";
  if (hosted && options.endpoint?.trim()) {
    throw new Error(
      "Hosted environments derive the Cloudflare R2 endpoint from R2_ACCOUNT_ID; R2_ENDPOINT is local-integration only.",
    );
  }
}

function providerSafeMetadata(metadata: Record<string, string>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(metadata)) {
    if (!name.startsWith("x-hrms-") || !/^[a-z0-9][a-z0-9_.-]{0,63}$/u.test(name) || /[\r\n\0]/u.test(value)) continue;
    result[name] = value.slice(0, 1024);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function assertObjectKey(key: string): void {
  if (!key || key.length > 1024 || key.startsWith("/") || /[\u0000-\u001f\u007f\\]/u.test(key)) {
    throw new Error("Invalid private object key.");
  }
}

function requireConfigValue(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized || /^replace-|^local-|mock/iu.test(normalized)) {
    throw new Error(`${name} is required for private R2 object storage.`);
  }
  return normalized;
}

function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function validateEndpoint(value: string): string {
  const endpoint = new URL(value);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("R2_ENDPOINT must be an HTTP(S) origin without credentials, query parameters, or fragments.");
  }
  return endpoint.origin;
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const shaped = error as StorageErrorShape;
  return shaped.name === "NoSuchKey" || shaped.name === "NotFound" ||
    (shaped.$metadata?.httpStatusCode === 404 && shaped.name === "UnknownError");
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as StorageErrorShape).name === "AbortError");
}
