import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authHeader, loginAs } from "#testing";
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

  it("fails closed when an authenticated administrator has no active company context", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool;
    expect(pool).not.toBeNull();
    if (!pool) throw new Error("PostgreSQL pool required");
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=NULL WHERE user_id=$1",
      [admin.user.id],
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(admin.token),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("COMPANY_CONTEXT_REQUIRED");
  });

  it("returns role-scoped operational metrics from implemented modules only", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");

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

    const pool = app.store.pgPool;
    expect(pool).not.toBeNull();
    if (!pool) throw new Error("PostgreSQL pool required");
    const company = await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [employee.user.id],
    );
    const companyId = company.rows[0]?.company_id;
    expect(companyId).toBeTruthy();
    if (!companyId) throw new Error("Employee company fixture required");
    const ticketId = randomUUID();
    const ticketFixture = await pool.connect();
    try {
      await ticketFixture.query("BEGIN");
      await ticketFixture.query("SELECT set_config('app.expense_command_v1','on',true)");
      await ticketFixture.query(
        `INSERT INTO expenses.expense_tickets
          (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
           expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
           estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
           context_payload,company_id,owner_resolution_status)
         VALUES ($1,$2,$3,'Employee',$4,'Project','Project Travel','Dashboard fixture',
           'Durable PostgreSQL dashboard fixture',CURRENT_DATE,CURRENT_DATE,100,'Advance',
           $5,$6,'Pending Manager Verification',jsonb_build_object('company_id',$7::text),
           $7::uuid,'typed_creation')`,
        [
          ticketId,
          `EXP-DASH-${ticketId}`,
          employee.user.id,
          employee.user.department_id,
          manager.user.id,
          finance.user.id,
          companyId,
        ],
      );
      await ticketFixture.query("COMMIT");
    } catch (error) {
      await ticketFixture.query("ROLLBACK");
      throw error;
    } finally {
      ticketFixture.release();
    }

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
    expect(body.approvals.timesheet_pending).toBe(0);
    expect(body.workload.submitted_hours_total).toBe("0.00");
    expect(body.cards.map((card: { key: string }) => card.key)).toEqual(
      expect.arrayContaining(["active_employees", "pending_expense_approvals", "pending_timesheet_approvals", "pending_leave_wfh_approvals", "attendance_exceptions"])
    );
    expect(body.unavailable_features.map((feature: { key: string }) => feature.key)).toEqual(
      expect.arrayContaining([
        "timesheets_historical_ownership",
        "leave_wfh_historical_ownership",
        "assets_historical_ownership",
        "notifications_historical_ownership",
        "helpdesk",
        "projects_utilization",
      ])
    );
    expect(body.unavailable_features.map((feature: { key: string }) => feature.key)).not.toContain("attendance");
    expect(body.unavailable_features.map((feature: { key: string }) => feature.key)).not.toContain("leave_wfh_holidays");
  });
});
