import { createHash, createHmac } from "node:crypto";
import type { ObjectStoragePort, ObjectStoragePutResult } from "./data-store.js";

export interface CloudinaryObjectStorageOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  resourceType: "auto" | "image" | "raw" | "video";
  uploadTransformation?: string;
  mockUploads: boolean;
}

export interface MinioObjectStorageOptions {
  endpoint: string;
  publicEndpoint?: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

interface CloudinaryUploadResponse {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  resource_type?: "image" | "raw" | "video";
}

interface StoredObject {
  body: Buffer;
  url: string;
  publicId: string;
  resourceType: "image" | "raw" | "video";
}

export class MemoryObjectStorage implements ObjectStoragePort {
  readonly kind = "memory";
  readonly bucket = "memory";
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<ObjectStoragePutResult> {
    this.objects.set(key, Buffer.from(body));
    return { size: body.length };
  }

  async presignedGetUrl(key: string, _expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) {
      throw new Error(`Object not found: ${key}`);
    }
    return `memory://documents/${encodeURIComponent(key)}`;
  }

  async statObject(key: string): Promise<{ size: number } | null> {
    const object = this.objects.get(key);
    return object ? { size: object.length } : null;
  }

  async removeObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export class CloudinaryObjectStorage implements ObjectStoragePort {
  readonly kind = "cloudinary";
  readonly bucket: string;
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly options: CloudinaryObjectStorageOptions) {
    this.bucket = options.folder;
    if (options.mockUploads && process.env.NODE_ENV === "production") {
      throw new Error("CLOUDINARY_MOCK_UPLOADS cannot be enabled in production.");
    }
    if (!options.mockUploads) {
      for (const [name, value] of Object.entries({
        CLOUDINARY_CLOUD_NAME: options.cloudName,
        CLOUDINARY_API_KEY: options.apiKey,
        CLOUDINARY_API_SECRET: options.apiSecret
      })) {
        if (!value || /^replace-|^local-|mock/iu.test(value)) {
          throw new Error(`${name} is required for Cloudinary object storage.`);
        }
      }
    }
  }

  async ensureReady(): Promise<void> {
    if (this.options.mockUploads) return;
    await this.cloudinaryAdminFetch("GET", "image", "");
  }

