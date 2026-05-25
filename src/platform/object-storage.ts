import { createHash } from "node:crypto";
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

function encodePublicId(publicId: string): string {
  return publicId.split("/").map(encodeURIComponent).join("/");
}
