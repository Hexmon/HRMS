import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin email templates", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists email templates for admins only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/email-templates",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/email-templates?module=auth&locale=en-IN",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          template_key: "invite",
          key: "invite",
          name: "Employee Invite",
          locale: "en-IN",
          active: true,
          version: 1
        })
      ])
    );
    expect(list.json().versions.invite).toBe(1);
  });

  it("updates templates with OCC and active toggle", async () => {
    const admin = await loginAs(app, "ADM");

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/email-templates/invite",
      headers: authHeader(admin.token),
      payload: {
        subject: "Welcome to {{company}}",
        body: "Hi {{name}},\n\nUse {{link}} to join.",
        active: false,
        expected_version: 1
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().template).toMatchObject({
      template_key: "invite",
      subject: "Welcome to {{company}}",
      body: "Hi {{name}},\n\nUse {{link}} to join.",
      active: false,
      status: "inactive",
      version: 2
    });

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/email-templates/invite",
      headers: authHeader(admin.token),
      payload: {
        subject: "Stale",
        expected_version: 1
      }
    });
    expect(stale.statusCode).toBe(409);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.email_template.updated");
  });
});