  async putObject(
    key: string,
    body: Buffer,
    metadata: Record<string, string> = {}
  ): Promise<ObjectStoragePutResult> {
    const publicId = this.publicIdForKey(key);
    const contentType = metadata["content-type"] ?? "application/octet-stream";
    const uploadTransformation = contentType.startsWith("image/") ? this.options.uploadTransformation : undefined;
    if (this.options.mockUploads) {
      const resourceType = this.resourceTypeFromMime(contentType);
      const url = `cloudinary-mock://${encodeURIComponent(publicId)}`;
      this.objects.set(key, { body: Buffer.from(body), url, publicId, resourceType });
      return {
        size: body.length,
        url,
        publicId,
        resourceType,
        compressed: Boolean(uploadTransformation)
      };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const uploadParams: Record<string, string> = {
      public_id: publicId,
      overwrite: "true",
      timestamp
    };
    if (uploadTransformation) {
      uploadParams.transformation = uploadTransformation;
    }
    const signature = this.sign(uploadParams);
    const uploadBytes = new Uint8Array(body.length);
    uploadBytes.set(body);
    const form = new FormData();
    form.set("file", new Blob([uploadBytes], { type: contentType }));
    form.set("api_key", this.options.apiKey);
    form.set("signature", signature);
    for (const [name, value] of Object.entries(uploadParams)) {
      form.set(name, value);
    }

    const resourceType = this.options.resourceType;
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.options.cloudName)}/${resourceType}/upload`,
      { method: "POST", body: form }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloudinary upload failed (${response.status}): ${text.slice(0, 300)}`);
    }
    const result = await response.json() as CloudinaryUploadResponse;
    return {
      size: result.bytes ?? body.length,
      url: result.secure_url,
      publicId: result.public_id ?? publicId,
      resourceType: result.resource_type,
      compressed: Boolean(uploadTransformation)
    };
  }

  async presignedGetUrl(key: string, _expiresInSeconds: number): Promise<string> {
    const object = this.objects.get(key);
    if (object) return object.url;
    return `https://res.cloudinary.com/${encodeURIComponent(this.options.cloudName)}/raw/upload/fl_attachment/${encodePublicId(this.publicIdForKey(key))}`;
  }

  async statObject(key: string): Promise<{ size: number } | null> {
    const object = this.objects.get(key);
    if (object) return { size: object.body.length };
    if (this.options.mockUploads) return null;

    for (const resourceType of ["image", "raw", "video"] as const) {
      try {
        const response = await this.cloudinaryAdminFetch("GET", resourceType, encodePublicId(this.publicIdForKey(key)));
        if (response.status === 404) continue;
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Cloudinary stat failed (${response.status}): ${text.slice(0, 300)}`);
        }
        const result = await response.json() as { bytes?: number };
        return { size: result.bytes ?? 0 };
      } catch (error) {
        if (error instanceof Error && /404|not found/iu.test(error.message)) continue;
        throw error;
      }
    }
    return null;
  }

  async removeObject(key: string): Promise<void> {
    this.objects.delete(key);
    if (this.options.mockUploads) return;
    const publicId = this.publicIdForKey(key);
    for (const resourceType of ["image", "raw", "video"] as const) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params = { invalidate: "true", public_id: publicId, timestamp };
      const form = new URLSearchParams({
        ...params,
        api_key: this.options.apiKey,
        signature: this.sign(params)
      });
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.options.cloudName)}/${resourceType}/destroy`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form
        }
      );
      if (response.ok) return;
    }
  }

  private publicIdForKey(key: string): string {
    return [this.options.folder, key]
      .filter(Boolean)
      .join("/")
      .replace(/\/+/gu, "/")
      .replace(/^\/|\/$/gu, "");
  }

  private resourceTypeFromMime(mimeType?: string): "image" | "raw" | "video" {
    if (mimeType?.startsWith("image/")) return "image";
    if (mimeType?.startsWith("video/")) return "video";
    return "raw";
  }

  private sign(params: Record<string, string>): string {
    const payload = Object.entries(params)
      .filter(([, value]) => value !== "")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    return createHash("sha1").update(`${payload}${this.options.apiSecret}`).digest("hex");
  }

  private cloudinaryAdminFetch(method: "GET", resourceType: "image" | "raw" | "video", suffix: string): Promise<Response> {
    const auth = Buffer.from(`${this.options.apiKey}:${this.options.apiSecret}`).toString("base64");
    const path = suffix
      ? `resources/${resourceType}/upload/${suffix}`
      : `resources/${resourceType}/upload?max_results=1`;
    return fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(this.options.cloudName)}/${path}`, {
      method,
      headers: { authorization: `Basic ${auth}` }
    });
  }
}

export class MinioObjectStorage implements ObjectStoragePort {
  readonly kind = "minio";
  readonly bucket: string;

  constructor(private readonly options: MinioObjectStorageOptions) {
    this.bucket = options.bucket;
    for (const [name, value] of Object.entries({
      MINIO_ENDPOINT: options.endpoint,
      MINIO_ACCESS_KEY: options.accessKey,
      MINIO_SECRET_KEY: options.secretKey,
      MINIO_BUCKET: options.bucket,
      MINIO_REGION: options.region
    })) {
      if (!value) {
        throw new Error(`${name} is required for MinIO object storage.`);
      }
    }
  }

  async ensureReady(): Promise<void> {
    const head = await this.signedFetch("HEAD", this.bucketUrl(this.options.endpoint));
    if (head.ok) {
      return;
    }
    if (head.status !== 404) {
      const text = await head.text();
      throw new Error(`MinIO bucket check failed (${head.status}): ${text.slice(0, 300)}`);
    }
    const create = await this.signedFetch("PUT", this.bucketUrl(this.options.endpoint));
    if (!create.ok) {
      const text = await create.text();
      throw new Error(`MinIO bucket create failed (${create.status}): ${text.slice(0, 300)}`);
    }
  }

  async putObject(
    key: string,
    body: Buffer,
    metadata: Record<string, string> = {}
  ): Promise<ObjectStoragePutResult> {
    const contentType = metadata["content-type"] ?? "application/octet-stream";
    const headers = new Headers({
      "content-type": contentType
    });
    for (const [name, value] of Object.entries(metadata)) {
      if (name.toLowerCase() === "content-type") continue;
      headers.set(toS3MetadataHeader(name), value);
    }
    const response = await this.signedFetch("PUT", this.objectUrl(this.options.endpoint, key), headers, body);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MinIO upload failed (${response.status}): ${text.slice(0, 300)}`);
    }
    return {
      size: body.length,
      publicId: key,
      resourceType: resourceTypeFromMime(contentType),
      compressed: false
    };
  }

  async presignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return this.presignGetUrl(
      this.objectUrl(this.options.publicEndpoint || this.options.endpoint, key),
      Math.max(1, Math.min(expiresInSeconds, 7 * 24 * 60 * 60))
    );
  }

  async statObject(key: string): Promise<{ size: number } | null> {
    const response = await this.signedFetch("HEAD", this.objectUrl(this.options.endpoint, key));
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MinIO stat failed (${response.status}): ${text.slice(0, 300)}`);
    }
    const size = Number(response.headers.get("content-length") ?? "0");
    return { size };
  }

  async removeObject(key: string): Promise<void> {
    const response = await this.signedFetch("DELETE", this.objectUrl(this.options.endpoint, key));
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`MinIO delete failed (${response.status}): ${text.slice(0, 300)}`);
    }
  }

  private async signedFetch(method: "DELETE" | "HEAD" | "PUT", url: URL, headers = new Headers(), body?: Buffer): Promise<Response> {
    const bodyHash = body ? sha256Hex(body) : sha256Hex(Buffer.alloc(0));
    signS3Headers({
      method,
      url,
      headers,
      bodyHash,
      accessKey: this.options.accessKey,
      secretKey: this.options.secretKey,
      region: this.options.region
    });
    return fetch(url, { method, headers, body: body ? new Blob([new Uint8Array(body)]) : undefined });
  }

  private bucketUrl(endpoint: string): URL {
    return storageUrl(endpoint, [this.bucket]);
  }

  private objectUrl(endpoint: string, key: string): URL {
    return storageUrl(endpoint, [this.bucket, ...key.split("/").filter(Boolean)]);
  }

  private presignGetUrl(url: URL, expiresInSeconds: number): string {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const scope = credentialScope(toDateStamp(now), this.options.region);
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set("X-Amz-Credential", `${this.options.accessKey}/${scope}`);
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    url.searchParams.set("X-Amz-SignedHeaders", "host");
    const canonicalRequest = [
      "GET",
      canonicalUri(url),
      canonicalQuery(url.searchParams),
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(Buffer.from(canonicalRequest))
    ].join("\n");
    const signature = hmacHex(signingKey(this.options.secretKey, toDateStamp(now), this.options.region), stringToSign);
    url.searchParams.set("X-Amz-Signature", signature);
    return url.toString();
  }
}

function encodePublicId(publicId: string): string {
  return publicId.split("/").map(encodeURIComponent).join("/");
}

function storageUrl(endpoint: string, parts: string[]): URL {
  const url = new URL(endpoint);
  const prefix = url.pathname.replace(/\/+$/u, "");
  url.pathname = [prefix, ...parts.map(encodePathSegment)].filter(Boolean).join("/");
  return url;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUri(url: URL): string {
  return url.pathname
    .split("/")
    .map((part) => encodePathSegment(decodeURIComponent(part)))
    .join("/") || "/";
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value)}`)
    .join("&");
}

