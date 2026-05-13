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
  objectStorage: {
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000",
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? "minioadmin",
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? "hrms-documents",
    region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1"
  },
  seedIfEmpty: false
});

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
