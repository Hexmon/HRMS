import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendanceEvidenceStates,
  AttendancePayrollStates,
  AttendancePresenceStates,
  AttendancePunctualityStates,
} from "#shared";
import type { AttendanceDayRecord, AttendanceGeoFallbackReview } from "#shared";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { countAttendanceReportingEvidenceCategories } from "../../attendance/reporting-evidence.js";
import {
  buildAttendanceReportEvidenceIndex,
  countAttendanceReportSourceCategories,
} from "../../attendance/reporting-projection.js";
import { DashboardService } from "../service.js";

function reportingDay(
  companyId: string,
  employeeUserId: string,
  workDate: string,
  overrides: Partial<AttendanceDayRecord> = {},
): AttendanceDayRecord {
  const timestamp = `${workDate}T18:00:00.000Z`;
  return {
    id: randomUUID(),
    company_id: companyId,
    employee_user_id: employeeUserId,
    work_date: workDate,
    status: AttendanceDayStatuses.Present,
    day_classification: AttendanceDayClassifications.WorkingDay,
    presence_state: AttendancePresenceStates.Present,
    punctuality_state: AttendancePunctualityStates.OnTime,
    evidence_state: AttendanceEvidenceStates.Complete,
    approval_kind: AttendanceApprovalKinds.None,
    approval_state: AttendanceApprovalStates.NotRequired,
    payroll_state: AttendancePayrollStates.Unprocessed,
    first_check_in: `${workDate}T09:00:00.000Z`,
    last_check_out: `${workDate}T17:00:00.000Z`,
    work_minutes: 480,
    break_minutes: 0,
    late_minutes: 0,
    early_out_minutes: 0,
    work_seconds: 28_800,
    break_seconds: 0,
    scheduled_seconds: 28_800,
    late_seconds: 0,
    early_departure_seconds: 0,
    work_mode: "office",
    note: null,
    exception_type: null,
    regularization_status: null,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    ...overrides,
  };
}

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
      "UPDATE platform.user_session_preferences SET company_id=NULL,version=version+1 WHERE user_id=$1",
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
      headers: {
        ...authHeader(employee.token),
        "idempotency-key": "dashboard-expense-create",
      },
      payload: projectTravelPayload
    });
    expect(expense.statusCode).toBe(200);
    expect(app.store.tickets.some((ticket) => ticket.id === expense.json().id)).toBe(false);

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(manager.token)
    });

    expect(summary.statusCode, summary.body).toBe(200);
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

  it("matches canonical self and descendant attendance exception visibility", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const companyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [employee.user.id],
    )).rows[0]?.company_id;
    if (!companyId) throw new Error("Employee company fixture required");
    const canonicalStore = createMemoryDataStore();
    expect(canonicalStore.companyProfiles[0]?.id).toBe(companyId);
    const employeeTwo = canonicalStore.users.find((user) => user.employee_code === "E2");
    if (!employeeTwo) throw new Error("Second employee fixture required");
    const days = [
      reportingDay(companyId, employee.user.id, "2026-10-21", {
        status: AttendanceDayStatuses.Absent,
        presence_state: AttendancePresenceStates.Absent,
        evidence_state: AttendanceEvidenceStates.Missing,
        first_check_in: null,
        last_check_out: null,
        work_minutes: 0,
        work_seconds: 0,
      }),
      reportingDay(companyId, manager.user.id, "2026-10-21", {
        evidence_state: AttendanceEvidenceStates.Disputed,
        exception_type: "missing_punch",
      }),
      reportingDay(companyId, employeeTwo.id, "2026-10-21", {
        punctuality_state: AttendancePunctualityStates.Late,
        evidence_state: AttendanceEvidenceStates.Partial,
      }),
    ];
    for (const day of days) {
      await pool.query(
        `INSERT INTO attendance.daily_records
          (id,company_id,employee_user_id,work_date,status,day_classification,
           presence_state,punctuality_state,evidence_state,approval_kind,approval_state,
           payroll_state,first_check_in,last_check_out,work_minutes,work_seconds,
           scheduled_seconds,exception_type,version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)`,
        [day.id, companyId, day.employee_user_id, day.work_date, day.status,
          day.day_classification, day.presence_state, day.punctuality_state,
          day.evidence_state, day.approval_kind, day.approval_state, day.payroll_state,
          day.first_check_in, day.last_check_out, day.work_minutes, day.work_seconds,
          day.scheduled_seconds, day.exception_type],
      );
    }
    canonicalStore.attendanceDayRecords = days;
    const canonicalEmployee = new DashboardService(canonicalStore).summary(employee.user);
    const canonicalManager = new DashboardService(canonicalStore).summary(manager.user);

    const [employeeResponse, managerResponse] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(employee.token),
      }),
      app.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(manager.token),
      }),
    ]);

    expect(employeeResponse.statusCode, employeeResponse.body).toBe(200);
    expect(managerResponse.statusCode, managerResponse.body).toBe(200);
    const employeeBody = employeeResponse.json();
    const managerBody = managerResponse.json();
    expect(employeeBody.cards.find((card: { key: string }) =>
      card.key === "attendance_exceptions")?.value).toBe(
      canonicalEmployee.cards.find((card) => card.key === "attendance_exceptions")?.value,
    );
    expect(employeeBody.cards.find((card: { key: string }) =>
      card.key === "attendance_exceptions")?.value).toBe(1);
    expect(employeeBody.attendance).toEqual(canonicalEmployee.attendance);
    expect(managerBody.cards.find((card: { key: string }) =>
      card.key === "attendance_exceptions")?.value).toBe(
      canonicalManager.cards.find((card) => card.key === "attendance_exceptions")?.value,
    );
    expect(managerBody.cards.find((card: { key: string }) =>
      card.key === "attendance_exceptions")?.value).toBe(3);
    expect(managerBody.attendance).toEqual(canonicalManager.attendance);
  });

  it("returns every active company department, including zero headcount, without foreign or inactive rows", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const companyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [admin.user.id],
    )).rows[0]?.company_id;
    if (!companyId) throw new Error("Admin company fixture required");
    const otherCompanyId = randomUUID();
    const zeroDepartmentId = randomUUID();
    const inactiveDepartmentId = randomUUID();
    const foreignDepartmentId = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles
        (id,company_name,company_slug,status)
       VALUES ($1,'Dashboard Foreign Company',$2,'active')`,
      [otherCompanyId, `dashboard-foreign-${otherCompanyId}`],
    );
    await pool.query(
      `INSERT INTO core.departments
        (id,company_id,department_code,name,status)
       VALUES
        ($1,$2,'ZERO-DASH','Zero Headcount','active'),
        ($3,$2,'INACTIVE-DASH','Inactive Department','inactive'),
        ($4,$5,'FOREIGN-DASH','Foreign Department','active')`,
      [zeroDepartmentId, companyId, inactiveDepartmentId, foreignDepartmentId, otherCompanyId],
    );
    await pool.query(
      "UPDATE core.users SET department_id=$2 WHERE id=$1",
      [admin.user.id, foreignDepartmentId],
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(admin.token),
    });

    expect(response.statusCode, response.body).toBe(200);
    const departments = response.json().workforce.departments as Array<{
      department_id: string;
      active_employees: number;
    }>;
    expect(departments).toEqual(expect.arrayContaining([
      expect.objectContaining({ department_id: zeroDepartmentId, active_employees: 0 }),
    ]));
    expect(departments.map((department) => department.department_id)).not.toContain(inactiveDepartmentId);
    expect(departments.map((department) => department.department_id)).not.toContain(foreignDepartmentId);
  });

  it("matches canonical UTC attendance reporting evidence under non-UTC database sessions", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const companyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [admin.user.id],
    )).rows[0]?.company_id;
    if (!companyId) throw new Error("Admin company fixture required");
    const days = [
      reportingDay(companyId, admin.user.id, "2026-09-01"),
      reportingDay(companyId, admin.user.id, "2026-09-02", {
        first_check_in: null,
        last_check_out: null,
        work_seconds: 0,
        work_minutes: 0,
      }),
      reportingDay(companyId, admin.user.id, "2026-09-03", {
        status: AttendanceDayStatuses.Absent,
        presence_state: AttendancePresenceStates.Absent,
        evidence_state: AttendanceEvidenceStates.Missing,
        first_check_in: null,
        last_check_out: null,
        work_seconds: 0,
        work_minutes: 0,
      }),
      reportingDay(companyId, admin.user.id, "2026-09-04"),
      reportingDay(companyId, admin.user.id, "2026-09-05"),
    ];
    for (const day of days) {
      await pool.query(
        `INSERT INTO attendance.daily_records
          (id,company_id,employee_user_id,work_date,status,day_classification,
           presence_state,punctuality_state,evidence_state,approval_kind,approval_state,
           payroll_state,first_check_in,last_check_out,work_minutes,work_seconds,
           scheduled_seconds,version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,1)`,
        [day.id, companyId, admin.user.id, day.work_date, day.status,
          day.day_classification, day.presence_state, day.punctuality_state,
          day.evidence_state, day.approval_kind, day.approval_state, day.payroll_state,
          day.first_check_in, day.last_check_out, day.work_minutes, day.work_seconds,
          day.scheduled_seconds],
      );
    }

    const fallbackCommandId = randomUUID();
    const geoReview: AttendanceGeoFallbackReview = {
      id: randomUUID(),
      company_id: companyId,
      employee_user_id: admin.user.id,
      submitted_by_user_id: admin.user.id,
      current_approver_user_id: admin.user.id,
      original_command_id: randomUUID(),
      original_decision_id: randomUUID(),
      fallback_command_id: fallbackCommandId,
      punch_event_id: null,
      event_type: "check_in",
      work_date: days[0]!.work_date,
      occurred_at: `${days[0]!.work_date}T09:00:00.000Z`,
      reason_code: "dashboard_geo_review",
      reason_detail: null,
      geo_policy: {},
      status: "pending",
      decision_remarks: null,
      decided_by_user_id: null,
      decided_at: null,
      version: 1,
      created_at: `${days[0]!.work_date}T09:00:00.000Z`,
      updated_at: `${days[0]!.work_date}T09:00:00.000Z`,
      deleted_at: null,
    };
    await pool.query(
      `INSERT INTO attendance.geo_fallback_reviews
        (id,company_id,employee_user_id,submitted_by_user_id,current_approver_user_id,
         original_command_id,original_decision_id,fallback_command_id,event_type,work_date,
         occurred_at,reason_code,geo_policy,status,version)
       VALUES ($1,$2,$3,$3,$3,$4,$5,$6,'check_in',$7,$8,$9,'{}'::jsonb,'pending',1)`,
      [geoReview.id, companyId, admin.user.id, geoReview.original_command_id,
        geoReview.original_decision_id, fallbackCommandId, geoReview.work_date,
        geoReview.occurred_at, geoReview.reason_code],
    );

    const provisionalEventId = randomUUID();
    const provisionalPayload = {
      company_id: companyId,
      subject_employee_user_id: admin.user.id,
      attendance_event_id: provisionalEventId,
      verification_status: "unverified",
      captured_at: `${days[1]!.work_date}T09:00:00.000Z`,
    };
    await pool.query(
      `INSERT INTO platform.outbox_events
        (event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,status,
         available_at,created_at)
       VALUES ($1,'attendance',$2,'attendance.provisional.recorded',$3::jsonb,$4,'pending',now(),now())`,
      [randomUUID(), provisionalEventId, JSON.stringify(provisionalPayload),
        `dashboard-provisional-${provisionalEventId}`],
    );

    const warningRows = [
      { workDate: days[2]!.work_date, reasonCode: "mobile_registered_device_required" },
      { workDate: days[3]!.work_date, reasonCode: "mobile_registered_device_required" },
    ];
    for (const warning of warningRows) {
      await pool.query(
        `INSERT INTO attendance.mobile_evidence_warnings
          (company_id,employee_user_id,category,reason_code,event_type,work_mode,source,
           work_date,captured_at,server_received_at,client_event_id)
         VALUES ($1,$2,'device_eligibility',$3,'check_in','office','mobile',$4,$5,$5,$6)`,
        [companyId, admin.user.id, warning.reasonCode, warning.workDate,
          `${warning.workDate}T09:00:00.000Z`, randomUUID()],
      );
    }

    const punchRows = [
      {
        id: randomUUID(),
        occurredAt: `${days[3]!.work_date}T23:30:00.000Z`,
      },
      {
        id: randomUUID(),
        occurredAt: `${days[4]!.work_date}T09:00:00.000Z`,
      },
    ];
    for (const punch of punchRows) {
      await pool.query(
        `INSERT INTO attendance.punch_events
          (id,company_id,employee_user_id,actor_user_id,event_type,occurred_at,
           work_mode,source,origin,metadata)
         VALUES ($1,$2,$3,$3,'check_in',$4,'office','web','employee_manual_now','{}'::jsonb)`,
        [punch.id, companyId, admin.user.id, punch.occurredAt],
      );
    }

    const regularizationId = randomUUID();
    await pool.query(
      `INSERT INTO attendance.regularization_requests
        (id,company_id,employee_user_id,submitted_by_user_id,work_date,reason,
         requested_punches,status,current_approver_user_id,version)
       VALUES ($1,$2,$3,$3,$4,'Dashboard evidence fixture',$5::jsonb,'rejected',$3,1)`,
      [regularizationId, companyId, admin.user.id, days[4]!.work_date, JSON.stringify([{
        event_type: "check_in",
        occurred_at: `${days[4]!.work_date}T09:00:00.000Z`,
      }])],
    );

    const canonicalStore = createMemoryDataStore() as ReturnType<typeof createMemoryDataStore> & {
      attendanceMobileEvidenceWarnings: Array<{
        company_id: string;
        employee_user_id: string;
        work_date: string;
        source: "mobile";
        captured_at: string;
        server_received_at: string;
        reason_code: string;
        category: string;
      }>;
    };
    canonicalStore.attendanceDayRecords = days;
    canonicalStore.attendancePunches = punchRows.map((punch) => ({
      id: punch.id,
      company_id: companyId,
      employee_user_id: admin.user.id,
      actor_user_id: admin.user.id,
      event_type: "check_in" as const,
      occurred_at: punch.occurredAt,
      work_mode: "office" as const,
      source: "web" as const,
      origin: "employee_manual_now" as const,
      regularization_request_id: null,
      metadata: {},
      created_at: punch.occurredAt,
      deleted_at: null,
    }));
    canonicalStore.attendanceGeoFallbackReviews = [geoReview];
    canonicalStore.outbox = [{
      id: 1,
      event_id: randomUUID(),
      aggregate_type: "attendance",
      aggregate_id: provisionalEventId,
      event_type: "attendance.provisional.recorded",
      payload: provisionalPayload,
      idempotency_key: `dashboard-provisional-${provisionalEventId}`,
      status: "pending",
      retry_count: 0,
      available_at: `${days[1]!.work_date}T09:00:00.000Z`,
      created_at: `${days[1]!.work_date}T09:00:00.000Z`,
      published_at: null,
      failed_at: null,
      last_error: null,
    }];
    canonicalStore.attendanceMobileEvidenceWarnings = warningRows.map((warning) => ({
      company_id: companyId,
      employee_user_id: admin.user.id,
      work_date: warning.workDate,
      source: "mobile" as const,
      captured_at: `${warning.workDate}T09:00:00.000Z`,
      server_received_at: `${warning.workDate}T09:00:00.000Z`,
      reason_code: warning.reasonCode,
      category: "device_eligibility",
    }));
    canonicalStore.attendanceRegularizations = [{
      id: regularizationId,
      company_id: companyId,
      employee_user_id: admin.user.id,
      submitted_by_user_id: admin.user.id,
      work_date: days[4]!.work_date,
      reason: "Dashboard evidence fixture",
      items: [],
      requested_punches: [],
      status: "rejected",
      current_approver_user_id: admin.user.id,
      decision_remarks: null,
      decided_by_user_id: admin.user.id,
      decided_at: `${days[4]!.work_date}T10:00:00.000Z`,
      version: 1,
      created_at: `${days[4]!.work_date}T09:00:00.000Z`,
      updated_at: `${days[4]!.work_date}T10:00:00.000Z`,
      deleted_at: null,
    }];
    const evidenceIndex = buildAttendanceReportEvidenceIndex(canonicalStore, days);
    const summaries = days.map((day) => evidenceIndex.summaryFor(day));
    const canonicalEvidence = countAttendanceReportingEvidenceCategories(
      summaries.map((summary) => summary.reporting_evidence_category),
    );
    const canonicalSources = countAttendanceReportSourceCategories(
      summaries.map((summary) => summary.source_categories),
    );

    // The canonical projection groups ISO timestamps by their UTC prefix.
    // Put every pooled PostgreSQL session in a non-UTC timezone so the
    // near-midnight punch would move to the next day if SQL used the
    // session-dependent `timestamptz::date` cast.
    const timezoneClients = await Promise.all(
      Array.from({ length: 10 }, () => pool.connect()),
    );
    try {
      await Promise.all(
        timezoneClients.map((client) => client.query("SET TIME ZONE 'Asia/Kolkata'")),
      );
    } finally {
      timezoneClients.forEach((client) => client.release());
    }

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(admin.token),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().attendance).toEqual({
      evidence_categories: canonicalEvidence,
      source_categories: canonicalSources,
    });
    expect(canonicalEvidence).toMatchObject({
      verified: 1,
      warning: 1,
      provisional: 1,
      review_required: 1,
      rejected: 1,
    });
    expect(canonicalSources).toMatchObject({
      web: 2,
      geo: 1,
      mobile: 3,
      manual: 2,
    });
  });
});
