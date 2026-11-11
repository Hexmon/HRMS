import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { appendOutboxEvent } from "../../expenses/events.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreDatabaseUrl(): void {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

describe("expanded expense reports", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      restoreDatabaseUrl();
    }
  });

  it("returns compact cards, filters, document gates, totals, and audit metadata across report endpoints", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const auditor = await loginAs(app, "AUD");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload
    });
    expect(create.statusCode).toBe(200);
    const ticket = create.json();

    const myReport = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/my?page=1&page_size=10&document_status=missing&sort=ticket_no",
      headers: authHeader(employee.token)
    });
    expect(myReport.statusCode).toBe(200);
    expect(myReport.json().summary).toMatchObject({ total_requests: 1, missing_documents: 1 });
    expect(myReport.json().cards.map((card: { key: string }) => card.key)).toContain("manager");
    expect(myReport.json().items[0].document_summary.status).toBe("missing");
    expect(myReport.json().items[0].workflow_summary.action_required_by).toBe("manager");

    const managerQueueReport = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/manager-queue?page=1&page_size=10&document_status=missing",
      headers: authHeader(manager.token)
    });
    expect(managerQueueReport.statusCode).toBe(200);
    expect(managerQueueReport.json().queue_counts.total).toBe(1);
    expect(managerQueueReport.json().items[0]).toMatchObject({ manager_assignment_type: "direct", manager_action_required: true });

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);

    const managerHistory = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/manager-history?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(managerHistory.statusCode).toBe(200);
    expect(managerHistory.json().summary.verified).toBe(1);
    expect(managerHistory.json().items[0].decided_by_label).toContain("D1");
    expect(managerHistory.json().items[0].audit_metadata.route_snapshot).toBeDefined();

    const financeDashboard = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/finance-dashboard?page=1&page_size=10&status=Manager%20Verified",
      headers: authHeader(finance.token)
    });
    expect(financeDashboard.statusCode).toBe(200);
    expect(financeDashboard.json().cards.map((card: { key: string }) => card.key)).toContain("pending_finance_approval");
    expect(financeDashboard.json().payable_totals.approved_amount).toBe("0.00");
    expect(financeDashboard.json().exception_counts.missing_documents).toBe(1);
    expect(financeDashboard.json().items[0].workflow_summary.finance_action_required).toBe(true);

    const financeApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "verify", expected_version: 2 }
    });
    expect(financeApprove.statusCode).toBe(200);

    const payment = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/payment`,
      headers: authHeader(finance.token),
      payload: {
        payment_date: "2026-05-04",
        amount: "500.00",
        payment_mode: "NEFT",
        reference_no: "PAY-REPORT-001",
        expected_version: 3
      }
    });
    expect(payment.statusCode).toBe(200);

    const financeHistory = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/finance-history?page=1&page_size=10",
      headers: authHeader(finance.token)
    });
    expect(financeHistory.statusCode).toBe(200);
    expect(financeHistory.json().summary.finance_decisions).toBeGreaterThanOrEqual(1);
    expect(financeHistory.json().summary.payments).toBeGreaterThanOrEqual(1);
    expect(financeHistory.json().items[0].actor_label).toContain("N1");

    const register = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/register?page=1&page_size=10&payment_type=Advance",
      headers: authHeader(auditor.token)
    });
    expect(register.statusCode).toBe(200);
    expect(register.json().totals).toMatchObject({ total_rows: 1, estimated_amount: "1000.00", paid_amount: "500.00" });
    expect(register.json().export_columns).toContain("payment_reference_no");
    expect(register.json().items[0].register_columns.document_status).toBe("missing");

    const analytics = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/finance-analytics",
      headers: authHeader(finance.token)
    });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json().cards.map((card: { key: string }) => card.key)).toContain("payment_released");
    expect(analytics.json().exception_counts.missing_documents).toBe(1);
  });
});

describe("non-expense reports", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      restoreDatabaseUrl();
    }
  });

  it("keeps audit rows in their original company and fails closed without company context", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const adminPreference = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)!;
    const employeePreference = app.store.userSessionPreferences.find((row) => row.user_id === employee.user.id)!;
    const originalCompanyId = adminPreference.company_id!;
    const otherCompanyId = randomUUID();
    app.store.companyProfiles.push({
      ...app.store.companyProfiles.find((row) => row.id === originalCompanyId)!,
      id: otherCompanyId,
      company_slug: `audit-test-${otherCompanyId}`,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload,
    });
    expect(created.statusCode).toBe(200);
    const ticketId = created.json().id as string;
    expect(app.store.tickets.find((ticket) => ticket.id === ticketId)?.context_payload.company_id).toBe(originalCompanyId);

    const foreignEvent = appendOutboxEvent(app.store, {
      aggregateType: "report_export",
      aggregateId: randomUUID(),
      eventType: "reports.export.requested",
      payload: { company_id: otherCompanyId, actor_user_id: admin.user.id },
      idempotencyKey: `audit-foreign-${randomUUID()}`,
    });
    const unscopedEvent = appendOutboxEvent(app.store, {
      aggregateType: "report_export",
      aggregateId: randomUUID(),
      eventType: "reports.export.requested",
      payload: { actor_user_id: admin.user.id },
      idempotencyKey: `audit-unscoped-${randomUUID()}`,
    });
    const unscopedAssetEventId = randomUUID();
    const unscopedHelpdeskEventId = randomUUID();
    app.store.assetStateEvents.push({
      id: unscopedAssetEventId,
      asset_id: randomUUID(),
      actor_user_id: admin.user.id,
      event_type: "asset.test_unscoped",
      payload: {},
      created_at: new Date().toISOString(),
    });
    app.store.helpdeskEvents.push({
      id: unscopedHelpdeskEventId,
      ticket_id: randomUUID(),
      actor_user_id: admin.user.id,
      actor_name: admin.user.full_name,
      action: "helpdesk.test_unscoped",
      detail: null,
      created_at: new Date().toISOString(),
    });
    await app.store.persistence!.flush();
    const readAudit = () => app.inject({
      method: "GET",
      url: "/api/v1/reports/audit?page=1&page_size=100",
      headers: authHeader(admin.token),
    });

    employeePreference.company_id = otherCompanyId;
    const originalCompanyAudit = await readAudit();
    expect(originalCompanyAudit.statusCode).toBe(200);
    expect(originalCompanyAudit.json().items.some((row: { target: string }) => row.target === ticketId)).toBe(true);
    expect(originalCompanyAudit.json().items.some((row: { id: string }) => [
      foreignEvent.event_id,
      unscopedEvent.event_id,
      unscopedAssetEventId,
      unscopedHelpdeskEventId,
    ].includes(row.id))).toBe(false);

    adminPreference.company_id = otherCompanyId;
    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2",
      [otherCompanyId, admin.user.id],
    );
    const otherCompanyAudit = await readAudit();
    expect(otherCompanyAudit.statusCode).toBe(200);
    expect(otherCompanyAudit.json().items.some((row: { id: string }) => row.id === foreignEvent.event_id)).toBe(true);
    expect(otherCompanyAudit.json().items.some((row: { target: string }) => row.target === ticketId)).toBe(false);

    adminPreference.company_id = null;
    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id = NULL WHERE user_id = $1",
      [admin.user.id],
    );
    const noCompanyAudit = await readAudit();
    expect(noCompanyAudit.statusCode).toBe(400);
    expect(noCompanyAudit.json().code).toBe("COMPANY_CONTEXT_REQUIRED");

    employeePreference.company_id = null;
    const noCompanyExpense = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload,
    });
    expect(noCompanyExpense.statusCode).toBe(400);
    expect(noCompanyExpense.json().code).toBe("COMPANY_CONTEXT_REQUIRED");
  });

  it("uses committed audit events and current company and role after another process changes them", async () => {
    const auditor = await loginAs(app, "AUD");
    const preference = app.store.userSessionPreferences.find((row) => row.user_id === auditor.user.id)!;
    const originalCompanyId = preference.company_id!;
    const otherCompanyId = randomUUID();
    const originalEventId = randomUUID();
    const otherEventId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Audit transfer company', $2, 'active')`,
      [otherCompanyId, `audit-transfer-${otherCompanyId}`],
    );
    for (const [eventId, companyId] of [[originalEventId, originalCompanyId], [otherEventId, otherCompanyId]]) {
      await app.store.pgPool!.query(
        `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
         VALUES ($1, 'report_export', $2, 'reports.export.requested', $3::jsonb, $4)`,
        [eventId, randomUUID(), JSON.stringify({ company_id: companyId, actor_user_id: auditor.user.id }), `audit-fresh-${eventId}`],
      );
    }
    const readAudit = () => app.inject({
      method: "GET", url: "/api/v1/reports/audit?page=1&page_size=100", headers: authHeader(auditor.token),
    });

    const original = await readAudit();
    expect(original.statusCode).toBe(200);
    expect(original.json().items.some((row: { id: string }) => row.id === originalEventId)).toBe(true);
    expect(original.json().items.some((row: { id: string }) => row.id === otherEventId)).toBe(false);

    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2",
      [otherCompanyId, auditor.user.id],
    );
    const transferred = await readAudit();
    expect(transferred.statusCode).toBe(200);
    expect(transferred.json().items.some((row: { id: string }) => row.id === otherEventId)).toBe(true);
    expect(transferred.json().items.some((row: { id: string }) => row.id === originalEventId)).toBe(false);

    await app.store.pgPool!.query(
      "UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = 'Auditor'",
      [auditor.user.id],
    );
    const revoked = await readAudit();
    expect(revoked.statusCode).toBe(403);

    await app.store.pgPool!.query(
      "UPDATE core.user_roles SET status = 'active' WHERE user_id = $1 AND role_key = 'Auditor'",
      [auditor.user.id],
    );
    await app.store.pgPool!.query(
      "UPDATE platform.company_profiles SET status = 'inactive' WHERE id = $1",
      [otherCompanyId],
    );
    const inactiveCompany = await readAudit();
    expect(inactiveCompany.statusCode).toBe(400);
    expect(inactiveCompany.json().code).toBe("COMPANY_CONTEXT_REQUIRED");

    await app.store.pgPool!.query(
      "UPDATE platform.company_profiles SET status = 'active' WHERE id = $1",
      [otherCompanyId],
    );
    await app.store.pgPool!.query(
      "UPDATE core.users SET employment_status = 'inactive' WHERE id = $1",
      [auditor.user.id],
    );
    const inactiveUser = await readAudit();
    expect(inactiveUser.statusCode).toBe(401);
  });

  it("keeps a transferred employee's old expense in the original Finance report without new-employer profile labels", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const auditor = await loginAs(app, "AUD");
    const oldCompanyId = app.store.userSessionPreferences.find((row) => row.user_id === finance.user.id)!.company_id;
    const newCompanyId = randomUUID();
    const created = await app.inject({
      method: "POST", url: "/api/v1/expenses", headers: authHeader(employee.token), payload: projectTravelPayload,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().context_payload.company_id).toBe(oldCompanyId);
    const verified = await app.inject({
      method: "POST", url: `/api/v1/expenses/${created.json().id}/manager/verify`,
      headers: authHeader(manager.token), payload: { decision: "approve", expected_version: 1 },
    });
    expect(verified.statusCode).toBe(200);
    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Synthetic new employer', $2, 'active')`,
      [newCompanyId, `new-employer-${newCompanyId}`],
    );
    const foreignDepartmentId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO core.departments (id, company_id, department_code, name, status, version)
       VALUES ($1, $2, $3, 'Foreign Department Secret', 'active', 1)`,
      [foreignDepartmentId, newCompanyId, `FOREIGN_${foreignDepartmentId.slice(0, 8)}`],
    );
    await app.store.pgPool!.query(
      "UPDATE expenses.expense_tickets SET department_id = $1 WHERE id = $2",
      [foreignDepartmentId, created.json().id],
    );
    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2",
      [newCompanyId, employee.user.id],
    );
    await app.store.pgPool!.query(
      "UPDATE core.users SET full_name = 'New Employer Secret Name' WHERE id = $1",
      [employee.user.id],
    );

    const originalFinance = await app.inject({
      method: "GET", url: "/api/v1/reports/expenses/finance-dashboard?page=1&page_size=10",
      headers: authHeader(finance.token),
    });
    expect(originalFinance.statusCode).toBe(200);
    expect(originalFinance.json().items.some((row: { id: string }) => row.id === created.json().id)).toBe(true);
    expect(originalFinance.body).not.toContain("New Employer Secret Name");
    expect(originalFinance.body).not.toContain("Foreign Department Secret");

    const originalRegister = await app.inject({
      method: "GET", url: "/api/v1/reports/expenses/register?page=1&page_size=10",
      headers: authHeader(finance.token),
    });
    expect(originalRegister.statusCode).toBe(200);
    expect(originalRegister.body).not.toContain("Foreign Department Secret");
    const registerRow = originalRegister.json().items.find((row: { id: string }) => row.id === created.json().id);
    expect(registerRow.register_columns.department).toBe("Unknown department");

    const originalAnalytics = await app.inject({
      method: "GET", url: "/api/v1/reports/expenses/finance-analytics",
      headers: authHeader(finance.token),
    });
    expect(originalAnalytics.statusCode).toBe(200);
    expect(originalAnalytics.body).not.toContain("Foreign Department Secret");

    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2",
      [newCompanyId, auditor.user.id],
    );
    const newEmployerAudit = await app.inject({
      method: "GET", url: "/api/v1/reports/expenses/register?page=1&page_size=10",
      headers: authHeader(auditor.token),
    });
    expect(newEmployerAudit.statusCode).toBe(200);
    expect(newEmployerAudit.json().items.some((row: { id: string }) => row.id === created.json().id)).toBe(false);
  });

  it("keeps attendance day ownership at the original company after an employee transfer", async () => {
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const originalCompanyId = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)!.company_id;
    const newCompanyId = randomUUID();
    const originalDayId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO attendance.daily_records
       (id, company_id, employee_user_id, work_date, status, day_classification, presence_state, punctuality_state, evidence_state, approval_kind, approval_state, payroll_state, work_minutes, work_seconds)
       VALUES ($1, $2, $3, '2026-05-05', 'present', 'working_day', 'present', 'on_time', 'complete', 'none', 'not_required', 'unprocessed', 480, 28800)`,
      [originalDayId, originalCompanyId, employee.user.id],
    );
    const currentEmployee = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary?page=1&page_size=10&date_from=2026-05-05&date_to=2026-05-05",
      headers: authHeader(admin.token),
    });
    expect(currentEmployee.statusCode).toBe(200);
    expect(currentEmployee.json().items[0]).toMatchObject({
      employee: employee.user.full_name,
      employee_code: employee.user.employee_code,
    });
    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Synthetic attendance new employer', $2, 'active')`,
      [newCompanyId, `attendance-new-${newCompanyId}`],
    );
    await app.store.pgPool!.query("UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2", [newCompanyId, employee.user.id]);
    await app.store.pgPool!.query("UPDATE core.users SET full_name = 'New Employer Private Name', employee_code = 'NEW-SECRET' WHERE id = $1", [employee.user.id]);

    const oldCompany = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary?page=1&page_size=10&date_from=2026-05-05&date_to=2026-05-05",
      headers: authHeader(admin.token),
    });
    expect(oldCompany.statusCode).toBe(200);
    expect(oldCompany.json().items.map((row: { id: string }) => row.id)).toContain(originalDayId);
    expect(oldCompany.json().totals.records).toBe(1);
    expect(oldCompany.json().items[0]).toMatchObject({
      employee: "Historical identity unavailable",
      employee_code: null,
      department: null,
    });
    expect(oldCompany.body).not.toContain("New Employer Private Name");
    expect(oldCompany.body).not.toContain("NEW-SECRET");

    await app.store.pgPool!.query("UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2", [newCompanyId, auditor.user.id]);
    const newCompany = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary?page=1&page_size=10",
      headers: authHeader(auditor.token),
    });
    expect(newCompany.statusCode).toBe(200);
    expect(newCompany.json().items.map((row: { id: string }) => row.id)).not.toContain(originalDayId);
  });

  it("uses durable company context and refuses access when the committed assignment is removed", async () => {
    const admin = await loginAs(app, "ADM");
    const preference = app.store.userSessionPreferences.find((candidate) => candidate.user_id === admin.user.id)!;
    const originalCompanyId = preference.company_id;
    preference.company_id = null;
    const unaffectedByCache = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary?page=1&page_size=10",
      headers: authHeader(admin.token),
    });
    expect(unaffectedByCache.statusCode).toBe(200);
    preference.company_id = originalCompanyId;

    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id = NULL WHERE user_id = $1",
      [admin.user.id],
    );
    const summary = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary?page=1&page_size=10",
      headers: authHeader(admin.token),
    });
    expect(summary.statusCode).toBe(400);
    expect(summary.json().code).toBe("COMPANY_CONTEXT_REQUIRED");

    const exportRequest = await app.inject({
      method: "POST", url: "/api/v1/reports/exports",
      headers: authHeader(admin.token),
      payload: { report_type: "attendance", format: "csv", filters: { date_from: "2025-04-01", date_to: "2026-03-31" } },
    });
    expect(exportRequest.statusCode).toBe(400);
    expect(exportRequest.json().code).toBe("COMPANY_CONTEXT_REQUIRED");
  });

  it("fails closed for ambiguous report families and all SQL-backed generated export routes", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const director = await loginAs(app, "D1");
    const forbiddenHr = await app.inject({
      method: "GET", url: "/api/v1/reports/hr/employees",
      headers: authHeader(employee.token),
    });
    expect(forbiddenHr.statusCode).toBe(403);
    const unverifiedTeam = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary",
      headers: authHeader(director.token),
    });
    expect(unverifiedTeam.statusCode).toBe(409);

    for (const url of [
      "/api/v1/reports/hr/employees", "/api/v1/reports/leave-wfh/summary",
      "/api/v1/reports/projects/summary", "/api/v1/reports/timesheets/summary",
      "/api/v1/reports/assets/summary", "/api/v1/reports/helpdesk/summary",
    ]) {
      const response = await app.inject({ method: "GET", url, headers: authHeader(admin.token) });
      expect(response.statusCode, url).toBe(409);
      expect(response.json().download_document_id).toBeUndefined();
    }
    const attendance = await app.inject({
      method: "GET", url: "/api/v1/reports/attendance/summary?page=1&page_size=10",
      headers: authHeader(admin.token),
    });
    expect(attendance.statusCode).toBe(200);

    const beforeOutbox = await app.store.pgPool!.query("SELECT count(*)::int AS count FROM platform.outbox_events");
    const beforeDocuments = await app.store.pgPool!.query("SELECT count(*)::int AS count FROM documents.doc_metadata");
    const attempts = [
      { url: "/api/v1/reports/exports", payload: { report_type: "hr/employees", format: "csv", filters: { date_from: "2025-04-01", date_to: "2026-03-31" } } },
      { url: "/api/v1/reports/exports", payload: { report_type: "expenses/register", format: "xlsx", filters: { date_from: "2025-04-01", date_to: "2026-03-31" } } },
      { url: "/api/v1/core/users/exports", payload: { format: "csv", filters: {} } },
      { url: "/api/v1/attendance/exports", payload: { format: "csv" } },
      { url: "/api/v1/leave-wfh/exports", payload: { format: "csv" } },
    ];
    for (const attempt of attempts) {
      const response = await app.inject({ method: "POST", ...attempt, headers: authHeader(admin.token) });
      expect(response.statusCode, attempt.url).toBe(409);
      expect(response.json().download_document_id).toBeUndefined();
      expect(response.json().download_url).toBeUndefined();
    }
    for (const filters of [
      {},
      { date_from: "2025-04-01", date_to: "2026-04-01" },
      { date_from: "2025-04-01", date_to: "2026-03-31", page_size: 10001 },
    ]) {
      const response = await app.inject({
        method: "POST", url: "/api/v1/reports/exports", headers: authHeader(admin.token),
        payload: { report_type: "expenses/register", format: "csv", filters },
      });
      expect(response.statusCode).toBe(400);
    }
    const afterOutbox = await app.store.pgPool!.query("SELECT count(*)::int AS count FROM platform.outbox_events");
    const afterDocuments = await app.store.pgPool!.query("SELECT count(*)::int AS count FROM documents.doc_metadata");
    expect(afterOutbox.rows[0].count).toBe(beforeOutbox.rows[0].count);
    expect(afterDocuments.rows[0].count).toBe(beforeDocuments.rows[0].count);

    const originalCompanyId = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)!.company_id;
    const ownExportId = randomUUID();
    const foreignExportId = randomUUID();
    for (const [id, companyId] of [[ownExportId, originalCompanyId], [foreignExportId, randomUUID()]]) {
      await app.store.pgPool!.query(
        `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
         VALUES ($1, 'report_export', $2, 'reports.export.requested', $3::jsonb, $4)`,
        [randomUUID(), id, JSON.stringify({ company_id: companyId, actor_user_id: admin.user.id, status: "ready", download_document_id: randomUUID(), download_url: "https://example.invalid/old-public-url" }), `legacy-export-${id}`],
      );
    }
    const list = await app.inject({ method: "GET", url: "/api/v1/reports/exports", headers: authHeader(admin.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((item: { id: string }) => item.id)).toContain(ownExportId);
    expect(list.json().items.map((item: { id: string }) => item.id)).not.toContain(foreignExportId);
    expect(list.body).not.toContain("old-public-url");
    const own = await app.inject({ method: "GET", url: `/api/v1/reports/exports/${ownExportId}`, headers: authHeader(admin.token) });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ status: "unavailable", download_document_id: null, download_url: null });
    const foreign = await app.inject({ method: "GET", url: `/api/v1/reports/exports/${foreignExportId}`, headers: authHeader(admin.token) });
    expect(foreign.statusCode).toBe(404);
    await app.store.pgPool!.query("UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = 'Admin'", [admin.user.id]);
    const revokedList = await app.inject({ method: "GET", url: "/api/v1/reports/exports", headers: authHeader(admin.token) });
    expect(revokedList.statusCode).toBe(403);
  });
});
