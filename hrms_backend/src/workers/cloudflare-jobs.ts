import { Pool } from "pg";
import type { MemoryDataStore } from "../platform/data-store.js";
import { AttendanceCommandService } from "../modules/attendance/command-service.js";
import { AttendanceCoordinatePurgeWorker } from "./attendance-coordinate-purge-worker.js";
import { safeOutboxLastError } from "./safe-error.js";
import { MediaLifecycleService } from "../modules/documents/media-lifecycle.js";
import type { ObjectStoragePort } from "../platform/data-store.js";

export const OUTBOX_BATCH_SIZE = 50;
export const ATTENDANCE_BATCH_SIZE = 25;
export const PURGE_BATCH_SIZE = 500;
export const MEDIA_RECONCILE_BATCH_SIZE = 20;

export type JobMessage =
  | { kind: "outbox" }
  | { kind: "attendance"; referenceIso: string; cursor?: { checkedInAt: string; sessionId: string } }
  | { kind: "purge" }
  | { kind: "media" };

export interface JobQueue {
  send(message: JobMessage | { kind: "event"; eventId: string }): Promise<void>;
}

type PoolLike = Pick<Pool, "connect" | "query">;

/** One bounded transaction. A failed send leaves the row retryable; a commit failure
 * after Queue acceptance can duplicate eventId, so downstream handlers must dedupe. */
export async function drainOutbox(pool: PoolLike, events: JobQueue, jobs: JobQueue, limit = OUTBOX_BATCH_SIZE): Promise<{ published: number; retried: number; deadLettered: number }> {
  const client = await pool.connect();
  let published = 0;
  let retried = 0;
  let deadLettered = 0;
  let selected = 0;
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: number; event_id: string; retry_count: number }>(
      `SELECT id, event_id, retry_count FROM platform.outbox_events
       WHERE status IN ('pending', 'retry') AND available_at <= now()
       ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $1`,
      [limit],
    );
    selected = result.rows.length;
    for (const row of result.rows) {
      try {
        await events.send({ kind: "event", eventId: row.event_id });
        await client.query(
          `UPDATE platform.outbox_events
           SET status = 'published', published_at = now(), failed_at = NULL, last_error = NULL
           WHERE id = $1`,
          [row.id],
        );
        published += 1;
      } catch (error) {
        const retryCount = row.retry_count + 1;
        const dead = retryCount >= 5;
        await client.query(
          `UPDATE platform.outbox_events
           SET status = $2, retry_count = $3, failed_at = now(), last_error = $4,
               available_at = CASE WHEN $2 = 'retry' THEN now() + interval '15 seconds' ELSE available_at END
           WHERE id = $1`,
          [row.id, dead ? "dead_letter" : "retry", retryCount, safeOutboxLastError(error)],
        );
        if (dead) deadLettered += 1;
        else retried += 1;
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (selected === limit) await jobs.send({ kind: "outbox" });
  return { published, retried, deadLettered };
}

/** The existing command service performs the policy/cutoff calculation and obtains
 * employee-state and session row locks inside its transaction. No advisory lock. */
export async function sweepAttendance(pool: Pool, jobs: JobQueue, input: Extract<JobMessage, { kind: "attendance" }>, limit = ATTENDANCE_BATCH_SIZE): Promise<{ scanned: number; closed: number; failed: number }> {
  // Closing an already-open shift preserves payroll evidence even if HR has
  // since deactivated the employee or company. Never create a new shift here.
  const result = await pool.query<{ company_id: string; employee_user_id: string; session_id: string; checked_in_at: Date }>(
    `SELECT session.company_id, session.employee_user_id, session.id AS session_id, session.checked_in_at
     FROM attendance.sessions session
     JOIN platform.company_profiles company ON company.id = session.company_id
     JOIN core.users employee ON employee.id = session.employee_user_id
     WHERE session.closed_at IS NULL AND session.deleted_at IS NULL
       AND session.checked_in_at <= $1::timestamptz
       AND ($2::timestamptz IS NULL OR (session.checked_in_at, session.id) > ($2::timestamptz, $3::uuid))
     ORDER BY session.checked_in_at, session.id LIMIT $4`,
    [input.referenceIso, input.cursor?.checkedInAt ?? null, input.cursor?.sessionId ?? null, limit],
  );
  // This method only needs pgPool. Avoid hydrating the application store in Workers.
  const service = new AttendanceCommandService({ pgPool: pool } as MemoryDataStore);
  let closed = 0;
  let failed = 0;
  for (const candidate of result.rows) {
    try {
      const closure = await service.autoCheckoutOpenSession({
        companyId: candidate.company_id,
        employeeUserId: candidate.employee_user_id,
        sessionId: candidate.session_id,
        referenceIso: input.referenceIso,
      });
      if (closure) closed += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ job: "attendance", session_id: candidate.session_id, error: safeOutboxLastError(error) }));
    }
  }
  if (closed > 0) await jobs.send({ kind: "outbox" });
  if (result.rows.length === limit) {
    const last = result.rows.at(-1)!;
    await jobs.send({ kind: "attendance", referenceIso: input.referenceIso, cursor: {
      checkedInAt: new Date(last.checked_in_at).toISOString(),
      sessionId: last.session_id,
    } });
  }
  return { scanned: result.rows.length, closed, failed };
}

