import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Redis as Valkey } from "iovalkey";
import { seedIds, nowIso } from "../src/platform/data-store.js";
import { createPostgresDataStore } from "../src/platform/postgres-data-store.js";
import { OutboxWorker, ValkeyStreamPublisher } from "../src/workers/outbox-worker.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import { fail } from "./lib.js";

loadRuntimeEnv();

const releaseDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/release-acceptance";
mkdirSync(releaseDir, { recursive: true });

const valkeyUrl = requireEnv("VALKEY_URL");
const store = await createPostgresDataStore({
  databaseUrl: requireEnv("DATABASE_URL"),
  valkeyUrl,
  objectStorage: objectStorageOptions(),
  seedIfEmpty: false
});

const failures: string[] = [];
const notes: string[] = [];

try {
  if (store.kind !== "postgres") failures.push("runtime store is not PostgreSQL-backed");
  if (!store.pgPool) failures.push("PostgreSQL pool is not attached to runtime store");
  const expectedStorageProvider = "cloudinary";
  if (store.objectStorage?.kind !== expectedStorageProvider) {
    failures.push(`document object storage is not ${expectedStorageProvider}-backed`);
  }
  if (!store.sessionStore.constructor.name.includes("Valkey")) failures.push("session store is not Valkey-backed");

  const eventId = randomUUID();
  store.outbox.push({
    id: store.nextOutboxId++,
    company_id: null,
    event_id: eventId,
    aggregate_type: "release_acceptance",
    aggregate_id: seedIds.employee1,
    event_type: "release.acceptance.outbox_smoke",
    payload: { source: "verify-release-adapters" },
    idempotency_key: `release-acceptance:${Date.now()}:${randomUUID()}`,
    status: "pending",
    retry_count: 0,
    available_at: nowIso(),
    created_at: nowIso(),
    published_at: null,
    failed_at: null,
    last_error: null
  });
  await store.persistence?.flush();

  const eventTransport = process.env.HRMS_EVENT_TRANSPORT ?? "legacy";
  let publishedThisRun = 0;
  let streamEntries: number | null = null;
  if (eventTransport === "cloudflare") {
    const response = await fetch(requireEnv("OUTBOX_DRAIN_URL"), {
      method: "POST",
      headers: { authorization: `Bearer ${requireEnv("OUTBOX_DRAIN_TOKEN")}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) failures.push(`Cloudflare outbox signal returned ${response.status}`);
    for (let attempt = 0; attempt < 25 && publishedThisRun === 0; attempt += 1) {
      const result = await store.pgPool!.query<{ status: string }>(
        "SELECT status FROM platform.outbox_events WHERE event_id = $1", [eventId],
      );
      if (result.rows[0]?.status === "published") publishedThisRun = 1;
      else await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (publishedThisRun === 0) failures.push("Cloudflare Queue did not accept the outbox smoke event in 25 seconds");
  } else if (eventTransport === "legacy") {
    const publisher = new ValkeyStreamPublisher(valkeyUrl);
    const worker = new OutboxWorker(store, publisher);
    const publishResult = await worker.publishPending(100);
    publisher.close();
    publishedThisRun = publishResult.published;
    if (publishedThisRun < 1) failures.push("outbox worker did not publish any Valkey Stream event");

    const valkey = new Valkey(valkeyUrl);
    const streamKeys = await valkey.keys("hrms.*");
    streamEntries = 0;
    for (const key of streamKeys) {
      streamEntries += await valkey.xlen(key);
    }
    await valkey.quit();
    if (streamEntries < 1) failures.push("Valkey Streams contain no published outbox entries");
  } else {
    failures.push(`Unsupported HRMS_EVENT_TRANSPORT: ${eventTransport}`);
  }

  const missingObjects: string[] = [];
  for (const document of store.documents) {
    const stat = await store.objectStorage?.statObject(document.storage_key);
    if (!stat) {
      missingObjects.push(document.storage_key);
    }
  }
  if (missingObjects.length > 0) {
    failures.push(`document metadata without object-storage object: ${missingObjects.join(", ")}`);
  }

  notes.push(`data_store=${store.kind}`);
  notes.push(`session_store=${store.sessionStore.constructor.name}`);
  notes.push(`object_storage=${store.objectStorage?.kind ?? "missing"}`);
  notes.push(`tickets=${store.tickets.length}`);
  notes.push(`line_items=${store.lineItems.length}`);
  notes.push(`approvals=${store.expenseApprovals.length}`);
  notes.push(`audit_logs=${store.auditLogs.length}`);
  notes.push(`documents=${store.documents.length}`);
  notes.push(`document_access_logs=${store.documentAccessLogs.length}`);
  notes.push(`assets=${store.assets.length}`);
  notes.push(`asset_recovery_tickets=${store.assetRecoveryTickets.length}`);
  notes.push(`timesheet_submissions=${store.timesheetSubmissions.length}`);
  notes.push(`event_transport=${eventTransport}`);
  if (streamEntries !== null) notes.push(`valkey_stream_entries=${streamEntries}`);
  notes.push(`outbox_published_this_run=${publishedThisRun}`);
} finally {
  await store.persistence?.close();
}

const result = {
  timestamp: new Date().toISOString(),
  status: failures.length === 0 ? "pass" : "fail",
  failures,
  notes
};

writeFileSync(join(releaseDir, "real-adapters-verification.json"), `${JSON.stringify(result, null, 2)}\n`);

if (failures.length > 0) {
  fail(`Real adapter verification failed:\n${failures.join("\n")}`);
}

console.log("Real adapter verification passed.");

function objectStorageOptions() {
  return {
    cloudName: requireEnv("CLOUDINARY_CLOUD_NAME"),
    apiKey: requireEnv("CLOUDINARY_API_KEY"),
    apiSecret: requireEnv("CLOUDINARY_API_SECRET"),
    folder: process.env.CLOUDINARY_FOLDER ?? "hawkaii-hrms",
    resourceType: (process.env.CLOUDINARY_RESOURCE_TYPE as "auto" | "image" | "raw" | "video" | undefined) ?? "auto",
    uploadTransformation: process.env.CLOUDINARY_UPLOAD_TRANSFORMATION ?? "q_auto:eco,f_auto",
    mockUploads: process.env.CLOUDINARY_MOCK_UPLOADS === "true"
  };
}
