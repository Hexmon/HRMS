import { loadEnvFile } from "../../scripts/env.js";
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
      enabled: process.env.PDF_COMPRESSION_ENABLED === "true",
      binary: process.env.PDF_COMPRESSION_BINARY ?? "gs",
      quality: (process.env.PDF_COMPRESSION_QUALITY as "screen" | "ebook" | "printer" | "prepress" | "default" | undefined) ?? "ebook",
      minBytes: Number(process.env.PDF_COMPRESSION_MIN_BYTES ?? "131072"),
      timeoutMs: Number(process.env.PDF_COMPRESSION_TIMEOUT_MS ?? "30000"),
      failOpen: process.env.PDF_COMPRESSION_FAIL_OPEN !== "false"
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
    uploadTransformation: process.env.CLOUDINARY_UPLOAD_TRANSFORMATION ?? "q_auto:eco,f_auto",
    mockUploads: process.env.CLOUDINARY_MOCK_UPLOADS === "true"
  };
}

const publisher = new ValkeyStreamPublisher(valkeyUrl);
const worker = new OutboxWorker(store, publisher);
const intervalMs = Number(process.env.OUTBOX_WORKER_INTERVAL_MS ?? "2000");
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
