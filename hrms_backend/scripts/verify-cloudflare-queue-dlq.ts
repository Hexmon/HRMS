import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Pool } from "pg";

type CapturedMessage = { body: { kind: string; eventId: string }; attempts: number };
type WorkerLog = { level: string; message: string };

const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const connectionString = (() => {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required for the local Queue DLQ check.");
  return value;
})();
const databaseUrl = new URL(connectionString);
if (
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  !databaseUrl.pathname.endsWith("_test")
) {
  throw new Error("The local Queue DLQ check only accepts a localhost *_test database.");
}

const wrangler = JSON.parse(await readFile(join(backendRoot, "wrangler.jsonc"), "utf8")) as {
  compatibility_date: string;
  compatibility_flags: string[];
  queues: { consumers: Array<{
    queue: string;
    max_batch_size: number;
    max_retries: number;
    dead_letter_queue: string;
  }> };
  env: Record<string, { queues: { consumers: Array<{
    queue: string;
    max_retries: number;
    dead_letter_queue: string;
  }> } }>;
};
const source = (() => {
  const selected = wrangler.queues.consumers.find((consumer) => consumer.queue === "hrms-business-events");
  if (!selected?.dead_letter_queue || !selected.max_retries) {
    throw new Error("The business-event Queue must have a retry budget and DLQ.");
  }
  return selected;
})();
for (const environment of ["dev", "qa", "production"]) {
  const consumer = wrangler.env[environment]?.queues.consumers.find(
    (item) => item.queue === `${source.queue}-${environment}`,
  );
  if (
    consumer?.max_retries !== source.max_retries ||
    consumer.dead_letter_queue !== `${source.dead_letter_queue}-${environment}`
  ) {
    throw new Error(`The ${environment} business-event Queue must retain the configured retry budget and isolated DLQ.`);
  }
}

