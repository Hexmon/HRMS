import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("notifications", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists owned notifications and marks one or all as read", async () => {
    const employee = await loginAs(app, "E1");
    const otherEmployee = await loginAs(app, "E2");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(list.statusCode).toBe(200);
    const firstNotification = list.json().items[0];
    expect(firstNotification).toMatchObject({
      title: "High priority ticket update",
      category: "alert",
      read: false,
      version: 1
    });

    const count = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/unread-count",
      headers: authHeader(employee.token)
    });
    expect(count.statusCode).toBe(200);
    expect(count.json().unread_count).toBeGreaterThanOrEqual(1);

    const forbidden = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${firstNotification.id}/read`,
      headers: authHeader(otherEmployee.token),
      payload: { expected_version: firstNotification.version }
    });
    expect(forbidden.statusCode).toBe(404);

    const read = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${firstNotification.id}/read`,
      headers: authHeader(employee.token),
      payload: { expected_version: firstNotification.version }
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().notification).toMatchObject({ read: true, version: 2 });

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${firstNotification.id}/read`,
      headers: authHeader(employee.token),
      payload: { expected_version: firstNotification.version }
    });
    expect(stale.statusCode).toBe(409);

    const all = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/read-all",
      headers: authHeader(employee.token),
      payload: {}
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().unread_count).toBe(0);
    expect(all.json().has_more).toBe(false);
  });

  it("revalidates reviewer authority after concurrent role revocation and company transfer", async () => {
    const employee = await loginAs(app, "E1");
    const reviewer = await loginAs(app, "D1");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": `notification-race-${randomUUID()}`,
      },
      payload: projectTravelPayload,
    });
    expect(created.statusCode, created.body).toBe(200);
    const ticketId = created.json().id as string;
    const notification = (await pool.query<{ id: string }>(
      `SELECT id FROM platform.notifications
       WHERE target_user_id=$1 AND payload->>'ticket_id'=$2 AND status='pending'
       ORDER BY created_at DESC,id DESC LIMIT 1`,
      [reviewer.user.id, ticketId],
    )).rows[0];
    expect(notification).toBeDefined();
    if (!notification) throw new Error("Reviewer notification fixture required");

    const roleRevocation = await pool.connect();
    try {
      await roleRevocation.query("BEGIN");
      await roleRevocation.query(
        "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Reviewer'",
        [reviewer.user.id],
      );
      const markDuringRevocation = app.inject({
        method: "POST",
        url: `/api/v1/notifications/${notification.id}/read`,
        headers: authHeader(reviewer.token),
        payload: { expected_version: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await roleRevocation.query("COMMIT");
      const denied = await markDuringRevocation;
      expect(denied.statusCode, denied.body).toBe(404);
    } finally {
      await roleRevocation.query("ROLLBACK").catch(() => undefined);
      roleRevocation.release();
    }
    expect((await pool.query(
      "SELECT status,version,read_at FROM platform.notifications WHERE id=$1",
      [notification.id],
    )).rows[0]).toMatchObject({ status: "pending", version: 1, read_at: null });
    await pool.query(
      "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Reviewer'",
      [reviewer.user.id],
    );

    const companyA = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [reviewer.user.id],
    )).rows[0]?.company_id;
    if (!companyA) throw new Error("Reviewer company fixture required");
    const companyB = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles (id,company_name,company_slug,status)
       VALUES ($1,'Notification Race Company',$2,'active')`,
      [companyB, `notification-race-${companyB}`],
    );
    const transfer = await pool.connect();
    try {
      await transfer.query("BEGIN");
      await transfer.query(
        `UPDATE platform.user_session_preferences
         SET company_id=$2,version=version+1 WHERE user_id=$1`,
        [reviewer.user.id, companyB],
      );
      const markDuringTransfer = app.inject({
        method: "POST",
        url: `/api/v1/notifications/${notification.id}/read`,
        headers: authHeader(reviewer.token),
        payload: { expected_version: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transfer.query("COMMIT");
      const denied = await markDuringTransfer;
      expect(denied.statusCode, denied.body).toBe(404);
    } finally {
      await transfer.query("ROLLBACK").catch(() => undefined);
      transfer.release();
    }
    expect((await pool.query(
      "SELECT status,version,read_at FROM platform.notifications WHERE id=$1",
      [notification.id],
    )).rows[0]).toMatchObject({ status: "pending", version: 1, read_at: null });
    await pool.query(
      `UPDATE platform.user_session_preferences
       SET company_id=$2,version=version+1 WHERE user_id=$1`,
      [reviewer.user.id, companyA],
    );
  });
});
