import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildRealApp } from "../../__tests__/real-infra.js";
import { authHeader, loginAs } from "#testing";
import { drainOutbox, type JobMessage, type JobQueue } from "../cloudflare-jobs.js";

describe("Cloudflare outbox drain against PostgreSQL", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildRealApp(); });
  afterEach(async () => { await app.close(); });

  it("publishes once, and a stale API flush cannot revert published state", async () => {
    const eventId = randomUUID();
    app.store.outbox.push({
      id: app.store.nextOutboxId++,
      event_id: eventId,
      aggregate_type: "expenses",
      aggregate_id: randomUUID(),
      event_type: "expenses.approved",
      payload: { fixture: true },
      idempotency_key: `cloudflare-test:${eventId}`,
      status: "pending",
      retry_count: 0,
      available_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      published_at: null,
      failed_at: null,
      last_error: null,
    });
    await app.store.persistence!.flush();
    const events: Array<{ kind: "event"; eventId: string }> = [];
    const eventQueue: JobQueue = { send: async (value) => { if (value.kind === "event") events.push(value); } };
    const jobs: JobQueue = { send: async () => undefined };
    const first = await drainOutbox(app.store.pgPool!, eventQueue, jobs);
    expect(first.published).toBe(1);
    expect(events).toEqual([{ kind: "event", eventId }]);

    // Simulates another API request flushing its old hydrated snapshot.
    await app.store.persistence!.flush();
    const persisted = await app.store.pgPool!.query<{ status: string; published_at: Date | null }>(
      "SELECT status, published_at FROM platform.outbox_events WHERE event_id = $1",
      [eventId],
    );
    expect(persisted.rows[0]?.status).toBe("published");
    expect(persisted.rows[0]?.published_at).not.toBeNull();
    expect((await drainOutbox(app.store.pgPool!, eventQueue, jobs)).published).toBe(0);
    expect(events).toHaveLength(1);
  });

  it("keeps a failed Queue send retryable and retries with the same event ID", async () => {
    const eventId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3)`,
      [eventId, randomUUID(), `cloudflare-retry:${eventId}`],
    );
    const jobs: JobQueue = { send: async (_value: JobMessage | { kind: "event"; eventId: string }) => undefined };
    const failed: JobQueue = { send: async () => { throw new Error("Queue unavailable"); } };
    expect((await drainOutbox(app.store.pgPool!, failed, jobs)).retried).toBe(1);
    const retry = await app.store.pgPool!.query<{ status: string; retry_count: number }>(
      "SELECT status, retry_count FROM platform.outbox_events WHERE event_id = $1", [eventId],
    );
    expect(retry.rows[0]).toMatchObject({ status: "retry", retry_count: 1 });
    await app.store.pgPool!.query("UPDATE platform.outbox_events SET available_at = now() WHERE event_id = $1", [eventId]);
    const accepted: string[] = [];
    const healthy: JobQueue = { send: async (value) => { if (value.kind === "event") accepted.push(value.eventId); } };
    expect((await drainOutbox(app.store.pgPool!, healthy, jobs)).published).toBe(1);
    expect(accepted).toEqual([eventId]);
  });

  it("serves a fresh attendance summary after another process writes a punch", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = app.store.userSessionPreferences.find((item) => item.user_id === employee.user.id)?.company_id;
    expect(companyId).toBeTruthy();
    const before = await app.inject({
      method: "GET", url: "/api/v1/attendance/summary/my", headers: authHeader(employee.token),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().today.next_allowed_actions).toContain("check_in");

    await app.store.pgPool!.query(
      `INSERT INTO attendance.punch_events (
         company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, metadata
       ) VALUES ($1, $2, $2, 'check_in', now(), 'office', 'admin', 'system', '{}'::jsonb)`,
      [companyId, employee.user.id],
    );
    const after = await app.inject({
      method: "GET", url: "/api/v1/attendance/summary/my", headers: authHeader(employee.token),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().today.next_allowed_actions).toContain("check_out");
  });

  it("does not let stale daily projections overwrite a newer worker version", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = app.store.userSessionPreferences.find((item) => item.user_id === employee.user.id)?.company_id;
    await app.store.pgPool!.query(
      `INSERT INTO attendance.daily_records (company_id, employee_user_id, work_date, status)
       VALUES ($1, $2, '2026-05-20', 'present')`,
      [companyId, employee.user.id],
    );
    await app.store.persistence!.reload();
    const day = app.store.attendanceDayRecords[0];
    if (!day) throw new Error("seeded attendance day missing");
    await app.store.pgPool!.query(
      `UPDATE attendance.daily_records SET note = 'worker-committed', version = version + 1 WHERE id = $1`,
      [day.id],
    );
    await app.store.persistence!.flush();
    const current = await app.store.pgPool!.query<{ note: string | null }>(
      "SELECT note FROM attendance.daily_records WHERE id = $1", [day.id],
    );
    expect(current.rows[0]?.note).toBe("worker-committed");
  });
});
