import { Pool } from "pg";
import type { MemoryDataStore } from "../platform/data-store.js";
import { AttendanceCommandService } from "../modules/attendance/command-service.js";
import { AttendanceCoordinatePurgeWorker } from "./attendance-coordinate-purge-worker.js";
import { safeOutboxLastError } from "./safe-error.js";

export const OUTBOX_BATCH_SIZE = 50;
export const ATTENDANCE_BATCH_SIZE = 25;
export const PURGE_BATCH_SIZE = 500;

export type JobMessage =
  | { kind: "outbox" }
  | { kind: "attendance"; referenceIso: string; cursor?: { checkedInAt: string; sessionId: string } }
  | { kind: "purge" };

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