export async function purgeCoordinates(pool: Pool, jobs: JobQueue, limit = PURGE_BATCH_SIZE): Promise<{ purged: number }> {
  const worker = new AttendanceCoordinatePurgeWorker({ pgPool: pool, kind: "postgres" } as MemoryDataStore);
  const result = await worker.purgeExpired({ batchSize: limit });
  if (result.purged === limit) await jobs.send({ kind: "purge" });
  return { purged: result.purged };
}

export interface MediaBucketHead {
  size: number;
  etag?: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface MediaBucket {
  head(key: string): Promise<MediaBucketHead | null>;
}

/** Bounded recovery only. This never purges an object. Each selected intent is
 * leased with SKIP LOCKED so duplicate Queue deliveries and multiple Workers
 * cannot finalize the same parent concurrently. */
export async function reconcileMedia(
  pool: Pool,
  bucket: MediaBucket,
  jobs: JobQueue,
  limit = MEDIA_RECONCILE_BATCH_SIZE,
): Promise<{ leased: number; finalized: number; quarantined: number; pending: number }> {
  const leaseOwner = crypto.randomUUID();
  const client = await pool.connect();
  let rows: Array<{
    id: string;
    state: "prepared" | "uploading" | "retry_wait" | "object_confirmed";
    object_key: string;
    document_id: string;
    measured_size_bytes: string;
    checksum_sha256: string;
  }> = [];
  let selectedCount = 0;
  let terminalized = 0;
  try {
    await client.query("BEGIN");
    const selected = await client.query<typeof rows[number] & { expires_at: Date; attempt_count: number }>(
      `SELECT id,state,object_key,document_id,measured_size_bytes,checksum_sha256,expires_at,attempt_count
       FROM documents.media_upload_intents
       WHERE state IN ('prepared','uploading','retry_wait','object_confirmed')
         AND (lease_expires_at IS NULL OR lease_expires_at <= now())
       ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $1`,
      [limit],
    );
    selectedCount = selected.rows.length;
    const now = Date.now();
    const terminal = selected.rows.filter((row) => row.state !== "object_confirmed" &&
      (new Date(row.expires_at).getTime() <= now || row.attempt_count >= 5));
    rows = selected.rows.filter((row) => !terminal.includes(row));
    if (terminal.length) {
      const expiredIds = terminal.filter((row) => new Date(row.expires_at).getTime() <= now).map((row) => row.id);
      await client.query(
        `UPDATE documents.media_upload_intents
         SET state='quarantined',last_safe_error=CASE WHEN id=ANY($2::uuid[])
               THEN 'intent_expired' ELSE 'attempt_limit_exhausted' END,
             lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
         WHERE id=ANY($1::uuid[])`,
        [terminal.map((row) => row.id), expiredIds],
      );
      terminalized = terminal.length;
    }
    if (rows.length) {
      await client.query(
        `UPDATE documents.media_upload_intents
         SET lease_owner=$1,lease_expires_at=now()+interval '2 minutes',updated_at=now()
         WHERE id=ANY($2::uuid[])`,
        [leaseOwner, rows.map((row) => row.id)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  let finalized = 0;
  let quarantined = terminalized;
  let pending = 0;
  const finalizeStorage: ObjectStoragePort = {
    kind: "r2",
    bucket: "worker-r2-binding",
    putObject: async () => { throw new Error("reconciler cannot put objects"); },
    getObject: async () => { throw new Error("reconciler cannot read object bodies"); },
    statObject: async () => { throw new Error("reconciler uses the R2 binding head operation"); },
    removeObject: async () => { throw new Error("TEN-S25-021 forbids physical deletion"); },
  };
  const lifecycle = new MediaLifecycleService(pool, finalizeStorage);
  for (const row of rows) {
    try {
      const head = await bucket.head(row.object_key);
      if (!head) {
        pending += 1;
        await releaseMediaLease(pool, row.id, leaseOwner, "object_not_visible");
        continue;
      }
      const intentMarker = head.customMetadata?.["x-hrms-intent-id"];
      const documentMarker = head.customMetadata?.["x-hrms-document-id"];
      const checksumMarker = head.customMetadata?.["x-hrms-checksum-sha256"];
      if (head.size !== Number(row.measured_size_bytes) || intentMarker !== row.id ||
          documentMarker !== row.document_id || checksumMarker !== row.checksum_sha256) {
        quarantined += 1;
        await pool.query(
          `UPDATE documents.media_upload_intents
           SET state='quarantined',last_safe_error='provider_evidence_mismatch',
               lease_owner=NULL,lease_expires_at=NULL,attempt_count=attempt_count+1,updated_at=now()
           WHERE id=$1 AND lease_owner=$2`,
          [row.id, leaseOwner],
        );
        continue;
      }
      await pool.query(
        `UPDATE documents.media_upload_intents
         SET state='object_confirmed',provider_etag=$3,provider_size_bytes=$4,
             provider_metadata=$5::jsonb,last_safe_error=NULL,attempt_count=attempt_count+1,updated_at=now()
         WHERE id=$1 AND lease_owner=$2 AND state IN ('prepared','uploading','retry_wait','object_confirmed')`,
        [row.id, leaseOwner, head.etag ?? null, head.size, JSON.stringify({
          content_type: head.httpMetadata?.contentType ?? null,
          intent_marker_present: intentMarker === row.id,
          document_marker_present: documentMarker === row.document_id,
          checksum_marker_present: checksumMarker === row.checksum_sha256,
        })],
      );
      await lifecycle.finalize(row.id);
      finalized += 1;
    } catch (error) {
      if (isTerminalMediaFinalizeError(error)) {
        quarantined += 1;
        await pool.query(
          `UPDATE documents.media_upload_intents
           SET state='quarantined',last_safe_error=$3,lease_owner=NULL,lease_expires_at=NULL,
               attempt_count=attempt_count+1,updated_at=now()
           WHERE id=$1 AND lease_owner=$2 AND state <> 'finalized'`,
          [row.id, leaseOwner, safeOutboxLastError(error).slice(0, 500)],
        );
      } else {
        pending += 1;
        await releaseMediaLease(pool, row.id, leaseOwner, safeOutboxLastError(error));
      }
    }
  }
  // Continue immediately only when this batch made terminal progress. A full
  // batch of the same missing/transient objects waits for Cron/backoff instead
  // of self-requeueing forever.
  if (selectedCount === limit && finalized + quarantined > 0) await jobs.send({ kind: "media" });
  return { leased: rows.length, finalized, quarantined, pending };
}

async function releaseMediaLease(pool: Pool, intentId: string, leaseOwner: string, safeError: string): Promise<void> {
  await pool.query(
    `UPDATE documents.media_upload_intents
     SET state=CASE WHEN state='object_confirmed' THEN 'object_confirmed' ELSE 'retry_wait' END,
         lease_owner=NULL,
         lease_expires_at=now() + make_interval(secs => LEAST(300, 5 * (2 ^ LEAST(attempt_count, 6)))),
         attempt_count=attempt_count+1,last_safe_error=$3,updated_at=now()
     WHERE id=$1 AND lease_owner=$2 AND state IN ('prepared','uploading','retry_wait','object_confirmed')`,
    [intentId, leaseOwner, safeError.slice(0, 500)],
  );
}

function isTerminalMediaFinalizeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 403 || statusCode === 404 || statusCode === 409;
}

export async function readPublishedEvent(pool: PoolLike, eventId: string): Promise<{ event_id: string; event_type: string } | null> {
  const result = await pool.query<{ event_id: string; event_type: string }>(
    `SELECT event_id, event_type FROM platform.outbox_events WHERE event_id = $1 AND status = 'published'`,
    [eventId],
  );
  return result.rows[0] ?? null;
}

export interface OperationalLag {
  outbox_pending: number;
  outbox_oldest_pending_seconds: number;
  outbox_dead_letter: number;
  attendance_open_sessions: number;
  coordinate_purge_due: number;
}

export async function readOperationalLag(pool: PoolLike): Promise<OperationalLag> {
  const result = await pool.query<OperationalLag>(
    `SELECT
       (SELECT count(*)::integer FROM platform.outbox_events WHERE status IN ('pending', 'retry')) AS outbox_pending,
       (SELECT COALESCE(GREATEST(EXTRACT(EPOCH FROM now() - min(created_at)), 0), 0)::integer
          FROM platform.outbox_events WHERE status IN ('pending', 'retry')) AS outbox_oldest_pending_seconds,
       (SELECT count(*)::integer FROM platform.outbox_events WHERE status = 'dead_letter') AS outbox_dead_letter,
       (SELECT count(*)::integer FROM attendance.sessions WHERE closed_at IS NULL AND deleted_at IS NULL) AS attendance_open_sessions,
       (SELECT count(*)::integer FROM attendance.location_evidence
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            AND coordinates_expire_at IS NOT NULL AND coordinates_expire_at <= now()
            AND coordinates_purged_at IS NULL) AS coordinate_purge_due`,
  );
  const lag = result.rows[0];
  if (!lag) throw new Error("Operational lag query returned no row.");
  return lag;
}
