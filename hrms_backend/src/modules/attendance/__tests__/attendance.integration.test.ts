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
        occurred_at: "2026-05-20T04:10:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().day_status).toMatchObject({
      work_date: "2026-05-20",
      status: "late",
      late_minutes: 10
    });
    expect(checkIn.json().day_status.in_time).toBe("09:40");
    expect(checkIn.json().next_allowed_actions).toEqual(["break_start", "check_out"]);

    const checkOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-20T12:45:00.000Z",
        work_mode: "office"
      }
    });
    expect(checkOut.statusCode).toBe(200);
    expect(checkOut.json().day_status.work_minutes).toBeGreaterThan(500);
    expect(checkOut.json().day_status.detail).toBe("Late by 10 min");

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

    const lateAfterHour = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_in",
        occurred_at: "2026-05-22T05:35:00.000Z",
        work_mode: "office"
      }
    });
    expect(lateAfterHour.statusCode).toBe(200);
    expect(lateAfterHour.json().day_status.in_time).toBe("11:05");

    const lateAfterHourOut = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/punches",
      headers: authHeader(employee.token),
      payload: {
        event_type: "check_out",
        occurred_at: "2026-05-22T12:45:00.000Z",
        work_mode: "office"
      }
    });
    expect(lateAfterHourOut.statusCode).toBe(200);
    expect(lateAfterHourOut.json().day_status.detail).toBe("Late by 1h 35m");

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

    const dailyCalendar = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/calendar/daily?date=2026-05-20&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(dailyCalendar.statusCode).toBe(200);
    expect(dailyCalendar.json()).toMatchObject({
      date: "2026-05-20",
      page: 1,
      page_size: 10
    });
    expect(dailyCalendar.json().items.some((item: { employee_user_id: string }) => item.employee_user_id === employee.user.id)).toBe(true);
    expect(dailyCalendar.json().summary.late).toBeGreaterThanOrEqual(1);
    expect(dailyCalendar.json().totals.total).toBeGreaterThanOrEqual(2);
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
          { event_type: "check_in", occurred_at: "2026-05-21T03:35:00.000Z" },
          { event_type: "check_out", occurred_at: "2026-05-21T13:00:00.000Z" }
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

    const managerQueue = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/regularizations/queue/manager?date_from=2026-05-21&date_to=2026-05-21&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(managerQueue.statusCode).toBe(200);
    expect(managerQueue.json().items[0]).toMatchObject({
      id: request.json().id,
      status: "pending",
      current_approver_user_id: manager.user.id
    });
    expect(managerQueue.json().queue_counts.pending).toBeGreaterThanOrEqual(1);

    const nonManagerQueue = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/regularizations/queue/manager?date_from=2026-05-21&date_to=2026-05-21&page=1&page_size=10",
      headers: authHeader(otherEmployee.token)
    });
    expect(nonManagerQueue.statusCode).toBe(403);

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

  it("creates document-backed attendance exports for HR/Admin/Auditor roles only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/exports",
      headers: authHeader(admin.token),
      payload: {
        filters: { date_from: "2026-05-01", date_to: "2026-05-31" },
        columns: ["employee_code", "employee", "date", "status"],
        format: "csv"
      }
    });
    expect(exportJob.statusCode).toBe(200);
    expect(exportJob.json()).toMatchObject({
      status: "ready",
      format: "csv",
      adapter: `${app.store.objectStorage?.kind}-generated-csv`,
      download_document_id: expect.any(String)
    });
    await expect(app.store.objectStorage?.statObject(app.store.documents.find((document) => document.id === exportJob.json().download_document_id)?.storage_key ?? "")).resolves.toMatchObject({
      size: expect.any(Number)
    });
    expect(app.store.outbox.some((event) => event.event_type === "attendance.export_requested" && event.aggregate_id === exportJob.json().job_id)).toBe(true);

    const forbiddenExport = await app.inject({
      method: "POST",
      url: "/api/v1/attendance/exports",
      headers: authHeader(employee.token),
      payload: {
        filters: { date_from: "2026-05-01", date_to: "2026-05-31" },
        format: "csv"
      }
    });
    expect(forbiddenExport.statusCode).toBe(403);
  });
});