function signS3Headers(input: {
  method: string;
  url: URL;
  headers: Headers;
  bodyHash: string;
  accessKey: string;
  secretKey: string;
  region: string;
}): void {
  const now = new Date();
  const dateStamp = toDateStamp(now);
  const amzDate = toAmzDate(now);
  input.headers.set("x-amz-content-sha256", input.bodyHash);
  input.headers.set("x-amz-date", amzDate);
  const canonicalHeaderValues = new Map<string, string>([["host", input.url.host]]);
  input.headers.forEach((value, name) => {
    canonicalHeaderValues.set(name.toLowerCase(), value);
  });
  const signedHeaderNames = [...canonicalHeaderValues.keys()].sort();
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${canonicalHeaderValues.get(name)?.trim().replace(/\s+/gu, " ") ?? ""}`)
    .join("\n");
  const scope = credentialScope(dateStamp, input.region);
  const canonicalRequest = [
    input.method,
    canonicalUri(input.url),
    canonicalQuery(input.url.searchParams),
    `${canonicalHeaders}\n`,
    signedHeaders,
    input.bodyHash
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest))
  ].join("\n");
  const signature = hmacHex(signingKey(input.secretKey, dateStamp, input.region), stringToSign);
  input.headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
}

function signingKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmacBuffer(Buffer.from(`AWS4${secretKey}`, "utf8"), dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, "s3");
  return hmacBuffer(serviceKey, "aws4_request");
}

function credentialScope(dateStamp: string, region: string): string {
  return `${dateStamp}/${region}/s3/aws4_request`;
}

function toDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/gu, "");
}

function toAmzDate(date: Date): string {
  return `${toDateStamp(date)}T${date.toISOString().slice(11, 19).replace(/:/gu, "")}Z`;
}

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmacBuffer(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function toS3MetadataHeader(name: string): string {
  return name.toLowerCase().startsWith("x-amz-meta-") ? name : `x-amz-meta-${name.replace(/^x-hrms-/iu, "hrms-")}`;
}

function resourceTypeFromMime(mimeType?: string): "image" | "raw" | "video" {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  return "raw";
}
