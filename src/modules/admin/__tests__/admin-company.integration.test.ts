import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin company profile", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("allows Admin to read and update company profile with optimistic concurrency", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbiddenRead = await app.inject({
      method: "GET",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(employee.token)
    });
    expect(forbiddenRead.statusCode).toBe(403);

    const read = await app.inject({
      method: "GET",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token)
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      company_name: "Hawkaii HRMS",
      timezone: "Asia/Kolkata",
      fiscal_year_start_month: 4,
      version: 1
    });

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token),
      payload: {
        company_name: "Hawkaii HRMS India",
        website: "https://hawkaii.com",
        industry: "Software / SaaS",
        address: "Bengaluru",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        currency: "INR",
        fiscal_year_start_month: 4,
        working_week: "Mon-Fri",
        work_hours_per_day: 8.5,
        logo_label: "HK",
        expected_version: read.json().version
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      company_name: "Hawkaii HRMS India",
      website: "https://hawkaii.com",
      work_hours_per_day: 8.5,
      version: 2
    });
    expect(app.store.outbox.at(-1)).toMatchObject({
      aggregate_type: "company_profile",
      aggregate_id: update.json().id,
      event_type: "admin.company_profile.updated",
      payload: expect.objectContaining({
        actor_user_id: admin.user.id,
        company_name: "Hawkaii HRMS India"
      })
    });

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token),
      payload: {
        company_name: "Stale Update",
        expected_version: 1
      }
    });
    expect(stale.statusCode).toBe(409);

    const forbiddenWrite = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(employee.token),
      payload: {
        company_name: "Not allowed",
        expected_version: 2
      }
    });
    expect(forbiddenWrite.statusCode).toBe(403);
  });
});
