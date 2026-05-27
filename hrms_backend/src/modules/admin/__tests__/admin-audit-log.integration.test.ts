import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin audit log", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists admin outbox audit entries for admins and auditors only", async () => {
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const employee = await loginAs(app, "E1");

    const profile = await app.inject({
      method: "GET",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token)
    });
    expect(profile.statusCode).toBe(200);

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token),
      payload: {
        company_name: "Hawkaii HRMS Audit",
        expected_version: profile.json().version
      }
    });
    expect(update.statusCode).toBe(200);

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-log",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-log?module=company&page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ page: 1, page_size: 10, total: 1 });
    expect(list.json().items[0]).toMatchObject({
      actor_user_id: admin.user.id,
      action: "admin.company_profile.updated",
      event_type: "admin.company_profile.updated",
      module: "Company",
      target: "Hawkaii HRMS Audit",
      aggregate_type: "company_profile",
      status: "pending",
      ip: "server"
    });

    const auditorList = await app.inject({
      method: "GET",
      url: `/api/v1/admin/audit-log?actor_user_id=${admin.user.id}`,
      headers: authHeader(auditor.token)
    });
    expect(auditorList.statusCode).toBe(200);
    expect(auditorList.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_user_id: admin.user.id,
          action: "admin.company_profile.updated"
        })
      ])
    );
  });
});
