import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("attendance", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("records punch sequence, returns summaries, and blocks duplicate/out-of-order actions", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");

    const checkIn = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-20T09:40:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().day_status).toMatchObject({
      work_date: "2026-05-20",
      status: "late",
      late_minutes: 10
    });
    expect(checkIn.json().next_allowed_actions).toEqual(["break_start", "check_out"]);

    const checkOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T18:15:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkOut.statusCode).toBe(200);
    expect(checkOut.json().day_status.work_minutes).toBeGreaterThan(500);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T18:20:00.000Z",
        work_mode: "office"
      }
    });
    expect(duplicate.statusCode).toBe(409);

    const punches = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/punches/my?date_from=2026-05-20&date_to=2026-05-20&page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(punches.statusCode).toBe(200);
    expect(punches.json().total).toBe(2);

    const mySummary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/my?month=2026-05&page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(mySummary.statusCode).toBe(200);
    expect(mySummary.json().summary.late).toBeGreaterThanOrEqual(1);
    expect(mySummary.json().week_records).toHaveLength(7);

    const teamSummary = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/summary/team?date_from=2026-05-20&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(teamSummary.statusCode).toBe(200);
    expect(teamSummary.json().totals.total).toBeGreaterThanOrEqual(2);
    expect(teamSummary.json().department_summary[0]).toHaveProperty("attendance_percent");
  });

  it("submits and approves regularization with manager scope, OCC, and exception visibility", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const otherEmployee = await loginAs(app, "E2");

    const request = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/regularizations",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-21",
        reason: "Forgot to punch out after office work.",
        requested_punches: [
          { event_type: "check_in", occurred_at: "2026-05-21T09:05:00.000Z" },
          { event_type: "check_out", occurred_at: "2026-05-21T18:30:00.000Z" }
        ]
      }
    });
    expect(request.statusCode).toBe(200);
    expect(request.json()).toMatchObject({
      employee_user_id: employee.user.id,
      work_date: "2026-05-21",
      status: "pending",
      current_approver_user_id: manager.user.id,
      version: 1
    });

    const exceptions = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/exceptions?date_from=2026-05-21&date_to=2026-05-21&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(exceptions.statusCode).toBe(200);
    expect(exceptions.json().items[0]).toMatchObject({
      request_id: request.json().id,
      exception_type: "correction",
      can_decide: true
    });

    const wrongApprover = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(otherEmployee.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(wrongApprover.statusCode).toBe(403);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      previous_status: "pending",
      next_status: "approved",
      status: "approved",
      version: 2
    });
    expect(approved.json().day_status.status).toBe("present");

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/attendance/regularizations/${request.json().id}/decision`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);

    const calendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/monthly?month=2026-05",
      headers: authHeader(employee.token)
    });
    expect(calendar.statusCode).toBe(200);
    const day = calendar.json().calendar_days.find((item: { work_date: string }) => item.work_date === "2026-05-21");
    expect(day).toMatchObject({ status: "present", regularization_status: "approved" });
  });
});
