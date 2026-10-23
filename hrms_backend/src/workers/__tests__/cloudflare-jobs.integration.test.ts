import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildRealApp } from "../../__tests__/real-infra.js";
import { authHeader, loginAs } from "#testing";
import { drainOutbox, readOperationalLag, type JobMessage, type JobQueue } from "../cloudflare-jobs.js";

describe("Cloudflare outbox drain against PostgreSQL", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildRealApp(); });
  afterEach(async () => { await app.close(); });

  it("publishes once, and a stale API flush cannot revert published state", async () => {
    const lagBefore = await readOperationalLag(app.store.pgPool!);
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
    expect((await readOperationalLag(app.store.pgPool!)).outbox_pending).toBe(lagBefore.outbox_pending + 1);
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
    expect((await readOperationalLag(app.store.pgPool!)).outbox_pending).toBe(lagBefore.outbox_pending);
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

  it("does not publish the same row twice when Queue consumers drain concurrently", async () => {
    const eventId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3)`,
      [eventId, randomUUID(), `cloudflare-concurrent:${eventId}`],
    );
    let enteredSend!: () => void;
    let finishSend!: () => void;
    const sending = new Promise<void>((resolve) => { enteredSend = resolve; });
    const release = new Promise<void>((resolve) => { finishSend = resolve; });
    const delivered: string[] = [];
    const events: JobQueue = { send: async (value) => {
      if (value.kind !== "event") return;
      delivered.push(value.eventId);
      enteredSend();
      await release;
    } };
    const jobs: JobQueue = { send: async () => undefined };
    const first = drainOutbox(app.store.pgPool!, events, jobs);
    await sending;
    const second = await drainOutbox(app.store.pgPool!, events, jobs);
    expect(second.published).toBe(0);
    finishSend();
    expect((await first).published).toBe(1);
    expect(delivered).toEqual([eventId]);
  });

  it("replays the same event ID after Queue acceptance has an ambiguous result", async () => {
    const eventId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3)`,
      [eventId, randomUUID(), `cloudflare-ambiguous:${eventId}`],
    );
    const delivered: string[] = [];
    const jobs: JobQueue = { send: async () => undefined };
    const ambiguous: JobQueue = { send: async (value) => {
      if (value.kind === "event") delivered.push(value.eventId);
      throw new Error("accepted but acknowledgement lost");
    } };
    expect((await drainOutbox(app.store.pgPool!, ambiguous, jobs)).retried).toBe(1);
    await app.store.pgPool!.query("UPDATE platform.outbox_events SET available_at = now() WHERE event_id = $1", [eventId]);
    const healthy: JobQueue = { send: async (value) => {
      if (value.kind === "event") delivered.push(value.eventId);
    } };
    expect((await drainOutbox(app.store.pgPool!, healthy, jobs)).published).toBe(1);
    expect(delivered).toEqual([eventId, eventId]);
  });

  it("dead-letters an exhausted row without stopping another tenant's event", async () => {
    const exhaustedId = randomUUID();
    const healthyId = randomUUID();
    for (const [eventId, retryCount] of [[exhaustedId, 4], [healthyId, 0]] as const) {
      await app.store.pgPool!.query(
        `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, retry_count)
         VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3, $4)`,
        [eventId, randomUUID(), `cloudflare-tenant:${eventId}`, retryCount],
      );
    }
    const delivered: string[] = [];
    const events: JobQueue = { send: async (value) => {
      if (value.kind !== "event") return;
      if (value.eventId === exhaustedId) throw new Error("tenant-specific rejection");
      delivered.push(value.eventId);
    } };
    const jobs: JobQueue = { send: async () => undefined };
    expect(await drainOutbox(app.store.pgPool!, events, jobs)).toEqual({
      published: 1, retried: 0, deadLettered: 1,
    });
    const state = await app.store.pgPool!.query<{ event_id: string; status: string }>(
      "SELECT event_id, status FROM platform.outbox_events WHERE event_id = ANY($1::uuid[])",
      [[exhaustedId, healthyId]],
    );
    expect(Object.fromEntries(state.rows.map((row) => [row.event_id, row.status]))).toEqual({
      [exhaustedId]: "dead_letter", [healthyId]: "published",
    });
    expect(delivered).toEqual([healthyId]);
    await app.store.pgPool!.query(
      `UPDATE platform.outbox_events
       SET status = 'retry', retry_count = 0, available_at = now()
       WHERE event_id = $1 AND status = 'dead_letter'`,
      [exhaustedId],
    );
    const recovered: JobQueue = { send: async (value) => {
      if (value.kind === "event") delivered.push(value.eventId);
    } };
    expect((await drainOutbox(app.store.pgPool!, recovered, jobs)).published).toBe(1);
    expect(delivered).toEqual([healthyId, exhaustedId]);
  });

  it("drains a backlog through bounded continuation messages", async () => {
    const backlogSize = 121;
    const batchLimit = 17;
    await app.store.pgPool!.query(
      `INSERT INTO platform.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       SELECT 'expenses', gen_random_uuid(), 'expenses.approved', '{}'::jsonb,
              'cloudflare-backlog:' || gen_random_uuid()::text
       FROM generate_series(1, $1::integer)`,
      [backlogSize],
    );
    const jobsToRun: JobMessage[] = [{ kind: "outbox" }];
    const publishedIds = new Set<string>();
    const events: JobQueue = { send: async (value) => {
      if (value.kind === "event") publishedIds.add(value.eventId);
    } };
    const jobs: JobQueue = { send: async (value) => {
      if (value.kind !== "event") jobsToRun.push(value);
    } };
    let invocations = 0;
    while (jobsToRun.length > 0) {
      const job = jobsToRun.shift();
      if (job?.kind !== "outbox") throw new Error("unexpected continuation");
      const result = await drainOutbox(app.store.pgPool!, events, jobs, batchLimit);
      expect(result.published).toBeLessThanOrEqual(batchLimit);
      invocations += 1;
      if (invocations > 20) throw new Error("outbox continuation did not terminate");
    }
    expect(invocations).toBe(Math.ceil(backlogSize / batchLimit));
    expect(publishedIds.size).toBe(backlogSize);
    expect((await readOperationalLag(app.store.pgPool!)).outbox_pending).toBe(0);
  });

  it("leaves an event pending through a database outage for the next Cron sweep", async () => {
    const eventId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ($1, 'expenses', $2, 'expenses.approved', '{}'::jsonb, $3)`,
      [eventId, randomUUID(), `cloudflare-db-outage:${eventId}`],
    );
    const published: string[] = [];
    const events: JobQueue = { send: async (value) => {
      if (value.kind === "event") published.push(value.eventId);
    } };
    const jobs: JobQueue = { send: async () => undefined };
    const offlinePool = {
      connect: async () => { throw new Error("Neon temporarily unavailable"); },
      query: app.store.pgPool!.query.bind(app.store.pgPool!),
    } as unknown as Parameters<typeof drainOutbox>[0];
    await expect(drainOutbox(offlinePool, events, jobs)).rejects.toThrow("Neon temporarily unavailable");
    expect(published).toEqual([]);
    expect((await readOperationalLag(app.store.pgPool!)).outbox_pending).toBe(1);
    expect((await drainOutbox(app.store.pgPool!, events, jobs)).published).toBe(1);
    expect(published).toEqual([eventId]);
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

  it("shows a worker-updated day in dashboard and attendance reports", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = app.store.userSessionPreferences.find((item) => item.user_id === employee.user.id)?.company_id;
    expect(companyId).toBeTruthy();
    const headers = authHeader(employee.token);
    const reportUrl = "/api/v1/reports/attendance/summary?date_from=2026-05-20&date_to=2026-05-20";
    const before = await app.inject({ method: "GET", url: reportUrl, headers });
    expect(before.statusCode).toBe(200);
    expect(before.json().items).toHaveLength(0);

    await app.store.pgPool!.query(
      `INSERT INTO attendance.daily_records (
         company_id, employee_user_id, work_date, status,
         first_check_in, last_check_out, exception_type
       ) VALUES ($1, $2, '2026-05-20', 'present',
         '2026-05-20T09:00:00Z', '2026-05-20T18:00:00Z', 'missing_punch')`,
      [companyId, employee.user.id],
    );
    const fresh = await app.store.persistence!.attendanceReadStore!({ companyId: companyId! });
    expect(fresh.attendanceDayRecords).toEqual([
      expect.objectContaining({ employee_user_id: employee.user.id, work_date: "2026-05-20" }),
    ]);
    const report = await app.inject({ method: "GET", url: reportUrl, headers });
    expect(report.statusCode).toBe(200);
    expect(report.json().items, JSON.stringify(report.json())).toEqual([
      expect.objectContaining({ employee_user_id: employee.user.id, out_time: "18:00" }),
    ]);
    const dashboard = await app.inject({ method: "GET", url: "/api/v1/dashboard/summary", headers });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().cards).toContainEqual(
      expect.objectContaining({ key: "attendance_exceptions", value: 1 }),
    );
    const exported = await app.inject({
      method: "POST",
      url: "/api/v1/reports/exports",
      headers,
      payload: { format: "csv", report_type: "attendance", filters: { date_from: "2026-05-20", date_to: "2026-05-20" } },
    });
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.json()).toMatchObject({ report_type: "attendance", row_count: 1 });
  });

  it("shows Worker-published outbox status in dashboard and export detail without an API restart", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = app.store.userSessionPreferences.find((item) => item.user_id === admin.user.id)?.company_id;
    expect(companyId).toBeTruthy();
    const eventId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.outbox_events (
         event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
       ) VALUES ($1, 'report_export', $2, 'reports.export.requested', $3::jsonb, $4)`,
      [eventId, companyId, JSON.stringify({ actor_user_id: admin.user.id, company_id: companyId, report_type: "attendance", format: "csv", status: "ready" }), `fresh-export:${eventId}`],
    );
    const headers = authHeader(admin.token);
    const dashboardUrl = "/api/v1/dashboard/summary";
    const exportUrl = `/api/v1/reports/exports/${companyId}`;
    const pendingDashboard = await app.inject({ method: "GET", url: dashboardUrl, headers });
    expect(pendingDashboard.statusCode).toBe(200);
    expect(pendingDashboard.json().operations.outbox_pending).toBe(1);
    const pendingExport = await app.inject({ method: "GET", url: exportUrl, headers });
    expect(pendingExport.statusCode).toBe(200);
    expect(pendingExport.json().outbox_status).toBe("pending");

    const accepted: JobQueue = { send: async () => undefined };
    expect((await drainOutbox(app.store.pgPool!, accepted, accepted)).published).toBe(1);
    const publishedDashboard = await app.inject({ method: "GET", url: dashboardUrl, headers });
    expect(publishedDashboard.json().operations.outbox_pending).toBe(0);
    const publishedExport = await app.inject({ method: "GET", url: exportUrl, headers });
    expect(publishedExport.json().outbox_status).toBe("published");
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
