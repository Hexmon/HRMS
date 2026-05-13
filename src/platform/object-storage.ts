import { Client as MinioClient } from "minio";
import type { ObjectStoragePort } from "./data-store.js";

export interface MinioObjectStorageOptions {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export class MemoryObjectStorage implements ObjectStoragePort {
  readonly kind = "memory";
  readonly bucket = "memory";
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(body));
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

export class MinioObjectStorage implements ObjectStoragePort {
  readonly kind = "minio";
  readonly bucket: string;
  private readonly client: MinioClient;

  constructor(options: MinioObjectStorageOptions) {
    const url = new URL(options.endpoint);
    this.bucket = options.bucket;
    this.client = new MinioClient({
      endPoint: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      useSSL: url.protocol === "https:",
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      region: options.region
    });
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async putObject(key: string, body: Buffer, metadata: Record<string, string> = {}): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, key, body, body.length, metadata);
  }

  async presignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    await this.ensureBucket();
    return this.client.presignedGetObject(this.bucket, key, expiresInSeconds);
  }

  async statObject(key: string): Promise<{ size: number } | null> {
    await this.ensureBucket();
    try {
      const stat = await this.client.statObject(this.bucket, key);
      return { size: stat.size };
    } catch (error) {
      if (error instanceof Error && /not found|notfound|NoSuchKey/iu.test(error.message)) {
        return null;
      }
      throw error;
    }
  }

  async removeObject(key: string): Promise<void> {
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, key);
  }
}
