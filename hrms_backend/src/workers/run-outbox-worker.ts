import { loadEnvFile } from "../../scripts/env.js";
import { runtimeDefaults } from "../config/runtime-defaults.js";
import { createPostgresDataStore } from "../platform/postgres-data-store.js";
import { OutboxWorker, ValkeyStreamPublisher } from "./outbox-worker.js";

loadEnvFile(process.env.HRMS_ENV_FILE ?? ".env.local", { required: !process.env.DATABASE_URL });

const databaseUrl = process.env.DATABASE_URL;
const valkeyUrl = process.env.VALKEY_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the outbox worker.");
}

if (!valkeyUrl) {
  throw new Error("VALKEY_URL is required for the outbox worker.");
}

const store = await createPostgresDataStore({
  databaseUrl,
  valkeyUrl,
  objectStorage: objectStorageOptions(),
  documentProcessing: {
    pdfCompression: {
      enabled: booleanFromEnv("PDF_COMPRESSION_ENABLED", true),
      binary: process.env.PDF_COMPRESSION_BINARY ?? "gs",
      quality: (process.env.PDF_COMPRESSION_QUALITY as "screen" | "ebook" | "printer" | "prepress" | "default" | undefined) ?? "ebook",
      minBytes: numberFromEnv("PDF_COMPRESSION_MIN_BYTES", runtimeDefaults.PDF_COMPRESSION_MIN_BYTES),
      timeoutMs: numberFromEnv("PDF_COMPRESSION_TIMEOUT_MS", 30_000),
      failOpen: booleanFromEnv("PDF_COMPRESSION_FAIL_OPEN", true)
    },
    mediaUploads: {
      maxBytes: numberFromEnv("MEDIA_UPLOAD_MAX_BYTES", runtimeDefaults.MEDIA_UPLOAD_MAX_BYTES),
      imageMaxWidth: numberFromEnv("MEDIA_IMAGE_MAX_WIDTH", runtimeDefaults.MEDIA_IMAGE_MAX_WIDTH),
      imageMaxHeight: numberFromEnv("MEDIA_IMAGE_MAX_HEIGHT", runtimeDefaults.MEDIA_IMAGE_MAX_HEIGHT),
      imageJpegQuality: numberFromEnv("MEDIA_IMAGE_JPEG_QUALITY", runtimeDefaults.MEDIA_IMAGE_JPEG_QUALITY),
      allowedMimeTypes: listFromEnv("MEDIA_ALLOWED_MIME_TYPES", runtimeDefaults.MEDIA_ALLOWED_MIME_TYPES),
      imageOutputMimeType: "image/jpeg",
      cloudinaryTransformation: process.env.MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION ?? runtimeDefaults.MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION
    },
    companyLogoUploads: {
      maxBytes: numberFromEnv("COMPANY_LOGO_MAX_BYTES", runtimeDefaults.COMPANY_LOGO_MAX_BYTES),
      imageMaxWidth: numberFromEnv("COMPANY_LOGO_MAX_WIDTH", runtimeDefaults.COMPANY_LOGO_MAX_WIDTH),
      imageMaxHeight: numberFromEnv("COMPANY_LOGO_MAX_HEIGHT", runtimeDefaults.COMPANY_LOGO_MAX_HEIGHT),
      imageJpegQuality: numberFromEnv("COMPANY_LOGO_JPEG_QUALITY", runtimeDefaults.COMPANY_LOGO_JPEG_QUALITY),
      allowedMimeTypes: listFromEnv("COMPANY_LOGO_ALLOWED_MIME_TYPES", runtimeDefaults.COMPANY_LOGO_ALLOWED_MIME_TYPES),
      imageOutputMimeType: "image/jpeg",
      cloudinaryTransformation: process.env.COMPANY_LOGO_CLOUDINARY_TRANSFORMATION ?? runtimeDefaults.COMPANY_LOGO_CLOUDINARY_TRANSFORMATION
    }
  },
  seedIfEmpty: false
});

function objectStorageOptions() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "local-cloudinary-mock",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "local-cloudinary-key",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "local-cloudinary-secret",
    folder: process.env.CLOUDINARY_FOLDER ?? "hawkaii-hrms",
    resourceType: (process.env.CLOUDINARY_RESOURCE_TYPE as "auto" | "image" | "raw" | "video" | undefined) ?? "auto",
    uploadTransformation: process.env.MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION ?? process.env.CLOUDINARY_UPLOAD_TRANSFORMATION ?? "q_auto:eco,f_auto",
    mockUploads: booleanFromEnv("CLOUDINARY_MOCK_UPLOADS", true)
  };
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  return ["true", "1", "yes", "on"].includes(value);
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listFromEnv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

const publisher = new ValkeyStreamPublisher(valkeyUrl);
const worker = new OutboxWorker(store, publisher);
const intervalMs = numberFromEnv("OUTBOX_WORKER_INTERVAL_MS", 2000);
let stopping = false;

async function tick(): Promise<void> {
  try {
    const result = await worker.publishPending(100);
    if (result.published > 0 || result.dead_lettered > 0) {
      console.log(JSON.stringify({ worker: "outbox", ...result }));
    }
  } catch (error) {
    console.error("Outbox worker publish cycle failed", error);
  }
}

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  publisher.close();
  await store.persistence?.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

console.log("Outbox worker started with Valkey Streams publisher.");
while (!stopping) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
