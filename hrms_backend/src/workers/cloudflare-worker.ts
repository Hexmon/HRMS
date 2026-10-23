import { Pool } from "pg";
import { drainOutbox, purgeCoordinates, readPublishedEvent, sweepAttendance, type JobMessage, type JobQueue } from "./cloudflare-jobs.js";
import { safeOutboxLastError } from "./safe-error.js";

interface Env {
  HYPERDRIVE: { connectionString: string };
  JOBS: JobQueue;
  EVENTS: JobQueue;
  OUTBOX_SIGNAL_TOKEN: string;
}

interface QueueMessage {
  body: unknown;
  ack(): void;
  retry(): void;
}

interface QueueBatch {
  queue: string;
  messages: QueueMessage[];
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

function isJob(value: unknown): value is JobMessage {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  if (job.kind === "outbox" || job.kind === "purge") return true;
  return job.kind === "attendance" && typeof job.referenceIso === "string" &&
    Number.isFinite(Date.parse(job.referenceIso)) &&
    (job.cursor === undefined || (
      typeof job.cursor === "object" && job.cursor !== null &&
      typeof (job.cursor as Record<string, unknown>).checkedInAt === "string" &&
      typeof (job.cursor as Record<string, unknown>).sessionId === "string"
    ));
}

function isEvent(value: unknown): value is { kind: "event"; eventId: string } {
  return Boolean(value && typeof value === "object" &&
    (value as Record<string, unknown>).kind === "event" &&
    typeof (value as Record<string, unknown>).eventId === "string");
}

async function withPool<T>(env: Env, action: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 2 });
  try {
    return await action(pool);
  } finally {
    await pool.end();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    if (request.method !== "POST" || url.pathname !== "/internal/outbox-signal") {
      return new Response("Not found", { status: 404 });
    }
    const supplied = request.headers.get("authorization");
    if (!env.OUTBOX_SIGNAL_TOKEN || supplied !== `Bearer ${env.OUTBOX_SIGNAL_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    await env.JOBS.send({ kind: "outbox" });
    return new Response(null, { status: 202 });
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const time = new Date(controller.scheduledTime).toISOString();
    if (controller.cron === "* * * * *") await env.JOBS.send({ kind: "outbox" });
    if (controller.cron === "*/5 * * * *") await env.JOBS.send({ kind: "attendance", referenceIso: time });
    if (controller.cron === "0 * * * *") await env.JOBS.send({ kind: "purge" });
  },

  async queue(batch: QueueBatch, env: Env): Promise<void> {
    await withPool(env, async (pool) => {
      for (const message of batch.messages) {
        try {
          if (batch.queue === "hrms-background-jobs") {
            if (!isJob(message.body)) throw new Error("invalid job message");
            const job = message.body;
            const result = job.kind === "outbox"
              ? await drainOutbox(pool, env.EVENTS, env.JOBS)
              : job.kind === "attendance"
                ? await sweepAttendance(pool, env.JOBS, job)
                : await purgeCoordinates(pool, env.JOBS);
            console.log(JSON.stringify({ job: job.kind, result }));
          } else if (batch.queue === "hrms-business-events") {
            if (!isEvent(message.body)) throw new Error("invalid event message");
            const event = await readPublishedEvent(pool, message.body.eventId);
            if (!event) throw new Error("published event not yet visible");
            // No business-event consumer existed in this repository. Preserve the
            // transport and replay key without inventing a notification side effect.
            console.log(JSON.stringify({ job: "business-event", event_id: event.event_id, event_type: event.event_type }));
          } else {
            throw new Error("unexpected queue");
          }
          message.ack();
        } catch (error) {
          console.error(JSON.stringify({ job: "queue", queue: batch.queue, error: safeOutboxLastError(error) }));
          message.retry();
        }
      }
    });
  },
};