function eventLogs(logs: WorkerLog[]): Array<Record<string, unknown>> {
  return logs.flatMap((entry) => {
    try {
      const parsed = JSON.parse(entry.message) as Record<string, unknown>;
      return typeof parsed.job === "string" ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

async function waitUntil<T>(label: string, read: () => Promise<T | null>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function main(): Promise<void> {
  const outputDir = await mkdtemp(join(tmpdir(), "hrms-worker-dlq-"));
  const pool = new Pool({ connectionString, max: 1 });
  const healthyId = randomUUID();
  const delayedId = randomUUID();
  const insertedIds: string[] = [];
  const logs: WorkerLog[] = [];
  let miniflare: Miniflare | undefined;
  try {
    await pool.query("SELECT 1");
    const bundle = spawnSync("pnpm", [
      "exec", "wrangler", "deploy", "--env", "", "--dry-run", "--outdir", outputDir,
    ], {
      cwd: backendRoot,
      encoding: "utf8",
      timeout: 120_000,
    });
    if (bundle.status !== 0) {
      throw new Error(`Wrangler dry-run bundle failed (exit ${bundle.status ?? "unknown"}).`);
    }

    await pool.query(
      `INSERT INTO platform.outbox_events
         (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, published_at)
       VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3, 'published', now())`,
      [healthyId, randomUUID(), `cloudflare-dlq-check:${healthyId}`],
    );
    insertedIds.push(healthyId);

    miniflare = new Miniflare(convertV4MiniflareOptions({
      cf: false,
      rootPath: outputDir,
      handleStructuredLogs: (entry) => { logs.push(entry); },
      workers: [
        {
          name: "main",
          modules: true,
          scriptPath: "cloudflare-worker.js",
          compatibilityDate: wrangler.compatibility_date,
          compatibilityFlags: wrangler.compatibility_flags,
          bindings: {
            // Local binding shape only: this does not emulate hosted Hyperdrive.
            HYPERDRIVE: { connectionString },
            OUTBOX_SIGNAL_TOKEN: "synthetic-local-token",
            WORKER_ACTIVE: "true",
            JOBS_QUEUE_NAME: "hrms-background-jobs",
            EVENTS_QUEUE_NAME: source.queue,
          },
          queueProducers: {
            JOBS: { queueName: "hrms-background-jobs" },
            EVENTS: { queueName: source.queue },
          },
          queueConsumers: {
            [source.queue]: {
              maxBatchSize: source.max_batch_size,
              maxBatchTimeout: 1,
              maxRetries: source.max_retries,
              retryDelay: 0, // Keep the configured retry count; shorten only local waiting.
              deadLetterQueue: source.dead_letter_queue,
            },
          },
        },
        {
          name: "dlq-observer",
          modules: true,
          script: `
            let received = [];
            export default {
              async queue(batch) {
                received.push(...batch.messages.map((message) => ({
                  body: message.body, attempts: message.attempts,
                })));
                batch.ackAll();
              },
              async fetch() { return Response.json(received); }
            };
          `,
          queueConsumers: [source.dead_letter_queue],
        },
      ],
    }));

    const events = await miniflare.getQueueProducer("EVENTS", "main");
    const dlqObserver = await miniflare.getWorker("dlq-observer") as unknown as {
      fetch(url: string): Promise<Response>;
    };
    await events.sendBatch([
      { body: { kind: "event", eventId: healthyId } },
      { body: { kind: "event", eventId: delayedId } },
    ]);
    const deadLetters = await waitUntil("the missing event in the local DLQ", async () => {
      const response = await dlqObserver.fetch("http://local/messages");
      const messages = await response.json() as CapturedMessage[];
      return messages.length > 0 ? messages : null;
    });
    assert.equal(deadLetters.length, 1, "Only the missing event should reach the DLQ.");
    assert.deepEqual(deadLetters[0]?.body, { kind: "event", eventId: delayedId });
    const beforeReplay = eventLogs(logs);
    assert.equal(beforeReplay.filter((entry) => entry.job === "business-event" && entry.event_id === healthyId).length, 1);
    assert.equal(beforeReplay.filter((entry) => entry.job === "business-event" && entry.event_id === delayedId).length, 0);
    assert.equal(
      beforeReplay.filter((entry) => entry.job === "queue" && entry.queue === source.queue).length,
      source.max_retries + 1,
      "The source consumer should exhaust its configured retry budget.",
    );

    // Repair the missing durable source, then replay the exact DLQ body.
    await pool.query(
      `INSERT INTO platform.outbox_events
         (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, published_at)
       VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3, 'published', now())`,
      [delayedId, randomUUID(), `cloudflare-dlq-check:${delayedId}`],
    );
    insertedIds.push(delayedId);
    await events.send(deadLetters[0]!.body);
    await waitUntil("the replayed event to be processed", async () => {
      const processed = eventLogs(logs).filter(
        (entry) => entry.job === "business-event" && entry.event_id === delayedId,
      );
      return processed.length === 1 ? true : null;
    });
    const afterReplay = await (await dlqObserver.fetch("http://local/messages")).json() as CapturedMessage[];
    assert.equal(afterReplay.length, 1, "Replay must not create a second DLQ entry.");
    assert.equal(
      eventLogs(logs).filter((entry) => entry.job === "business-event" && entry.event_id === healthyId).length,
      1,
      "The healthy batch peer must not be redelivered.",
    );
    console.log(`Local Cloudflare Queue DLQ/replay check passed (${source.max_retries + 1} failed deliveries, 1 isolated peer, 1 replay).`);
  } finally {
    try {
      await miniflare?.dispose();
    } finally {
      try {
        if (insertedIds.length > 0) {
          await pool.query("DELETE FROM platform.outbox_events WHERE event_id = ANY($1::uuid[])", [insertedIds]);
        }
      } finally {
        await pool.end();
        await rm(outputDir, { recursive: true, force: true });
      }
    }
  }
}

await main();
