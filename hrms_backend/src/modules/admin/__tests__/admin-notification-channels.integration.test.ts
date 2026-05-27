import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin notification channels", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists notification channel settings for admins only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/notification-channels",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/notification-channels?module=leave_wfh",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ version: 1 });
    expect(list.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_key: "leave_requested",
          key: "leave_requested",
          label: "Leave requested",
          in_app_enabled: true,
          inApp: true,
          email_enabled: true,
          email: true,
          push_enabled: false,
          push: false,
          active: true,
          version: 1
        })
      ])
    );
  });

  it("updates channel preferences with OCC", async () => {
    const admin = await loginAs(app, "ADM");

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/notification-channels",
      headers: authHeader(admin.token),
      payload: {
        channels: [
          {
            event_key: "leave_requested",
            email_enabled: false,
            push_enabled: true
          }
        ],
        expected_version: 1
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ version: 2 });
    expect(update.json().channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_key: "leave_requested",
          email_enabled: false,
          email: false,
          push_enabled: true,
          push: true,
          version: 2
        })
      ])
    );

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/notification-channels",
      headers: authHeader(admin.token),
      payload: {
        channels: [{ event_key: "leave_requested", email_enabled: true }],
        expected_version: 1
      }
    });
    expect(stale.statusCode).toBe(409);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.notification_channels.updated");
  });
});
