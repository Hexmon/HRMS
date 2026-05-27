import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Redis as Valkey } from "iovalkey";
import { Pool } from "pg";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "./real-infra.js";
import { OutboxWorker, ValkeyStreamPublisher } from "../workers/outbox-worker.js";

describe("release acceptance real adapters", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("persists expense workflow state, line items, approvals, and immutable audit across API restart", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload
    });
    expect(create.statusCode).toBe(200);
    const ticket = create.json();

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);

    const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    const pool = new Pool({ connectionString: databaseUrl });
    const persisted = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM expenses.expense_line_items WHERE ticket_id = $1) AS line_items,
        (SELECT count(*)::int FROM expenses.expense_approvals WHERE ticket_id = $1) AS approvals,
        (SELECT count(*)::int FROM expenses.expense_audit_logs WHERE ticket_id = $1) AS audits`,
      [ticket.id]
    );
    expect(persisted.rows[0]).toMatchObject({ line_items: 2, approvals: 1 });
    expect(persisted.rows[0].audits).toBeGreaterThanOrEqual(3);
    await expect(
      pool.query("UPDATE expenses.expense_audit_logs SET remarks = 'tamper' WHERE ticket_id = $1", [ticket.id])
    ).rejects.toThrow(/immutable audit\/log rows/u);
    await pool.end();

    await app.close();
    app = await buildRealApp({ reset: false });
    await app.ready();
    const finance = await loginAs(app, "N1");
    const reloaded = await app.inject({
      method: "GET",
      url: `/api/v1/expenses/${ticket.id}`,
      headers: authHeader(finance.token)
    });
    expect(reloaded.statusCode).toBe(200);
    expect(reloaded.json().status).toBe("Manager Verified");
    expect(reloaded.json().version).toBe(2);
  });

  it("publishes transactional outbox events to Valkey Streams with retry visibility", async () => {
    const employee = await loginAs(app, "E1");
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload
    });
    expect(create.statusCode).toBe(200);

    const failingWorker = new OutboxWorker(app.store, {
      async publish() {
        throw new Error("simulated valkey outage");
      }
    });
    const failed = await failingWorker.publishPending(1);
    expect(failed.published).toBe(0);
    await app.store.pgPool?.query("UPDATE platform.outbox_events SET available_at = now() WHERE status = 'retry'");

    const valkeyUrl = process.env.VALKEY_URL;
    if (!valkeyUrl) {
      throw new Error("VALKEY_URL is required for outbox integration test.");
    }
    const publisher = new ValkeyStreamPublisher(valkeyUrl);
    const worker = new OutboxWorker(app.store, publisher);
    const result = await worker.publishPending(20);
    publisher.close();
    expect(result.published).toBeGreaterThanOrEqual(1);

    const valkey = new Valkey(valkeyUrl);
    const streams = await valkey.keys("hrms.*");
    expect(streams.length).toBeGreaterThanOrEqual(1);
    await valkey.quit();
  });
});
