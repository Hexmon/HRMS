import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("dashboard summary API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary"
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns role-scoped operational metrics from implemented modules only", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");

    const segment = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/work-segments",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-04",
        project_code: "PRJ-100",
        task_code: "DEV",
        hours: "8.00",
        billable: true
      }
    });
    expect(segment.statusCode).toBe(200);

    const submit = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/submissions",
      headers: authHeader(employee.token),
      payload: { cycle_start: "2026-05-04", cycle_end: "2026-05-08" }
    });
    expect(submit.statusCode).toBe(200);

    const expense = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload
    });
    expect(expense.statusCode).toBe(200);

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(manager.token)
    });

    expect(summary.statusCode).toBe(200);
    const body = summary.json();
    expect(body.scope).toMatchObject({
      employee_code: "D1",
      visibility: "self_and_descendants"
    });
    expect(body.workforce.active_employees).toBeGreaterThanOrEqual(3);
    expect(body.approvals.expense_manager_pending).toBeGreaterThanOrEqual(1);
    expect(body.approvals.timesheet_pending).toBeGreaterThanOrEqual(1);
    expect(body.workload.submitted_hours_total).toBe("8.00");
    expect(body.cards.map((card: { key: string }) => card.key)).toEqual(
      expect.arrayContaining(["active_employees", "pending_expense_approvals", "pending_timesheet_approvals", "pending_leave_wfh_approvals", "attendance_exceptions"])
    );
    expect(body.unavailable_features.map((feature: { key: string }) => feature.key)).toEqual(
      expect.arrayContaining(["helpdesk", "projects_utilization"])
    );
    expect(body.unavailable_features.map((feature: { key: string }) => feature.key)).not.toContain("attendance");
    expect(body.unavailable_features.map((feature: { key: string }) => feature.key)).not.toContain("leave_wfh_holidays");
  });
});
