import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { getLocalDemoPassword } from "#auth";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "./real-infra.js";

type LoginResult = {
  token: string;
  user: {
    id: string;
    employee_code: string;
    full_name: string;
    department_id?: string;
    designation_id?: string;
  };
};

const localDemoPassword = getLocalDemoPassword();

describe("production user-flow smoke", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("covers key employee, manager, admin, and reporting flows through the API", async () => {
    const employee = await loginByEmail("e1@example.test");
    const peer = await loginByEmail("e2@example.test");
    const manager = await loginAs(app, "D1");
    const admin = await loginByEmail("admin@example.test");

    const session = await requestJson("GET", "/api/v1/auth/me", employee.token);
    expect(session.user).toMatchObject({
      id: employee.user.id,
      employee_code: "E1"
    });
    expect(session.navigation.map((item: { key: string }) => item.key)).toContain("dashboard");

    const employeeDirectory = await requestJson("GET", "/api/v1/core/users?page=1&page_size=10&sort=employee_code", admin.token);
    expect(employeeDirectory.items.map((user: { employee_code: string }) => user.employee_code)).toEqual(expect.arrayContaining(["ADM", "D1", "E1", "E2"]));

    const employeeDetail = await requestJson("GET", `/api/v1/core/users/${employee.user.id}`, manager.token);
    expect(employeeDetail).toMatchObject({
      id: employee.user.id,
      manager: { employee_code: "D1" }
    });

    const segment = await requestJson("POST", "/api/v1/timesheets/work-segments", employee.token, {
      work_date: "2026-06-02",
      project_code: "PRJ-100",
      task_code: "DEV",
      hours: "8.00",
      billable: true
    });
    expect(segment).toMatchObject({ work_date: "2026-06-02", hours: "8.00" });

    const timesheet = await requestJson("POST", "/api/v1/timesheets/submissions", employee.token, {
      cycle_start: "2026-06-01",
      cycle_end: "2026-06-05"
    });
    expect(timesheet).toMatchObject({ status: "Pending Approval" });

    const expense = await requestJson("POST", "/api/v1/expenses", employee.token, projectTravelPayload);
    expect(expense).toMatchObject({ requester_user_id: employee.user.id, status: "Pending Manager Verification" });

    const dashboard = await requestJson("GET", "/api/v1/dashboard/summary", manager.token);
    expect(dashboard.approvals.expense_manager_pending).toBeGreaterThanOrEqual(1);
    expect(dashboard.approvals.timesheet_pending).toBeGreaterThanOrEqual(1);

    const checkIn = await requestJson("POST", "/api/v1/attendance/punches", employee.token, {
      event_type: "check_in",
      occurred_at: "2026-06-02T09:15:00.000Z",
      work_mode: "office"
    });
    expect(checkIn.day_status).toMatchObject({ work_date: "2026-06-02" });

    const checkOut = await requestJson("POST", "/api/v1/attendance/punches", employee.token, {
      event_type: "check_out",
      occurred_at: "2026-06-02T18:10:00.000Z",
      work_mode: "office"
    });
    expect(checkOut.day_status.work_minutes).toBeGreaterThan(500);

    const leave = await requestJson("POST", "/api/v1/leave/requests", employee.token, {
      leave_type: "casual",
      date_from: "2026-06-08",
      date_to: "2026-06-08",
      reason: "Family appointment"
    });
    expect(leave.request).toMatchObject({
      employee_user_id: employee.user.id,
      status: "pending_manager",
      current_approver_user_id: manager.user.id
    });

    const leaveDecision = await requestJson("POST", `/api/v1/leave/requests/${leave.request_id}/decision`, manager.token, {
      decision: "approve",
      expected_version: leave.request.version
    });
    expect(leaveDecision).toMatchObject({ status: "approved" });

    const profileChange = await requestJson("POST", "/api/v1/ems/profile-change-requests", employee.token, {
      field_key: "current_address",
      new_value: "Phase 6 E2E Address",
      reason: "Production smoke verification"
    });
    expect(profileChange.request).toMatchObject({ status: "pending" });

    const emsDecision = await requestJson("POST", `/api/v1/ems/profile-change-requests/${profileChange.request_id}/decision`, admin.token, {
      decision: "approved",
      expected_version: profileChange.request.version
    });
    expect(emsDecision).toMatchObject({ status: "approved" });

    const projectCreate = await requestJson("POST", "/api/v1/projects", admin.token, {
      project_code: "E2E-PROJ",
      name: "E2E Portfolio Readiness",
      client_name: "QA Client",
      project_type: "client",
      billing_type: "hourly",
      manager_user_id: manager.user.id,
      start_date: "2026-06-01",
      end_date: "2026-09-30",
      status: "active",
      estimated_hours: "800.00",
      estimated_budget: "160000.00",
      priority: "high"
    });
    expect(projectCreate.project).toMatchObject({ project_code: "E2E-PROJ", version: 1 });

    const member = await requestJson("POST", `/api/v1/projects/${projectCreate.project.id}/members`, manager.token, {
      user_id: peer.user.id,
      project_role: "Engineer",
      allocation_percent: 75,
      billable: true,
      start_date: "2026-06-01",
      expected_version: projectCreate.project.version
    });
    expect(member.member).toMatchObject({ employee_user_id: peer.user.id, allocation_percent: 75 });

    const utilization = await requestJson("GET", "/api/v1/team-utilization/summary?page=1&page_size=25&date_from=2026-06-01&date_to=2026-06-30", admin.token);
    expect(utilization.employees.some((item: { user: { id: string } }) => item.user.id === peer.user.id)).toBe(true);

    const ticket = await requestJson("POST", "/api/v1/helpdesk/tickets", employee.token, {
      category_key: "IT",
      sub_category: "vpn",
      subject: "E2E VPN issue",
      description: "VPN smoke ticket for production readiness.",
      priority: "High"
    });
    expect(ticket.ticket).toMatchObject({
      requester_user_id: employee.user.id,
      status: "assigned"
    });

    const notifications = await requestJson("GET", "/api/v1/notifications?page=1&page_size=10", employee.token);
    expect(notifications.items.length).toBeGreaterThanOrEqual(1);

    const markAll = await requestJson("POST", "/api/v1/notifications/read-all", employee.token, {});
    expect(markAll.unread_count).toBe(0);

    for (const path of [
      "/api/v1/reports/attendance/summary?page=1&page_size=10",
      "/api/v1/reports/leave-wfh/summary?page=1&page_size=10",
      "/api/v1/reports/projects/summary?page=1&page_size=10",
      "/api/v1/reports/helpdesk/summary?page=1&page_size=10"
    ]) {
      const report = await requestJson("GET", path, admin.token);
      expect(report).toMatchObject({ page: 1, page_size: 10 });
      expect(report.totals).toBeDefined();
    }

    const reportExport = await requestJson("POST", "/api/v1/reports/exports", admin.token, {
      report_type: "projects/summary",
      format: "csv",
      filters: { status: "active" }
    });
    expect(reportExport).toMatchObject({
      report_type: "projects/summary",
      status: "ready",
      adapter: `${app.store.objectStorage?.kind}-generated-csv`,
      download_document_id: expect.any(String)
    });
  });

  async function loginByEmail(email: string): Promise<LoginResult> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: localDemoPassword }
    });
    expectOk(response, `login ${email}`);
    const body = response.json() as { access_token: string; user: LoginResult["user"] };
    return { token: body.access_token, user: body.user };
  }

  async function requestJson(method: "GET" | "POST" | "PATCH" | "PUT", url: string, token: string, payload?: Record<string, unknown>): Promise<any> {
    const options = {
      method,
      url,
      headers: authHeader(token),
      ...(payload === undefined ? {} : { payload })
    };
    const response = await app.inject(options);
    expectOk(response, `${method} ${url}`);
    return response.json();
  }
});

function expectOk(response: LightMyRequestResponse, label: string): void {
  expect(response.statusCode, `${label}: ${response.statusCode} ${response.body}`).toBe(200);
}
