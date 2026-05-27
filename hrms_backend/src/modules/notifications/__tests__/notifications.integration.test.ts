import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
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
  });
});
