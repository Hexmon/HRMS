import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createJwt } from "#auth";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import type {
  AttendanceDayRecord,
  AttendanceGeoFallbackReview,
  AttendancePunch,
  AttendanceRegularizationRequest,
  OutboxEvent,
} from "#shared";
import {
  countAttendanceReportingEvidenceCategories,
} from "../../attendance/reporting-evidence.js";
import {
  buildAttendanceReportEvidenceIndex,
  countAttendanceReportSourceCategories,
} from "../../attendance/reporting-projection.js";
import { ReportService } from "../../reports/service.js";

describe("expense typed-owner read boundary on PostgreSQL", () => {
  let app: FastifyInstance;
  let commandReader: FastifyInstance | null = null;

  beforeAll(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterAll(async () => {
    await commandReader?.close();
    await app?.close();
  });

  it("keeps A Finance on A history after requester transfer, but denies B Admin and revoked Finance", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const foreignFinance = await loginAs(app, "N2");
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const unrelated = await loginAs(app, "E2");
    const pool = app.store.pgPool;
    expect(pool).not.toBeNull();
    if (!pool) throw new Error("PostgreSQL pool required");
    const preference = await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1", [employee.user.id],
    );
    const companyA = preference.rows[0]?.company_id;
    expect(companyA).toBeTruthy();
    if (!companyA) throw new Error("Company A fixture required");
    const companyB = randomUUID();
    const ticketId = randomUUID();
    const pendingTicketId = randomUUID();
    const receiptId = randomUUID();
    const companyBTicketId = randomUUID();
    const companyBDepartmentId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      await client.query(
        `INSERT INTO platform.company_profiles
          (id, company_name, company_slug, status, timezone)
         VALUES ($1, 'Other Company', $2, 'active', 'America/Los_Angeles')`,
        [companyB, `expense-other-${companyB}`],
      );
      await client.query(
        `INSERT INTO expenses.expense_tickets
          (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
           expense_type, expense_sub_type, task_title, task_description, start_date,
           end_date, estimated_amount, payment_type, manager_verifier_id,
           finance_approver_id, status, context_payload, company_id, owner_resolution_status)
         VALUES ($1, $2, $3, 'Employee', $4, 'Project', 'Project Travel',
                 'Historical A travel', 'Fixture', CURRENT_DATE, CURRENT_DATE,
                 100, 'Advance', $5, $6, 'Manager Verified',
                 jsonb_build_object('company_id', $7::text), $7::uuid, 'typed_creation')`,
        [ticketId, `EXP-READ-${ticketId}`, employee.user.id, employee.user.department_id,
          manager.user.id, finance.user.id, companyA],
      );
      await client.query(
        `INSERT INTO expenses.expense_tickets
          (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
           expense_type, expense_sub_type, task_title, task_description, start_date,
           end_date, estimated_amount, payment_type, manager_verifier_id,
           finance_approver_id, status, context_payload, company_id, owner_resolution_status,
           created_at, updated_at)
         VALUES ($1, $2, $3, 'Employee', $4, 'Project', 'Project Travel',
                 'Pending A travel', 'Fixture', CURRENT_DATE, CURRENT_DATE,
                 50, 'Advance', $5, $6, 'Pending Manager Verification',
                 jsonb_build_object('company_id', $7::text), $7::uuid, 'typed_creation',
                 timestamptz '2026-11-11 00:00:00Z',
                 timestamptz '2026-11-11 00:00:00Z')`,
        [pendingTicketId, `EXP-READ-${pendingTicketId}`, employee.user.id, employee.user.department_id,
          manager.user.id, finance.user.id, companyA],
      );
      await client.query(
        `INSERT INTO expenses.expense_audit_logs (ticket_id, actor_user_id, event_type, new_value)
         VALUES ($1, $2, 'expense.created', jsonb_build_object('company_id', $3::text))`,
        [ticketId, employee.user.id, companyA],
      );
      await client.query(
        `INSERT INTO expenses.expense_line_items
          (ticket_id, line_category, description, line_total)
         VALUES ($1, 'travel', 'Original A expense', 100)`, [ticketId],
      );
      await client.query(
        `INSERT INTO documents.doc_metadata
          (id, business_object_type, business_object_id, classification, document_type,
           file_name, storage_key, mime_type, size_bytes, created_by_user_id)
         VALUES ($1, 'expense_ticket', $2, 'finance', 'receipt',
                 'receipt.pdf', $3, 'application/pdf', 12, $4)`,
        [receiptId, ticketId, `expense-test/${receiptId}`, employee.user.id],
      );
      await client.query(
        `INSERT INTO expenses.expense_documents
          (ticket_id, document_id, document_type, verification_status, uploaded_by)
         VALUES ($1, $2, 'receipt', 'pending', $3)`,
        [ticketId, receiptId, employee.user.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const financeBefore = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/finance-detail`, headers: authHeader(finance.token) });
    expect(financeBefore.statusCode).toBe(200);
    expect(financeBefore.json().ticket.company_id).toBe(companyA);
    expect(financeBefore.json().line_items).toHaveLength(1);
    const managerQueue = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/manager?page=1&page_size=10", headers: authHeader(manager.token) });
    expect(managerQueue.statusCode).toBe(200);
    expect(managerQueue.json().total).toBe(1);
    expect(managerQueue.json().items[0].id).toBe(pendingTicketId);
    const financeQueue = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance?page=1&page_size=10", headers: authHeader(finance.token) });
    expect(financeQueue.statusCode).toBe(200);
    expect(financeQueue.json().total).toBe(1);
    expect(financeQueue.json().items[0].id).toBe(ticketId);
    const financeDashboard = await app.inject({ method: "GET", url: "/api/v1/expenses/dashboard-summary", headers: authHeader(finance.token) });
    expect(financeDashboard.statusCode).toBe(200);
    expect(financeDashboard.json().queue_counts.total_visible).toBe(2);
    expect(financeDashboard.json().queue_counts.finance_pending).toBe(1);
    const emptyFinancePage = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance?page=2&page_size=1", headers: authHeader(finance.token) });
    expect(emptyFinancePage.statusCode).toBe(200);
    expect(emptyFinancePage.json()).toMatchObject({ total: 1, items: [], page: 2 });
    const filteredFinance = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance?page=1&page_size=1&amount_min=200.00", headers: authHeader(finance.token) });
    expect(filteredFinance.statusCode).toBe(200);
    expect(filteredFinance.json().total).toBe(0);
    expect((await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance?document_status=missing", headers: authHeader(finance.token) })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: "/api/v1/expenses/metadata", headers: authHeader(employee.token) })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(unrelated.token) })).statusCode).toBe(403);
    for (const oversight of [admin, auditor]) {
      expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(oversight.token) })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/finance-detail`, headers: authHeader(oversight.token) })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/timeline`, headers: authHeader(oversight.token) })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/audit?page=1&page_size=10`, headers: authHeader(oversight.token) })).statusCode).toBe(200);
    }
    for (const [oversight, roleKey] of [[admin, "Admin"], [auditor, "Auditor"]] as const) {
      await pool.query(
        "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key=$2",
        [oversight.user.id, roleKey],
      );
      const staleRoleRead = await app.inject({
        method: "GET",
        url: `/api/v1/expenses/${ticketId}`,
        headers: authHeader(oversight.token),
      });
      expect(staleRoleRead.statusCode).toBe(403);
      await pool.query(
        "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key=$2",
        [oversight.user.id, roleKey],
      );
      expect((await app.inject({
        method: "GET",
        url: `/api/v1/expenses/${ticketId}`,
        headers: authHeader(oversight.token),
      })).statusCode).toBe(200);
    }
    const timeline = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/timeline`, headers: authHeader(finance.token) });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json()).toHaveLength(1);
    const audit = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/audit?page=1&page_size=10`, headers: authHeader(finance.token) });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBe(1);
    const blockedMutation = await app.inject({ method: "POST", url: "/api/v1/expenses", headers: authHeader(employee.token), payload: {} });
    expect(blockedMutation.statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/v1/expenses", payload: {} })).statusCode).toBe(401);
    expect(app.store.tickets).toHaveLength(0);
    for (const [method, path] of [
      ["GET", `/api/v1/documents/${receiptId}`],
      ["POST", `/api/v1/documents/${receiptId}/download-url`],
      ["GET", `/api/v1/documents/${receiptId}/content`],
      ["DELETE", `/api/v1/documents/${receiptId}`],
      ["POST", `/api/v1/documents/${receiptId}/verify`],
      ["GET", `/api/v1/documents/${receiptId}/access-log`],
    ] as const) {
      const response = await app.inject({ method, url: path, headers: authHeader(finance.token) });
      expect(response.statusCode).toBe(409);
    }
    expect((await app.inject({
      method: "GET",
      url: `/api/v1/documents/${receiptId}`,
      headers: authHeader(auditor.token),
    })).statusCode).toBe(409);
    expect((await app.inject({
      method: "POST",
      url: `/api/v1/documents/${receiptId}/download-url`,
      headers: authHeader(auditor.token),
    })).statusCode).toBe(404);
    const oversightState = async () => (await pool.query(
      `SELECT t.version,
        (SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=t.id) AS approvals,
        (SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=t.id) AS payments,
        (SELECT count(*) FROM expenses.expense_audit_logs WHERE ticket_id=t.id) AS audits,
        (SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=t.id) AS command_results,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=t.id) AS outbox,
        (SELECT count(*) FROM platform.notifications WHERE payload->>'ticket_id'=t.id::text) AS notifications,
        (SELECT count(*) FROM documents.doc_access_logs WHERE document_id=$2) AS document_accesses
       FROM expenses.expense_tickets t WHERE t.id=$1`,
      [ticketId, receiptId],
    )).rows[0];
    const oversightBefore = await oversightState();
    const adminAuditorUnionRoleId = randomUUID();
    await pool.query(
      `INSERT INTO core.user_roles
        (id,user_id,role_key,status,effective_from,effective_to)
       VALUES ($1,$2,'Auditor','active',CURRENT_DATE,NULL)`,
      [adminAuditorUnionRoleId, admin.user.id],
    );
    await pool.query(
      "UPDATE platform.user_session_preferences SET active_role='Auditor' WHERE user_id=$1",
      [admin.user.id],
    );
    try {
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(200);
      expect((await app.inject({
        method: "POST", url: `/api/v1/documents/${receiptId}/download-url`, headers: authHeader(admin.token),
      })).statusCode).toBe(409);

      await pool.query(
        "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Admin'",
        [admin.user.id],
      );
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(200);
      expect((await app.inject({
        method: "GET", url: `/api/v1/documents/${receiptId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(409);
      expect((await app.inject({
        method: "POST", url: `/api/v1/documents/${receiptId}/download-url`, headers: authHeader(admin.token),
      })).statusCode).toBe(404);

      await pool.query(
        "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Admin'",
        [admin.user.id],
      );
      expect((await app.inject({
        method: "POST", url: `/api/v1/documents/${receiptId}/download-url`, headers: authHeader(admin.token),
      })).statusCode).toBe(409);

      await pool.query(
        "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key IN ('Admin','Auditor')",
        [admin.user.id],
      );
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(403);
      expect((await app.inject({
        method: "GET", url: `/api/v1/documents/${receiptId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(403);

      await pool.query(
        "UPDATE core.user_roles SET status='active' WHERE id=$1",
        [adminAuditorUnionRoleId],
      );
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(200);
      expect((await app.inject({
        method: "GET", url: `/api/v1/documents/${receiptId}`, headers: authHeader(admin.token),
      })).statusCode).toBe(409);
    } finally {
      await pool.query(
        "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Admin'",
        [admin.user.id],
      );
      await pool.query("DELETE FROM core.user_roles WHERE id=$1", [adminAuditorUnionRoleId]);
      await pool.query(
        "UPDATE platform.user_session_preferences SET active_role='Admin' WHERE user_id=$1",
        [admin.user.id],
      );
    }
    expect(await oversightState()).toEqual(oversightBefore);

    const temporalTicketId = randomUUID();
    const temporalAdminRoleId = randomUUID();
    const temporalFinanceRoleId = randomUUID();
    const temporalFixture = await pool.connect();
    try {
      await temporalFixture.query("BEGIN");
      await temporalFixture.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      await temporalFixture.query(
        `INSERT INTO expenses.expense_tickets
          (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
           expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
           estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
           context_payload,company_id,owner_resolution_status)
         VALUES ($1,$2,$3,'Employee',$4,'Project','Project Travel','Temporal role fixture',
           'Fixture',CURRENT_DATE,CURRENT_DATE,10,'Advance',$5,$6,'Manager Verified',
           jsonb_build_object('company_id',$7::text),$7::uuid,'typed_creation')`,
        [temporalTicketId, `EXP-TEMP-${temporalTicketId}`, manager.user.id,
          manager.user.department_id, manager.user.id, unrelated.user.id, companyA],
      );
      await temporalFixture.query("COMMIT");
    } catch (error) {
      await temporalFixture.query("ROLLBACK");
      throw error;
    } finally {
      temporalFixture.release();
    }
    await pool.query(
      `INSERT INTO core.user_roles
        (id,user_id,role_key,status,effective_from,effective_to)
       VALUES ($1,$3,'Admin','active',CURRENT_DATE + 1,NULL),
              ($2,$3,'Finance Manager','active',CURRENT_DATE - 10,CURRENT_DATE - 1)`,
      [temporalAdminRoleId, temporalFinanceRoleId, unrelated.user.id],
    );
    try {
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${temporalTicketId}/finance-detail`,
        headers: authHeader(unrelated.token),
      })).statusCode).toBe(403);
      expect((await app.inject({
        method: "GET", url: "/api/v1/reports/audit?page=1&page_size=10",
        headers: authHeader(unrelated.token),
      })).statusCode).toBe(403);

      await pool.query(
        `UPDATE core.user_roles SET effective_from=CURRENT_DATE, effective_to=NULL
         WHERE id=ANY($1::uuid[])`,
        [[temporalAdminRoleId, temporalFinanceRoleId]],
      );
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${temporalTicketId}/finance-detail`,
        headers: authHeader(unrelated.token),
      })).statusCode).toBe(200);
      expect((await app.inject({
        method: "GET", url: "/api/v1/reports/audit?page=1&page_size=10",
        headers: authHeader(unrelated.token),
      })).statusCode).toBe(200);

      await pool.query(
        `UPDATE core.user_roles SET effective_from=CURRENT_DATE - 10, effective_to=CURRENT_DATE - 1
         WHERE id=ANY($1::uuid[])`,
        [[temporalAdminRoleId, temporalFinanceRoleId]],
      );
      expect((await app.inject({
        method: "GET", url: `/api/v1/expenses/${temporalTicketId}/finance-detail`,
        headers: authHeader(unrelated.token),
      })).statusCode).toBe(403);
      expect((await app.inject({
        method: "GET", url: "/api/v1/reports/audit?page=1&page_size=10",
        headers: authHeader(unrelated.token),
      })).statusCode).toBe(403);
    } finally {
      await pool.query(
        "DELETE FROM core.user_roles WHERE id=ANY($1::uuid[])",
        [[temporalAdminRoleId, temporalFinanceRoleId]],
      );
    }
    expect((await app.inject({ method: "GET", url: "/api/v1/documents", headers: authHeader(finance.token) })).statusCode).toBe(409);

    const managerReportUrl = "/api/v1/reports/expenses/manager-queue?page=1&page_size=1";
    const managerHistoryUrl = "/api/v1/reports/expenses/manager-history?page=1&page_size=1";
    expect((await app.inject({ method: "GET", url: managerReportUrl,
      headers: authHeader(manager.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: managerReportUrl,
      headers: authHeader(admin.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: managerReportUrl,
      headers: authHeader(employee.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: managerHistoryUrl,
      headers: authHeader(manager.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: managerHistoryUrl,
      headers: authHeader(admin.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: managerHistoryUrl,
      headers: authHeader(employee.token) })).statusCode).toBe(403);
    for (const [url, allowedActor] of [
      ["/api/v1/reports/expenses/finance-dashboard?page=1&page_size=1", finance],
      ["/api/v1/reports/expenses/finance-history?page=1&page_size=1", finance],
      ["/api/v1/reports/expenses/advance-aging?page=1&page_size=1", finance],
      ["/api/v1/reports/expenses/payments?page=1&page_size=1", auditor],
      ["/api/v1/reports/expenses/audit?page=1&page_size=1", admin],
    ] as const) {
      expect((await app.inject({
        method: "GET",
        url,
        headers: authHeader(allowedActor.token),
      })).statusCode).toBe(200);
      expect((await app.inject({
        method: "GET",
        url,
        headers: authHeader(employee.token),
      })).statusCode).toBe(403);
    }
    const routeSnapshotFixture = await pool.connect();
    try {
      await routeSnapshotFixture.query("BEGIN");
      await routeSnapshotFixture.query("SELECT set_config('app.expense_command_v1','on',true)");
      await routeSnapshotFixture.query(
        "UPDATE expenses.expense_tickets SET route_snapshot=jsonb_build_object('finance_approver_id',$2::text) WHERE id=$1",
        [ticketId, foreignFinance.user.id],
      );
      await routeSnapshotFixture.query("COMMIT");
      const fullReportContext = await app.store.persistence?.expenseReportReadContext?.(
        admin.user.id,
        { audience: "company", filters: {} },
      );
      expect(fullReportContext).toBeDefined();
      if (!fullReportContext) throw new Error("PostgreSQL report context required");
      for (const filter of [
        { finance_user_id: foreignFinance.user.id },
        { document_status: "missing" as const },
      ]) {
        const sqlFiltered = await app.store.persistence?.expenseReportReadContext?.(
          admin.user.id,
          { audience: "company", filters: filter },
        );
        expect(sqlFiltered).toBeDefined();
        if (!sqlFiltered) throw new Error("Filtered PostgreSQL report context required");
        const canonical = new ReportService(fullReportContext.store).financeDashboard(
          fullReportContext.actor,
          { page: 1, page_size: 100, ...filter },
        );
        expect(new Set(sqlFiltered.store.tickets.map((candidate) => candidate.id))).toEqual(
          new Set(canonical.items.map((item) => item.id)),
        );
      }
    } finally {
      try {
        await routeSnapshotFixture.query("BEGIN");
        await routeSnapshotFixture.query("SELECT set_config('app.expense_command_v1','on',true)");
        await routeSnapshotFixture.query(
          "UPDATE expenses.expense_tickets SET route_snapshot='{}'::jsonb WHERE id=$1",
          [ticketId],
        );
        await routeSnapshotFixture.query("COMMIT");
      } catch (error) {
        await routeSnapshotFixture.query("ROLLBACK");
        throw error;
      } finally {
        routeSnapshotFixture.release();
      }
    }
    const managerReviewerRole = await pool.query<{ id: string }>(
      "SELECT id FROM core.user_roles WHERE user_id=$1 AND role_key='Reviewer'",
      [manager.user.id],
    );
    const reviewerRoleId = managerReviewerRole.rows[0]?.id;
    expect(reviewerRoleId).toBeTruthy();
    if (!reviewerRoleId) throw new Error("Manager Reviewer role fixture required");
    let managerEmployeeRoleId = (await pool.query<{ id: string }>(
      "SELECT id FROM core.user_roles WHERE user_id=$1 AND role_key='Employee'",
      [manager.user.id],
    )).rows[0]?.id;
    const managerEmployeeRoleAdded = !managerEmployeeRoleId;
    if (!managerEmployeeRoleId) {
      managerEmployeeRoleId = randomUUID();
      await pool.query(
        `INSERT INTO core.user_roles (id,user_id,role_key,status,effective_from)
         VALUES ($1,$2,'Employee','active',CURRENT_DATE)`,
        [managerEmployeeRoleId, manager.user.id],
      );
    }
    await pool.query(
      "UPDATE platform.user_session_preferences SET active_role='Employee' WHERE user_id=$1",
      [manager.user.id],
    );
    for (const temporalAssignment of [
      { effectiveFrom: "CURRENT_DATE", effectiveTo: "NULL", status: "inactive" },
      { effectiveFrom: "CURRENT_DATE + 1", effectiveTo: "NULL", status: "active" },
      { effectiveFrom: "CURRENT_DATE - 10", effectiveTo: "CURRENT_DATE - 1", status: "active" },
    ]) {
      await pool.query(
        `UPDATE core.user_roles SET status=$2,
           effective_from=${temporalAssignment.effectiveFrom},
           effective_to=${temporalAssignment.effectiveTo} WHERE id=$1`,
        [reviewerRoleId, temporalAssignment.status],
      );
      for (const url of [managerReportUrl, managerHistoryUrl]) {
        expect((await app.inject({ method: "GET", url,
          headers: authHeader(manager.token) })).statusCode).toBe(403);
      }
    }
    await pool.query(
      "UPDATE core.user_roles SET status='active',effective_from=CURRENT_DATE,effective_to=NULL WHERE id=$1",
      [reviewerRoleId],
    );
    expect((await app.inject({ method: "GET", url: managerReportUrl,
      headers: authHeader(manager.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: managerHistoryUrl,
      headers: authHeader(manager.token) })).statusCode).toBe(200);
    await pool.query(
      "UPDATE platform.user_session_preferences SET active_role='Reviewer' WHERE user_id=$1",
      [manager.user.id],
    );
    if (managerEmployeeRoleAdded) {
      await pool.query("DELETE FROM core.user_roles WHERE id=$1", [managerEmployeeRoleId]);
    }

    const boundaryFixture = await pool.connect();
    try {
      await boundaryFixture.query("BEGIN");
      await boundaryFixture.query("SELECT set_config('app.expense_command_v1','on',true)");
      await boundaryFixture.query(
        `INSERT INTO expenses.expense_tickets
        (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
         expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
         estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
         context_payload,company_id,owner_resolution_status)
       SELECT gen_random_uuid(), 'EXP-BOUND-' || gen_random_uuid()::text, $1, 'Employee', $2,
         'Project','Project Travel','Bound fixture','Fixture',CURRENT_DATE,CURRENT_DATE,
         1,'Advance',$3,$4,'Pending Manager Verification',
         jsonb_build_object('company_id',$5::text),$5::uuid,'typed_creation'
       FROM generate_series(1,999)`,
        [employee.user.id, employee.user.department_id, manager.user.id, finance.user.id, companyA],
      );
      await boundaryFixture.query("COMMIT");
    } catch (error) {
      await boundaryFixture.query("ROLLBACK");
      throw error;
    } finally {
      boundaryFixture.release();
    }
    try {
      const bounded = await app.inject({ method: "GET", url: managerReportUrl,
        headers: authHeader(manager.token) });
      expect(bounded.statusCode, bounded.body).toBe(200);
      expect(bounded.json().total).toBe(1000);
      const overBoundary = await pool.connect();
      try {
        await overBoundary.query("BEGIN");
        await overBoundary.query("SELECT set_config('app.expense_command_v1','on',true)");
        await overBoundary.query(
          `INSERT INTO expenses.expense_tickets
            (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
             expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
             estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
             context_payload,company_id,owner_resolution_status)
           VALUES (gen_random_uuid(),'EXP-BOUND-' || gen_random_uuid()::text,$1,'Employee',$2,
             'Project','Project Travel','Bound fixture','Fixture',CURRENT_DATE,CURRENT_DATE,
             1,'Advance',$3,$4,'Pending Manager Verification',
             jsonb_build_object('company_id',$5::text),$5::uuid,'typed_creation')`,
          [employee.user.id, employee.user.department_id, manager.user.id, finance.user.id, companyA],
        );
        await overBoundary.query("COMMIT");
      } catch (error) {
        await overBoundary.query("ROLLBACK");
        throw error;
      } finally {
        overBoundary.release();
      }
      const overBounded = await app.inject({ method: "GET", url: managerReportUrl,
        headers: authHeader(manager.token) });
      expect(overBounded.statusCode, overBounded.body).toBe(400);
      expect(overBounded.body).toContain("at most 1,000 matching tickets");
      const unauthorizedOverBounded = await app.inject({
        method: "GET",
        url: managerReportUrl,
        headers: authHeader(employee.token),
      });
      expect(unauthorizedOverBounded.statusCode, unauthorizedOverBounded.body).toBe(403);
      expect(unauthorizedOverBounded.body).not.toContain("1,000 matching tickets");
      const narrowedBoundary = await app.inject({
        method: "GET",
        url: `${managerReportUrl}&status=Manager%20Verified`,
        headers: authHeader(manager.token),
      });
      expect(narrowedBoundary.statusCode, narrowedBoundary.body).toBe(200);
      expect(narrowedBoundary.json().total).toBe(0);
      const overlongRange = await app.inject({
        method: "GET",
        url: `${managerReportUrl}&date_from=2025-01-01&date_to=2026-02-01`,
        headers: authHeader(manager.token),
      });
      expect(overlongRange.statusCode, overlongRange.body).toBe(400);
      expect(overlongRange.body).toContain("cannot exceed 12 months");
      const invalidRange = await app.inject({
        method: "GET",
        url: `${managerReportUrl}&date_from=2026-02-31&date_to=2026-03-01`,
        headers: authHeader(manager.token),
      });
      expect(invalidRange.statusCode, invalidRange.body).toBe(400);
      expect(invalidRange.body).toContain("must be a valid calendar date");
      const reversedRange = await app.inject({
        method: "GET",
        url: `${managerReportUrl}&date_from=2026-03-01&date_to=2026-02-01`,
        headers: authHeader(manager.token),
      });
      expect(reversedRange.statusCode, reversedRange.body).toBe(400);
      expect(reversedRange.body).toContain("date range is reversed");
    } finally {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        await cleanup.query("SELECT set_config('app.expense_command_v1','on',true)");
        await cleanup.query("DELETE FROM expenses.expense_tickets WHERE ticket_no LIKE 'EXP-BOUND-%'");
        await cleanup.query("COMMIT");
      } catch (error) {
        await cleanup.query("ROLLBACK");
        throw error;
      } finally {
        cleanup.release();
      }
    }
    const oldDateTicketId = randomUUID();
    const dateFixture = await pool.connect();
    try {
      await dateFixture.query("BEGIN");
      await dateFixture.query("SELECT set_config('app.expense_command_v1','on',true)");
      await dateFixture.query(
        `INSERT INTO expenses.expense_tickets
          (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
           expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
           estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
           context_payload,company_id,owner_resolution_status,created_at,updated_at)
         VALUES ($1,$2,$3,'Employee',$4,'Project','Project Travel','Old date fixture',
           'Fixture',date '2025-01-01',date '2025-01-01',1,'Advance',$5,$6,
           'Pending Manager Verification',jsonb_build_object('company_id',$7::text),
           $7::uuid,'typed_creation',timestamptz '2025-01-01 00:00:00Z',
           timestamptz '2025-01-01 00:00:00Z')`,
        [oldDateTicketId, `EXP-DATE-${oldDateTicketId}`, employee.user.id,
          employee.user.department_id, manager.user.id, finance.user.id, companyA],
      );
      await dateFixture.query("COMMIT");
      for (const [range, expectedId] of [
        ["date_from=2026-01-01", pendingTicketId],
        ["date_to=2026-01-01", oldDateTicketId],
        ["date_from=2025-11-11&date_to=2026-11-11", pendingTicketId],
      ] as const) {
        const oneSidedOrBoundaryRange = await app.inject({
          method: "GET",
          url: `${managerReportUrl}&${range}`,
          headers: authHeader(manager.token),
        });
        expect(oneSidedOrBoundaryRange.statusCode, oneSidedOrBoundaryRange.body).toBe(200);
        expect(oneSidedOrBoundaryRange.json().total).toBe(1);
        expect(oneSidedOrBoundaryRange.json().items[0].id).toBe(expectedId);
      }
    } finally {
      try {
        await dateFixture.query("BEGIN");
        await dateFixture.query("SELECT set_config('app.expense_command_v1','on',true)");
        await dateFixture.query("DELETE FROM expenses.expense_tickets WHERE id=$1", [oldDateTicketId]);
        await dateFixture.query("COMMIT");
      } catch (error) {
        await dateFixture.query("ROLLBACK");
        throw error;
      } finally {
        dateFixture.release();
      }
    }
    const unrelatedCompanyBacklog = await pool.connect();
    try {
      await unrelatedCompanyBacklog.query("BEGIN");
      await unrelatedCompanyBacklog.query("SELECT set_config('app.expense_command_v1','on',true)");
      await unrelatedCompanyBacklog.query(
        `INSERT INTO expenses.expense_tickets
          (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
           expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
           estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
           context_payload,company_id,owner_resolution_status)
         SELECT gen_random_uuid(), 'EXP-UNRELATED-' || gen_random_uuid()::text,
           $1,'Employee',$2,'Project','Project Travel','Unrelated manager backlog',
           'Fixture',CURRENT_DATE,CURRENT_DATE,1,'Advance',$3,$4,
           'Pending Manager Verification',jsonb_build_object('company_id',$5::text),
           $5::uuid,'typed_creation'
         FROM generate_series(1,1001)`,
        [employee.user.id, employee.user.department_id, unrelated.user.id, finance.user.id, companyA],
      );
      await unrelatedCompanyBacklog.query("COMMIT");
      const scopedBelowCompanyBacklog = await app.inject({
        method: "GET",
        url: managerReportUrl,
        headers: authHeader(manager.token),
      });
      expect(scopedBelowCompanyBacklog.statusCode, scopedBelowCompanyBacklog.body).toBe(200);
      expect(scopedBelowCompanyBacklog.json().total).toBe(1);
      expect(scopedBelowCompanyBacklog.json().items[0].id).toBe(pendingTicketId);
    } catch (error) {
      await unrelatedCompanyBacklog.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      try {
        await unrelatedCompanyBacklog.query("BEGIN");
        await unrelatedCompanyBacklog.query("SELECT set_config('app.expense_command_v1','on',true)");
        await unrelatedCompanyBacklog.query(
          "DELETE FROM expenses.expense_tickets WHERE ticket_no LIKE 'EXP-UNRELATED-%'",
        );
        await unrelatedCompanyBacklog.query("COMMIT");
      } catch (error) {
        await unrelatedCompanyBacklog.query("ROLLBACK");
        throw error;
      } finally {
        unrelatedCompanyBacklog.release();
      }
    }
    const childBoundary = await pool.connect();
    try {
      await childBoundary.query("BEGIN");
      await childBoundary.query("SELECT set_config('app.expense_command_v1','on',true)");
      await childBoundary.query(
        `INSERT INTO expenses.expense_line_items
          (ticket_id,line_category,description,line_total)
         SELECT $1,'other','Unrelated child fixture ' || series::text,1
         FROM generate_series(1,10000) AS series`,
        [ticketId],
      );
      await childBoundary.query("COMMIT");
      const unrelatedChildren = await app.inject({
        method: "GET",
        url: managerReportUrl,
        headers: authHeader(manager.token),
      });
      expect(unrelatedChildren.statusCode, unrelatedChildren.body).toBe(200);
      expect(unrelatedChildren.json().total).toBe(1);
      await childBoundary.query("BEGIN");
      await childBoundary.query("SELECT set_config('app.expense_command_v1','on',true)");
      await childBoundary.query(
        `INSERT INTO expenses.expense_line_items
          (ticket_id,line_category,description,line_total)
         SELECT $1,'other','Scoped child fixture ' || series::text,1
         FROM generate_series(1,10000) AS series`,
        [pendingTicketId],
      );
      await childBoundary.query("COMMIT");
      const exactChildren = await app.inject({
        method: "GET",
        url: managerReportUrl,
        headers: authHeader(manager.token),
      });
      expect(exactChildren.statusCode, exactChildren.body).toBe(200);
      expect(exactChildren.json().total).toBe(1);
      await childBoundary.query("BEGIN");
      await childBoundary.query("SELECT set_config('app.expense_command_v1','on',true)");
      await childBoundary.query(
        `INSERT INTO expenses.expense_line_items
          (ticket_id,line_category,description,line_total)
         VALUES ($1,'other','Scoped child fixture overflow',1)`,
        [pendingTicketId],
      );
      await childBoundary.query("COMMIT");
      const overBoundedChildren = await app.inject({
        method: "GET",
        url: managerReportUrl,
        headers: authHeader(manager.token),
      });
      expect(overBoundedChildren.statusCode, overBoundedChildren.body).toBe(400);
      expect(overBoundedChildren.body).toContain(
        "at most 10,000 related records",
      );
      const narrowedChildren = await app.inject({
        method: "GET",
        url: `${managerReportUrl}&status=Closed`,
        headers: authHeader(manager.token),
      });
      expect(narrowedChildren.statusCode, narrowedChildren.body).toBe(200);
      expect(narrowedChildren.json().total).toBe(0);
    } finally {
      try {
        await childBoundary.query("BEGIN");
        await childBoundary.query("SELECT set_config('app.expense_command_v1','on',true)");
        await childBoundary.query(
          `DELETE FROM expenses.expense_line_items
           WHERE ticket_id=ANY($1::uuid[])
             AND (description LIKE 'Unrelated child fixture %'
               OR description LIKE 'Scoped child fixture %')`,
          [[ticketId, pendingTicketId]],
        );
        await childBoundary.query("COMMIT");
      } catch (error) {
        await childBoundary.query("ROLLBACK");
        throw error;
      } finally {
        childBoundary.release();
      }
    }
    expect((await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/documents`, headers: authHeader(employee.token), payload: {} })).statusCode).toBe(409);
    const putSpy = app.store.objectStorage ? vi.spyOn(app.store.objectStorage, "putObject") : null;
    const genericExpenseUpload = await app.inject({
      method: "POST", url: "/api/v1/documents", headers: authHeader(employee.token),
      payload: {
        business_object_type: "expense_ticket", business_object_id: ticketId,
        classification: "finance", document_type: "receipt", file_name: "receipt.pdf",
        mime_type: "application/pdf", size_bytes: 12,
      },
    });
    expect(genericExpenseUpload.statusCode).toBe(409);
    expect(putSpy).not.toHaveBeenCalled();
    putSpy?.mockRestore();
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_documents WHERE document_id=$1", [receiptId])).rows[0]?.count)).toBe(1);

    const financeBoundaryBefore = await pool.query(
      `SELECT t.version,
        (SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=t.id) AS approvals,
        (SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=t.id) AS payments,
        (SELECT count(*) FROM expenses.expense_audit_logs WHERE ticket_id=t.id) AS audits,
        (SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=t.id) AS command_results,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=t.id) AS outbox,
        (SELECT count(*) FROM platform.notifications WHERE payload->>'ticket_id'=t.id::text) AS notifications
       FROM expenses.expense_tickets t WHERE t.id=$1`,
      [ticketId],
    );
    for (const [label, deniedActor] of [["admin", admin], ["auditor", auditor]] as const) {
      const denied = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticketId}/finance/approve`,
        headers: { ...authHeader(deniedActor.token), "idempotency-key": `${label}-${ticketId}` },
        payload: { decision: "verify", expected_version: 1 },
      });
      expect(denied.statusCode).toBe(403);
    }
    const adminAuditorRoleId = randomUUID();
    await pool.query(
      `INSERT INTO core.user_roles (id,user_id,role_key,status,effective_from)
       VALUES ($1,$2,'Auditor','active',CURRENT_DATE)`,
      [adminAuditorRoleId, admin.user.id],
    );
    try {
      const multiRoleDenied = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticketId}/finance/approve`,
        headers: { ...authHeader(admin.token), "idempotency-key": `admin-auditor-${ticketId}` },
        payload: { decision: "verify", expected_version: 1 },
      });
      expect(multiRoleDenied.statusCode).toBe(403);
    } finally {
      await pool.query("DELETE FROM core.user_roles WHERE id=$1", [adminAuditorRoleId]);
    }
    const financeBoundaryAfter = await pool.query(
      `SELECT t.version,
        (SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=t.id) AS approvals,
        (SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=t.id) AS payments,
        (SELECT count(*) FROM expenses.expense_audit_logs WHERE ticket_id=t.id) AS audits,
        (SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=t.id) AS command_results,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=t.id) AS outbox,
        (SELECT count(*) FROM platform.notifications WHERE payload->>'ticket_id'=t.id::text) AS notifications
       FROM expenses.expense_tickets t WHERE t.id=$1`,
      [ticketId],
    );
    expect(financeBoundaryAfter.rows[0]).toEqual(financeBoundaryBefore.rows[0]);

    await pool.query("UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1", [employee.user.id, companyB]);
    for (const oversight of [admin, auditor]) {
      expect((await app.inject({
        method: "GET",
        url: `/api/v1/expenses/${ticketId}`,
        headers: authHeader(oversight.token),
      })).statusCode).toBe(200);
    }
    expect((await app.inject({
      method: "POST",
      url: `/api/v1/documents/${receiptId}/download-url`,
      headers: authHeader(admin.token),
    })).statusCode).toBe(409);
    expect((await app.inject({
      method: "POST",
      url: `/api/v1/documents/${receiptId}/download-url`,
      headers: authHeader(auditor.token),
    })).statusCode).toBe(404);
    await pool.query("UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1", [admin.user.id, companyB]);
    await pool.query("UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1", [auditor.user.id, companyB]);
    await pool.query("UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1", [foreignFinance.user.id, companyB]);
    await pool.query("INSERT INTO core.departments (id, company_id, department_code, name) VALUES ($1, $2, $3, 'B Department')", [companyBDepartmentId, companyB, `B-${companyBDepartmentId}`]);
    await pool.query("UPDATE core.users SET department_id=$2 WHERE id=$1", [employee.user.id, companyBDepartmentId]);
    await pool.query("INSERT INTO core.user_roles (user_id, role_key, status, effective_from) VALUES ($1, 'Finance Manager', 'active', CURRENT_DATE)", [employee.user.id]);
    const bClient = await pool.connect();
    try {
      await bClient.query("BEGIN");
      await bClient.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      await bClient.query(
        `INSERT INTO expenses.expense_tickets
          (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
           expense_type, expense_sub_type, task_title, task_description, start_date,
           end_date, estimated_amount, payment_type, finance_approver_id,
           status, context_payload, company_id, owner_resolution_status)
         VALUES ($1, $2, $3, 'Employee', $4, 'Project', 'Project Travel',
                 'B travel', 'Fixture', CURRENT_DATE, CURRENT_DATE,
                 75, 'Advance', $5, 'Manager Verified',
                 jsonb_build_object('company_id', $6::text), $6::uuid, 'typed_creation')`,
        [companyBTicketId, `EXP-READ-${companyBTicketId}`, employee.user.id,
          companyBDepartmentId, foreignFinance.user.id, companyB],
      );
      await bClient.query("COMMIT");
    } catch (error) {
      await bClient.query("ROLLBACK");
      throw error;
    } finally {
      bClient.release();
    }
    const ownHistory = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(employee.token) });
    expect(ownHistory.statusCode).toBe(200);
    expect(ownHistory.json().company_id).toBe(companyA);
    const ownList = await app.inject({ method: "GET", url: "/api/v1/expenses/my?page=1&page_size=10", headers: authHeader(employee.token) });
    expect(ownList.statusCode).toBe(200);
    expect(ownList.json().total).toBe(3);
    expect(new Set(ownList.json().items.map((row: { company_id: string }) => row.company_id))).toEqual(new Set([companyA, companyB]));
    const ownHistoricalReportContext = await app.store.persistence?.expenseReportReadContext?.(
      employee.user.id,
      { audience: "requester", filters: {} },
    );
    expect(ownHistoricalReportContext).toBeDefined();
    expect(new Set(ownHistoricalReportContext?.store.tickets.map(
      (row) => row.company_id,
    ))).toEqual(new Set([companyA, companyB]));
    const ownHistoricalReport = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/my?page=1&page_size=10",
      headers: authHeader(employee.token),
    });
    expect(ownHistoricalReport.statusCode, ownHistoricalReport.body).toBe(200);
    expect(ownHistoricalReport.json().total).toBe(3);
    expect(new Set(ownHistoricalReport.json().items.map(
      (row: { company_id: string }) => row.company_id,
    ))).toEqual(new Set([companyA, companyB]));
    const ownFirst = await app.inject({ method: "GET", url: "/api/v1/expenses/my?page=1&page_size=1", headers: authHeader(employee.token) });
    const ownSecond = await app.inject({ method: "GET", url: "/api/v1/expenses/my?page=2&page_size=1", headers: authHeader(employee.token) });
    const ownBeyond = await app.inject({ method: "GET", url: "/api/v1/expenses/my?page=4&page_size=1", headers: authHeader(employee.token) });
    expect(ownFirst.json().total).toBe(3);
    expect(ownSecond.json().total).toBe(3);
    expect(ownFirst.json().items[0].id).not.toBe(ownSecond.json().items[0].id);
    expect(ownBeyond.json()).toMatchObject({ total: 3, items: [] });
    expect((await app.inject({ method: "GET", url: "/api/v1/expenses/my?page_size=101", headers: authHeader(employee.token) })).statusCode).toBe(400);
    const ownFinanceQueue = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance", headers: authHeader(employee.token) });
    expect(ownFinanceQueue.statusCode).toBe(200);
    expect(ownFinanceQueue.json().total).toBe(0);
    const bFinanceQueue = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance", headers: authHeader(foreignFinance.token) });
    expect(bFinanceQueue.statusCode).toBe(200);
    expect(bFinanceQueue.json().items.map((row: { id: string }) => row.id)).toEqual([companyBTicketId]);
    const aFinanceQueueAgain = await app.inject({ method: "GET", url: "/api/v1/expenses/queue/finance", headers: authHeader(finance.token) });
    expect(aFinanceQueueAgain.statusCode).toBe(200);
    expect(aFinanceQueueAgain.json().items.map((row: { id: string }) => row.id)).toEqual([ticketId]);
    const scoped = await app.store.persistence?.expenseReadContext?.(employee.user.id, ticketId);
    expect(scoped?.store.tickets.map((row) => row.id)).toEqual([ticketId]);
    expect(scoped?.store.lineItems).toHaveLength(1);
    expect(scoped?.store.users.some((row) => row.id === finance.user.id)).toBe(false);
    expect(scoped?.store.userSessionPreferences).toHaveLength(0);
    expect(scoped?.store.companyProfiles).toHaveLength(0);
    expect(scoped?.store.documents).toHaveLength(0);
    const financeAfterTransfer = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/finance-detail`, headers: authHeader(finance.token) });
    expect(financeAfterTransfer.statusCode).toBe(200);
    expect(financeAfterTransfer.json().ticket.requester_name).toBeNull();
    expect(financeAfterTransfer.body).not.toContain(employee.user.email);
    const foreignAdmin = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(admin.token) });
    expect(foreignAdmin.statusCode).toBe(404);
    for (const [method, suffix] of [
      ["GET", ""],
      ["POST", "/download-url"],
      ["GET", "/content"],
      ["DELETE", ""],
      ["POST", "/verify"],
      ["GET", "/access-log"],
    ] as const) {
      const requestId = randomUUID();
      const headers = { ...authHeader(admin.token), "x-request-id": requestId };
      const foreign = await app.inject({
        method,
        url: `/api/v1/documents/${receiptId}${suffix}`,
        headers,
      });
      const missing = await app.inject({
        method,
        url: `/api/v1/documents/${randomUUID()}${suffix}`,
        headers,
      });
      expect(foreign.statusCode, `${method} ${suffix || "/metadata"}`).toBe(404);
      expect(missing.statusCode, `${method} ${suffix || "/metadata"}`).toBe(foreign.statusCode);
      expect(missing.body, `${method} ${suffix || "/metadata"}`).toBe(foreign.body);
    }
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(auditor.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/finance-detail`, headers: authHeader(foreignFinance.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/timeline`, headers: authHeader(auditor.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/audit?page=1&page_size=10`, headers: authHeader(auditor.token) })).statusCode).toBe(404);
    const foreignDashboard = await app.inject({ method: "GET", url: "/api/v1/expenses/dashboard-summary", headers: authHeader(admin.token) });
    expect(foreignDashboard.statusCode).toBe(200);
    expect(foreignDashboard.json().queue_counts.total_visible).toBe(0);
    const ownDashboard = await app.inject({ method: "GET", url: "/api/v1/expenses/dashboard-summary", headers: authHeader(employee.token) });
    expect(ownDashboard.statusCode).toBe(200);
    expect(ownDashboard.json().queue_counts.my_tickets).toBe(3);

    const second = await buildRealApp({ reset: false });
    await second.ready();
    try {
      const pendingBootstrapUserId = randomUUID();
      const pendingBootstrapCompanyId = randomUUID();
      const pendingBootstrapRoleId = randomUUID();
      await pool.query(
        `INSERT INTO platform.company_profiles
          (id,company_name,company_slug,status,bootstrap_completed_at)
         VALUES ($1,'Pending bootstrap company',$2,'pending',NULL)`,
        [pendingBootstrapCompanyId, `pending-${pendingBootstrapCompanyId}`],
      );
      await pool.query(
        `INSERT INTO core.users
          (id,employee_code,email,full_name,department_id,designation_id,manager_user_id,
           hierarchy_path,employment_status,email_verified_at,email_verification_status)
         SELECT $1,$2,$3,'Pending bootstrap admin',department_id,designation_id,
                manager_user_id,hierarchy_path || text2ltree($4),'active',now(),'verified'
         FROM core.users WHERE id=$5`,
        [
          pendingBootstrapUserId,
          `BOOT-${pendingBootstrapUserId}`,
          `bootstrap-${pendingBootstrapUserId}@example.test`,
          `bootstrap${pendingBootstrapUserId.replaceAll("-", "")}`,
          employee.user.id,
        ],
      );
      await pool.query(
        `INSERT INTO core.user_roles (id,user_id,role_key,status,effective_from)
         VALUES ($1,$2,'Admin','active',CURRENT_DATE)`,
        [pendingBootstrapRoleId, pendingBootstrapUserId],
      );
      await pool.query(
        `INSERT INTO platform.auth_tokens
          (token_hash,token_type,user_id,email,company_id,status,expires_at,metadata)
         VALUES ($1,'company_bootstrap',$2,$3,$4,'active',now()+interval '1 day','{}')`,
        [
          `pending-bootstrap-${pendingBootstrapUserId}`,
          pendingBootstrapUserId,
          `bootstrap-${pendingBootstrapUserId}@example.test`,
          pendingBootstrapCompanyId,
        ],
      );
      const pendingBootstrapJwt = createJwt(
        {
          ...employee.user,
          id: pendingBootstrapUserId,
          employee_code: `BOOT-${pendingBootstrapUserId}`,
          email: `bootstrap-${pendingBootstrapUserId}@example.test`,
          full_name: "Pending bootstrap admin",
          roles: ["Admin"],
        },
        second.config.JWT_SECRET,
      );
      await second.store.sessionStore.create({
        jti: pendingBootstrapJwt.jti,
        user_id: pendingBootstrapUserId,
        expires_at: pendingBootstrapJwt.expiresAt,
        revoked_at: null,
      });
      const bootstrapTokenCountBefore = Number((await pool.query(
        `SELECT count(*) FROM platform.auth_tokens
         WHERE user_id=$1 AND token_type='company_bootstrap'`,
        [pendingBootstrapUserId],
      )).rows[0]?.count ?? 0);
      const pendingBootstrapMe = await second.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authHeader(pendingBootstrapJwt.token),
      });
      expect(pendingBootstrapMe.statusCode, pendingBootstrapMe.body).toBe(200);
      expect(pendingBootstrapMe.json()).toMatchObject({
        user: { id: pendingBootstrapUserId },
        company: { id: pendingBootstrapCompanyId },
        setup_required: true,
        next_step: "company_bootstrap",
        company_id: pendingBootstrapCompanyId,
      });
      const repeatedPendingBootstrapMe = await second.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authHeader(pendingBootstrapJwt.token),
      });
      expect(repeatedPendingBootstrapMe.statusCode, repeatedPendingBootstrapMe.body).toBe(200);
      expect(repeatedPendingBootstrapMe.json()).toMatchObject({
        setup_required: true,
        next_step: "company_bootstrap",
        company_id: pendingBootstrapCompanyId,
      });
      expect(Number((await pool.query(
        `SELECT count(*) FROM platform.auth_tokens
         WHERE user_id=$1 AND token_type='company_bootstrap'`,
        [pendingBootstrapUserId],
      )).rows[0]?.count ?? 0)).toBe(bootstrapTokenCountBefore);
      expect(second.store.authTokens.filter(
        (token) => token.user_id === pendingBootstrapUserId,
      )).toHaveLength(0);
      await pool.query(
        "UPDATE core.users SET employment_status='inactive' WHERE id=$1",
        [pendingBootstrapUserId],
      );
      expect((await second.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authHeader(pendingBootstrapJwt.token),
      })).statusCode).toBe(401);
      await pool.query(
        "UPDATE core.users SET employment_status='active' WHERE id=$1",
        [pendingBootstrapUserId],
      );

      const secondRead = await second.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(employee.token) });
      expect(secondRead.statusCode).toBe(200);
      const postStartUserId = randomUUID();
      await pool.query(
        `INSERT INTO core.users
          (id,employee_code,email,full_name,department_id,designation_id,manager_user_id,
           hierarchy_path,employment_status,timezone,email_verified_at,email_verification_status)
         SELECT $1, $2, $3, 'Post-start employee', department_id, designation_id,
                manager_user_id, hierarchy_path || text2ltree($4), 'active',
                'Asia/Kolkata', now(), 'verified'
         FROM core.users WHERE id = $5`,
        [postStartUserId, `POST-${postStartUserId}`, `post-${postStartUserId}@example.test`,
          `post${postStartUserId.replaceAll("-", "")}`, employee.user.id],
      );
      await pool.query(
        `INSERT INTO core.user_roles (user_id,role_key,status,effective_from)
         VALUES ($1,'Employee','active',CURRENT_DATE),($1,'Admin','active',CURRENT_DATE)`,
        [postStartUserId],
      );
      await pool.query(
        `INSERT INTO platform.user_session_preferences (user_id,active_role,company_id)
         VALUES ($1,'Admin',$2)`,
        [postStartUserId, companyB],
      );
      expect(second.store.users.some((user) => user.id === postStartUserId)).toBe(false);
      const postStartJwt = createJwt({
        ...employee.user,
        id: postStartUserId,
        employee_code: `POST-${postStartUserId}`,
        email: `post-${postStartUserId}@example.test`,
        full_name: "Post-start employee",
        department_id: companyBDepartmentId,
        roles: ["Admin", "Employee"],
      }, second.config.JWT_SECRET);
      await second.store.sessionStore.create({
        jti: postStartJwt.jti,
        user_id: postStartUserId,
        expires_at: postStartJwt.expiresAt,
        revoked_at: null,
      });
      const postStartMe = await second.inject({
        method: "GET", url: "/api/v1/auth/me", headers: authHeader(postStartJwt.token),
      });
      expect(postStartMe.statusCode, postStartMe.body).toBe(200);
      expect(postStartMe.json()).toMatchObject({
        user: { id: postStartUserId, full_name: "Post-start employee" },
        active_role: { key: "Admin" },
        company: { id: companyB },
      });
      const postStartHttp = await second.inject({
        method: "GET",
        url: "/api/v1/expenses/dashboard-summary",
        headers: authHeader(postStartJwt.token),
      });
      expect(postStartHttp.statusCode, postStartHttp.body).toBe(200);
      expect(postStartHttp.json().queue_counts.my_tickets).toBe(0);
      const companyActiveCount = async (companyId: string) => Number((await pool.query(
        `SELECT count(*) FROM core.users u
         JOIN platform.user_session_preferences pref ON pref.user_id=u.id
         WHERE pref.company_id=$1 AND u.deleted_at IS NULL AND u.employment_status='active'`,
        [companyId],
      )).rows[0]?.count ?? 0);
      const genericB = await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      });
      expect(genericB.statusCode, genericB.body).toBe(200);
      expect(genericB.json().scope).toMatchObject({ actor_user_id: postStartUserId, primary_role: "Admin" });
      expect(genericB.json().workforce.active_employees).toBe(await companyActiveCount(companyB));
      expect(genericB.json().approvals.document_verification_pending).toBe(0);
      const bOutboxBeforeContradiction = genericB.json().operations.outbox_pending;
      await pool.query(
        `INSERT INTO platform.outbox_events
          (aggregate_type,aggregate_id,event_type,payload,idempotency_key)
         VALUES ('expense_ticket',$1,'expense.contradictory-company',
           jsonb_build_object('company_id',$2::text),$3)`,
        [ticketId, companyB, `expense-contradictory-${postStartUserId}`],
      );
      const bAfterContradictoryOutbox = await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      });
      expect(bAfterContradictoryOutbox.statusCode, bAfterContradictoryOutbox.body).toBe(200);
      expect(bAfterContradictoryOutbox.json().operations.outbox_pending).toBe(
        bOutboxBeforeContradiction,
      );
      const evidenceDates = {
        verified: "2026-10-01",
        warning: "2026-10-02",
        provisional: "2026-10-03",
        review: "2026-10-04",
        rejected: "2026-10-05",
      } as const;
      const evidenceDayIds = Object.fromEntries(
        Object.keys(evidenceDates).map((key) => [key, randomUUID()]),
      ) as Record<keyof typeof evidenceDates, string>;
      const evidenceFixture = await pool.connect();
      try {
        await evidenceFixture.query("BEGIN");
        for (const [category, workDate] of Object.entries(evidenceDates)) {
          await evidenceFixture.query(
            `INSERT INTO attendance.daily_records
              (id,company_id,employee_user_id,work_date,status,day_classification,
               presence_state,punctuality_state,evidence_state,approval_kind,
               approval_state,payroll_state,work_seconds)
             VALUES ($1,$2,$3,$4,'absent','working_day','absent','not_applicable',
               $5,$6,$7,'unprocessed',$8)`,
            [
              evidenceDayIds[category as keyof typeof evidenceDates],
              companyB,
              postStartUserId,
              workDate,
              category === "verified" || category === "warning" ? "complete" : "missing",
              category === "review" ? "regularization" : "none",
              category === "review" ? "pending" : "not_required",
              category === "verified" || category === "warning" ? 3600 : 0,
            ],
          );
        }
        for (const [ordinal, source, origin] of [
          [0, "web", "employee_manual_now"],
          [1, "web_geo", "employee_manual_now"],
          [2, "mobile", "employee_manual_now"],
          [3, "admin", "employee_manual_now"],
          [4, "kiosk", "employee_manual_now"],
          [5, "web", "system"],
        ] as const) {
          await evidenceFixture.query(
            `INSERT INTO attendance.punch_events
              (company_id,employee_user_id,actor_user_id,event_type,occurred_at,
               work_mode,source,origin,metadata)
             VALUES ($1,$2,$2,'check_in',
               CASE WHEN $4::int=0
                 THEN $3::date - interval '1 day' + interval '19 hours'
                 ELSE $3::date + ($4 || ' minutes')::interval
               END,
               'office',$5,$6,'{}')`,
            [companyB, postStartUserId, evidenceDates.verified, ordinal, source, origin],
          );
        }
        await evidenceFixture.query(
          `INSERT INTO attendance.mobile_evidence_warnings
            (company_id,employee_user_id,category,reason_code,event_type,work_mode,
             source,work_date,captured_at,server_received_at,client_event_id)
           VALUES
            ($1,$2,'replay_warning','mobile_replay.changed_body_conflict','check_in','office',
             'mobile',$3,$3::date - interval '1 day' + interval '19 hours',
             $3::date - interval '1 day' + interval '19 hours 5 seconds',gen_random_uuid()),
            ($1,$2,'device_eligibility','mobile_registered_device_required','check_in','office',
             'mobile_offline',$4,$4::date + interval '9 hours',$4::date + interval '9 hours',gen_random_uuid())`,
          [companyB, postStartUserId, evidenceDates.warning, evidenceDates.rejected],
        );
        await evidenceFixture.query(
          `INSERT INTO platform.outbox_events
            (aggregate_type,aggregate_id,event_type,payload,idempotency_key)
           VALUES
            ('attendance',gen_random_uuid(),'attendance.provisional.recorded',
             jsonb_build_object('company_id',$1::text,'subject_employee_user_id',$2::text,
               'work_date','invalid-work-date','captured_at',
               to_char(
                 $3::date - interval '1 day' + interval '19 hours',
                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
               ),
               'verification_status','unverified'),
             $5),
            ('attendance',gen_random_uuid(),'attendance.provisional.recorded',
             jsonb_build_object('company_id',$1::text,'subject_employee_user_id',$2::text,
               'work_date',$4::text,'captured_at',$4::text || 'T09:00:00.000Z',
               'verification_status','rejected'),
             $6),
            ('attendance',gen_random_uuid(),'attendance.provisional.recorded',
             jsonb_build_object('company_id',$1::text,'subject_employee_user_id',$2::text,
               'captured_at','not-a-date','verification_status','unverified'),
             $7),
            ('attendance',gen_random_uuid(),'attendance.provisional.recorded',
             jsonb_build_object('company_id',$1::text,'subject_employee_user_id',$2::text,
               'captured_at',$8::text,'verification_status','unverified'),
             $10),
            ('attendance',gen_random_uuid(),'attendance.provisional.recorded',
             jsonb_build_object('company_id',$1::text,'subject_employee_user_id',$2::text,
               'captured_at',$9::text || ' 09:00:00','verification_status','unverified'),
             $11)`,
          [
            companyB,
            postStartUserId,
            evidenceDates.provisional,
            evidenceDates.rejected,
            `dashboard-provisional-${postStartUserId}`,
            `dashboard-rejected-${postStartUserId}`,
            `dashboard-corrupt-${postStartUserId}`,
            evidenceDates.verified,
            evidenceDates.warning,
            `dashboard-date-only-${postStartUserId}`,
            `dashboard-offset-free-${postStartUserId}`,
          ],
        );
        await evidenceFixture.query(
          `INSERT INTO attendance.geo_fallback_reviews
            (company_id,employee_user_id,submitted_by_user_id,original_command_id,
             original_decision_id,fallback_command_id,event_type,work_date,occurred_at,
             reason_code,status)
           VALUES ($1,$2,$2,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
             'check_in',$3,$3::date + interval '9 hours','outside_geofence','pending')`,
          [companyB, postStartUserId, evidenceDates.review],
        );
        await evidenceFixture.query(
          `INSERT INTO attendance.regularization_requests
            (company_id,employee_user_id,submitted_by_user_id,work_date,reason,
             requested_punches,status)
           VALUES ($1,$2,$2,$3::date,'Dashboard parity fixture',
             jsonb_build_array(jsonb_build_object(
               'event_type','check_in','occurred_at',($3::date)::text || 'T09:00:00.000Z'
             )),'pending')`,
          [companyB, postStartUserId, evidenceDates.review],
        );
        await evidenceFixture.query("SET LOCAL enable_seqscan=off");
        await evidenceFixture.query("SET LOCAL enable_hashjoin=off");
        await evidenceFixture.query("SET LOCAL enable_mergejoin=off");
        const indexedPunchEventPlan = await evidenceFixture.query<{ "QUERY PLAN": string }>(
          `EXPLAIN (COSTS OFF)
           SELECT recorded.payload
           FROM attendance.punch_events punch
           LEFT JOIN platform.outbox_events recorded
             ON recorded.idempotency_key='attendance.punch.recorded:' || punch.id::text
            AND recorded.event_type='attendance.punch.recorded'
           WHERE punch.company_id=$1 AND punch.employee_user_id=$2`,
          [companyB, postStartUserId],
        );
        expect(indexedPunchEventPlan.rows.map(
          (row) => row["QUERY PLAN"],
        ).join("\n")).toMatch(/Index Scan using \S*idempotency\S* on outbox_events/u);
        await evidenceFixture.query("COMMIT");
      } catch (error) {
        await evidenceFixture.query("ROLLBACK");
        throw error;
      } finally {
        evidenceFixture.release();
      }
      const evidenceDashboard = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(postStartJwt.token),
      });
      expect(evidenceDashboard.statusCode, evidenceDashboard.body).toBe(200);
      const companyCalendar = await pool.query<{ today: string; start: string }>(
        `SELECT (timezone(company.timezone, now()))::date::text AS today,
                ((timezone(company.timezone, now()))::date - INTERVAL '12 months')::date::text AS start
         FROM platform.company_profiles company WHERE company.id=$1`,
        [companyB],
      );
      const [canonicalDaysResult, canonicalPunchesResult, canonicalReviewsResult,
        canonicalOutboxResult, canonicalWarningsResult, canonicalRegularizationsResult] =
        await Promise.all([
          pool.query<{ record: AttendanceDayRecord }>(
            `SELECT to_jsonb(day) || jsonb_build_object('work_date',day.work_date::text) AS record
             FROM attendance.daily_records day
             WHERE day.company_id=$1 AND day.employee_user_id=$2
               AND day.work_date BETWEEN $3 AND $4 ORDER BY day.work_date`,
            [companyB, postStartUserId, evidenceDates.verified, evidenceDates.rejected],
          ),
          pool.query<{ record: AttendancePunch }>(
            `SELECT to_jsonb(punch) || jsonb_build_object(
               'work_date',to_char(
                 timezone(COALESCE(evidence_user.timezone,company.timezone),punch.occurred_at),
                 'YYYY-MM-DD'
               )
             ) AS record
             FROM attendance.punch_events punch
             JOIN platform.company_profiles company ON company.id=punch.company_id
             LEFT JOIN core.users evidence_user ON evidence_user.id=punch.employee_user_id
             WHERE punch.company_id=$1 AND punch.employee_user_id=$2
               AND to_char(
                 timezone(COALESCE(evidence_user.timezone,company.timezone),punch.occurred_at),
                 'YYYY-MM-DD'
               )
                 BETWEEN $3 AND $4
             ORDER BY punch.occurred_at`,
            [companyB, postStartUserId, evidenceDates.verified, evidenceDates.rejected],
          ),
          pool.query<{ record: AttendanceGeoFallbackReview }>(
            `SELECT to_jsonb(review) || jsonb_build_object('work_date',review.work_date::text) AS record
             FROM attendance.geo_fallback_reviews review
             WHERE review.company_id=$1 AND review.employee_user_id=$2
               AND review.work_date BETWEEN $3 AND $4 ORDER BY review.occurred_at`,
            [companyB, postStartUserId, evidenceDates.verified, evidenceDates.rejected],
          ),
          pool.query<{ record: OutboxEvent }>(
            `SELECT to_jsonb(event) AS record FROM platform.outbox_events event
             WHERE event.idempotency_key IN ($1,$2) ORDER BY event.created_at`,
            [`dashboard-provisional-${postStartUserId}`, `dashboard-rejected-${postStartUserId}`],
          ),
          pool.query<{ record: Record<string, unknown> }>(
            `SELECT to_jsonb(warning) || jsonb_build_object('work_date',warning.work_date::text) AS record
             FROM attendance.mobile_evidence_warnings warning
             WHERE warning.company_id=$1 AND warning.employee_user_id=$2
               AND warning.work_date BETWEEN $3 AND $4 ORDER BY warning.server_received_at`,
            [companyB, postStartUserId, evidenceDates.verified, evidenceDates.rejected],
          ),
          pool.query<{ record: AttendanceRegularizationRequest }>(
            `SELECT to_jsonb(request)
               || jsonb_build_object('work_date',request.work_date::text,'items','[]'::jsonb) AS record
             FROM attendance.regularization_requests request
             WHERE request.company_id=$1 AND request.employee_user_id=$2
               AND request.work_date BETWEEN $3 AND $4 ORDER BY request.created_at`,
            [companyB, postStartUserId, evidenceDates.verified, evidenceDates.rejected],
          ),
        ]);
      const canonicalStore = {
        ...second.store,
        users: [
          ...second.store.users,
          {
            ...second.store.users.find((user) => user.id === employee.user.id)!,
            id: postStartUserId,
            employee_code: `POST-${postStartUserId}`,
            email: `post-${postStartUserId}@example.test`,
            timezone: "Asia/Kolkata",
          },
        ],
        attendanceDayRecords: canonicalDaysResult.rows.map((row) => row.record),
        attendancePunches: canonicalPunchesResult.rows.map((row) => row.record),
        attendanceGeoFallbackReviews: canonicalReviewsResult.rows.map((row) => row.record),
        attendanceRegularizations: canonicalRegularizationsResult.rows.map((row) => row.record),
        outbox: canonicalOutboxResult.rows.map((row) => row.record),
        attendanceMobileEvidenceWarnings: canonicalWarningsResult.rows.map((row) => row.record),
      };
      const canonicalEvidence = buildAttendanceReportEvidenceIndex(
        canonicalStore,
        canonicalStore.attendanceDayRecords,
      );
      const canonicalSummaries = canonicalStore.attendanceDayRecords.map((day) =>
        canonicalEvidence.summaryFor(day),
      );
      const canonicalAttendance = {
        evidence_categories: countAttendanceReportingEvidenceCategories(
          canonicalSummaries.map((summary) => summary.reporting_evidence_category),
        ),
        source_categories: countAttendanceReportSourceCategories(
          canonicalSummaries.map((summary) => summary.source_categories),
        ),
      };
      expect(evidenceDashboard.json().attendance).toMatchObject(canonicalAttendance);
      expect(evidenceDashboard.json().attendance.window).toEqual({
        date_from: companyCalendar.rows[0]?.start,
        date_to: companyCalendar.rows[0]?.today,
        max_months: 12,
      });
      expect(canonicalAttendance).toEqual({
        evidence_categories: {
          verified: 1,
          warning: 1,
          provisional: 1,
          review_required: 1,
          rejected: 1,
        },
        source_categories: {
          web: 1,
          geo: 2,
          mobile: 4,
          manual: 2,
          kiosk: 1,
          system: 1,
        },
      });
      await pool.query(
        "UPDATE core.users SET timezone='Asia/Kolkatta' WHERE id=$1",
        [postStartUserId],
      );
      const invalidEmployeeTimeZoneDashboard = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(postStartJwt.token),
      });
      expect(
        invalidEmployeeTimeZoneDashboard.statusCode,
        invalidEmployeeTimeZoneDashboard.body,
      ).toBe(200);
      await pool.query(
        "UPDATE core.users SET timezone='Asia/Kolkata' WHERE id=$1",
        [postStartUserId],
      );
      const companyBObserverId = randomUUID();
      await pool.query(
        `INSERT INTO core.users
          (id,employee_code,email,full_name,department_id,designation_id,manager_user_id,
           hierarchy_path,employment_status,email_verified_at,email_verification_status)
         SELECT $1,$2,$3,'Company B attendance observer',$4,designation_id,manager_user_id,
           hierarchy_path || text2ltree($5),'active',now(),'verified'
         FROM core.users WHERE id=$6`,
        [
          companyBObserverId,
          `B-OBS-${companyBObserverId}`,
          `b-observer-${companyBObserverId}@example.test`,
          companyBDepartmentId,
          `bobs${companyBObserverId.replaceAll("-", "")}`,
          employee.user.id,
        ],
      );
      await pool.query(
        `INSERT INTO core.user_roles (user_id,role_key,status,effective_from)
         VALUES ($1,'Admin','active',CURRENT_DATE)`,
        [companyBObserverId],
      );
      await pool.query(
        `INSERT INTO platform.user_session_preferences (user_id,active_role,company_id)
         VALUES ($1,'Admin',$2)`,
        [companyBObserverId, companyB],
      );
      const companyBObserverJwt = createJwt(
        {
          ...employee.user,
          id: companyBObserverId,
          employee_code: `B-OBS-${companyBObserverId}`,
          email: `b-observer-${companyBObserverId}@example.test`,
          full_name: "Company B attendance observer",
          department_id: companyBDepartmentId,
          roles: ["Admin"],
        },
        second.config.JWT_SECRET,
      );
      await second.store.sessionStore.create({
        jti: companyBObserverJwt.jti,
        user_id: companyBObserverId,
        expires_at: companyBObserverJwt.expiresAt,
        revoked_at: null,
      });
      const companyBObserverBefore = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(companyBObserverJwt.token),
      });
      expect(companyBObserverBefore.statusCode, companyBObserverBefore.body).toBe(200);
      expect(companyBObserverBefore.json().attendance).toMatchObject(canonicalAttendance);
      const companyBExceptionCount = companyBObserverBefore.json().cards.find(
        (card: { key: string }) => card.key === "attendance_exceptions",
      )?.value;
      expect(companyBExceptionCount).toBeGreaterThanOrEqual(5);

      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
        [admin.user.id, companyA],
      );
      const companyABeforeTransfer = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(admin.token),
      });
      expect(companyABeforeTransfer.statusCode, companyABeforeTransfer.body).toBe(200);
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
        [postStartUserId, companyA],
      );
      const companyBAfterTransfer = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(companyBObserverJwt.token),
      });
      expect(companyBAfterTransfer.statusCode, companyBAfterTransfer.body).toBe(200);
      expect(companyBAfterTransfer.json().attendance).toMatchObject(canonicalAttendance);
      expect(companyBAfterTransfer.json().cards.find(
        (card: { key: string }) => card.key === "attendance_exceptions",
      )?.value).toBe(companyBExceptionCount);
      const companyAAfterTransfer = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(admin.token),
      });
      expect(companyAAfterTransfer.statusCode, companyAAfterTransfer.body).toBe(200);
      expect(companyAAfterTransfer.json().attendance).toEqual(
        companyABeforeTransfer.json().attendance,
      );

      await pool.query("UPDATE core.users SET deleted_at=now() WHERE id=$1", [postStartUserId]);
      const companyBAfterDeletion = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(companyBObserverJwt.token),
      });
      expect(companyBAfterDeletion.statusCode, companyBAfterDeletion.body).toBe(200);
      expect(companyBAfterDeletion.json().attendance).toMatchObject(canonicalAttendance);
      expect(companyBAfterDeletion.json().cards.find(
        (card: { key: string }) => card.key === "attendance_exceptions",
      )?.value).toBe(companyBExceptionCount);
      await pool.query("UPDATE core.users SET deleted_at=NULL WHERE id=$1", [postStartUserId]);
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
        [postStartUserId, companyB],
      );
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
        [admin.user.id, companyB],
      );
      const selfOnlyUserId = randomUUID();
      await pool.query(
        `INSERT INTO core.users
          (id,employee_code,email,full_name,department_id,designation_id,manager_user_id,
           hierarchy_path,employment_status,email_verified_at,email_verification_status)
         SELECT $1,$2,$3,'Self only employee',department_id,designation_id,
                manager_user_id,hierarchy_path || text2ltree($4),'active',now(),'verified'
         FROM core.users WHERE id=$5`,
        [
          selfOnlyUserId,
          `SELF-${selfOnlyUserId}`,
          `self-${selfOnlyUserId}@example.test`,
          `self${selfOnlyUserId.replaceAll("-", "")}`,
          employee.user.id,
        ],
      );
      await pool.query(
        `INSERT INTO core.user_roles (user_id,role_key,status,effective_from)
         VALUES ($1,'Employee','active',CURRENT_DATE)`,
        [selfOnlyUserId],
      );
      await pool.query(
        `INSERT INTO platform.user_session_preferences (user_id,active_role,company_id)
         VALUES ($1,'Employee',$2)`,
        [selfOnlyUserId, companyB],
      );
      const selfOnlyJwt = createJwt(
        {
          ...employee.user,
          id: selfOnlyUserId,
          employee_code: `SELF-${selfOnlyUserId}`,
          email: `self-${selfOnlyUserId}@example.test`,
          full_name: "Self only employee",
          roles: ["Employee"],
        },
        second.config.JWT_SECRET,
      );
      await second.store.sessionStore.create({
        jti: selfOnlyJwt.jti,
        user_id: selfOnlyUserId,
        expires_at: selfOnlyJwt.expiresAt,
        revoked_at: null,
      });
      const selfOnlyDashboard = await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(selfOnlyJwt.token),
      });
      expect(selfOnlyDashboard.statusCode, selfOnlyDashboard.body).toBe(200);
      expect(selfOnlyDashboard.json().attendance).toMatchObject({
        evidence_categories: {
          verified: 0,
          warning: 0,
          provisional: 0,
          review_required: 0,
          rejected: 0,
        },
        source_categories: {
          web: 0,
          geo: 0,
          mobile: 0,
          manual: 0,
          kiosk: 0,
          system: 0,
        },
      });
      try {
        await pool.query(
          `INSERT INTO attendance.daily_records
            (company_id,employee_user_id,work_date,status,day_classification,
             presence_state,punctuality_state,evidence_state,approval_kind,
             approval_state,payroll_state)
           SELECT $1,$2,date '1980-01-01' + series,'future','future','not_started',
             'not_applicable','not_applicable','none','not_required','unprocessed'
           FROM generate_series(0,10000) AS series`,
          [companyB, postStartUserId],
        );
        const oldHistoryDashboard = await second.inject({
          method: "GET",
          url: "/api/v1/dashboard/summary",
          headers: authHeader(postStartJwt.token),
        });
        expect(oldHistoryDashboard.statusCode, oldHistoryDashboard.body).toBe(200);
        expect(oldHistoryDashboard.json().attendance).toMatchObject(canonicalAttendance);
      } finally {
        await pool.query(
          `DELETE FROM attendance.daily_records
           WHERE company_id=$1 AND employee_user_id=$2
             AND work_date >= date '1980-01-01'
             AND work_date < date '1980-01-01' + 10001`,
          [companyB, postStartUserId],
        );
      }
      const dashboardBoundPrefix = randomUUID().replaceAll("-", "").slice(0, 8);
      try {
        await pool.query(
          `INSERT INTO core.users
            (id,employee_code,email,full_name,department_id,designation_id,
             manager_user_id,hierarchy_path,employment_status,email_verified_at,
             email_verification_status)
           SELECT gen_random_uuid(),'DBND' || series::text || $1,
             'dbnd' || series::text || $1 || '@example.test',
             'Dashboard boundary employee',
             template.department_id,template.designation_id,template.manager_user_id,
             template.hierarchy_path || text2ltree('dbnd' || series::text || $1),
             'active',now(),'verified'
           FROM generate_series(1,10001) AS series
           CROSS JOIN LATERAL (
             SELECT department_id,designation_id,manager_user_id,hierarchy_path
             FROM core.users WHERE id=$2
           ) template`,
          [dashboardBoundPrefix, employee.user.id],
        );
        await pool.query(
          `INSERT INTO platform.user_session_preferences (user_id,active_role,company_id)
           SELECT id,'Employee',$1 FROM core.users WHERE employee_code LIKE $2`,
          [companyB, `DBND%${dashboardBoundPrefix}`],
        );
        await pool.query(
          `INSERT INTO attendance.daily_records
            (company_id,employee_user_id,work_date,status,day_classification,
             presence_state,punctuality_state,evidence_state,approval_kind,
             approval_state,payroll_state)
           SELECT $1,id,CURRENT_DATE,'future','future','not_started','not_applicable',
             'not_applicable','none','not_required','unprocessed'
           FROM core.users WHERE employee_code LIKE $2`,
          [companyB, `DBND%${dashboardBoundPrefix}`],
        );
        const boundedAttendance = await second.inject({
          method: "GET",
          url: "/api/v1/dashboard/summary",
          headers: authHeader(postStartJwt.token),
        });
        expect(boundedAttendance.statusCode, boundedAttendance.body).toBe(400);
        expect(boundedAttendance.body).toContain(
          "at most 10,000 visible days within its rolling 12-month window",
        );
      } finally {
        await pool.query(
          `DELETE FROM attendance.daily_records WHERE employee_user_id IN
            (SELECT id FROM core.users WHERE employee_code LIKE $1)`,
          [`DBND%${dashboardBoundPrefix}`],
        );
        await pool.query(
          `DELETE FROM platform.user_session_preferences WHERE user_id IN
            (SELECT id FROM core.users WHERE employee_code LIKE $1)`,
          [`DBND%${dashboardBoundPrefix}`],
        );
        await pool.query(
          "DELETE FROM core.users WHERE employee_code LIKE $1",
          [`DBND%${dashboardBoundPrefix}`],
        );
      }
      await pool.query(
        `INSERT INTO core.departments (id,company_id,department_code,name)
         SELECT gen_random_uuid(),$1,'BOUND-' || series::text,'Dashboard bound ' || series::text
         FROM generate_series(1,200) AS series`,
        [companyB],
      );
      try {
        const boundedDashboard = await second.inject({
          method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
        });
        expect(boundedDashboard.statusCode, boundedDashboard.body).toBe(400);
        expect(boundedDashboard.body).toContain("at most 200 active departments");
      } finally {
        await pool.query(
          "DELETE FROM core.departments WHERE company_id=$1 AND department_code LIKE 'BOUND-%'",
          [companyB],
        );
      }

      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
        [postStartUserId, companyA],
      );
      const transferredMe = await second.inject({
        method: "GET", url: "/api/v1/auth/me", headers: authHeader(postStartJwt.token),
      });
      expect(transferredMe.statusCode, transferredMe.body).toBe(200);
      expect(transferredMe.json().company.id).toBe(companyA);
      const genericA = await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      });
      expect(genericA.statusCode, genericA.body).toBe(200);
      expect(genericA.json().workforce.active_employees).toBe(await companyActiveCount(companyA));
      expect(genericA.json().operations.outbox_pending).toBeGreaterThanOrEqual(1);
      await pool.query(
        `INSERT INTO platform.notifications (target_user_id,event_type,payload)
         VALUES ($1,'legacy.company-a',jsonb_build_object('company_id',$2::text))`,
        [postStartUserId, companyA],
      );
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
        [postStartUserId, companyB],
      );

      const transferredBackDashboard = await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      });
      expect(transferredBackDashboard.statusCode, transferredBackDashboard.body).toBe(200);
      expect(transferredBackDashboard.json()).toMatchObject({
        approvals: { timesheet_pending: 0, leave_pending: 0, wfh_pending: 0 },
        operations: {
          assets_total: 0,
          assets_assigned: 0,
          assets_recovery_pending: 0,
          notifications_pending: 0,
        },
        workload: {
          work_segments_total: 0,
          submitted_hours_total: "0.00",
          timesheet_submissions_total: 0,
          timesheet_submissions_approved: 0,
          timesheet_submissions_returned: 0,
        },
      });
      expect(transferredBackDashboard.json().unavailable_features.map(
        (feature: { key: string }) => feature.key,
      )).toEqual(expect.arrayContaining([
        "timesheets_historical_ownership",
        "leave_wfh_historical_ownership",
        "assets_historical_ownership",
        "notifications_historical_ownership",
      ]));

      const postStartAdminRole = await pool.query<{ id: string }>(
        "SELECT id FROM core.user_roles WHERE user_id=$1 AND role_key='Admin'",
        [postStartUserId],
      );
      const postStartAdminRoleId = postStartAdminRole.rows[0]?.id;
      expect(postStartAdminRoleId).toBeTruthy();
      if (!postStartAdminRoleId) throw new Error("Post-start Admin role required");
      await pool.query(
        "UPDATE platform.user_session_preferences SET active_role='Employee' WHERE user_id=$1",
        [postStartUserId],
      );
      const secondaryAdminCurrent = await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      });
      expect(secondaryAdminCurrent.statusCode, secondaryAdminCurrent.body).toBe(200);
      expect(secondaryAdminCurrent.json().scope).toMatchObject({
        primary_role: "Employee",
        visibility: "all",
      });
      await pool.query("UPDATE core.user_roles SET status='inactive' WHERE id=$1", [postStartAdminRoleId]);
      const secondaryAdminRemoved = await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      });
      expect(secondaryAdminRemoved.statusCode, secondaryAdminRemoved.body).toBe(200);
      expect(secondaryAdminRemoved.json().scope).toMatchObject({
        primary_role: "Employee",
        roles: ["Employee"],
        visibility: "self_and_descendants",
      });
      expect(secondaryAdminRemoved.json().workforce.active_employees).toBeLessThan(
        secondaryAdminCurrent.json().workforce.active_employees,
      );
      await pool.query(
        "UPDATE core.user_roles SET status='active',effective_from=CURRENT_DATE,effective_to=NULL WHERE id=$1",
        [postStartAdminRoleId],
      );
      expect((await second.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(postStartJwt.token),
      })).json().scope.visibility).toBe("all");
      await pool.query(
        "UPDATE platform.user_session_preferences SET active_role='Admin' WHERE user_id=$1",
        [postStartUserId],
      );
      await pool.query("UPDATE core.user_roles SET status='inactive' WHERE id=$1", [postStartAdminRoleId]);
      expect((await second.inject({ method: "GET", url: "/api/v1/auth/me",
        headers: authHeader(postStartJwt.token) })).statusCode).toBe(403);
      expect((await second.inject({ method: "GET", url: "/api/v1/dashboard/summary",
        headers: authHeader(postStartJwt.token) })).statusCode).toBe(403);
      await pool.query(
        "UPDATE core.user_roles SET status='active',effective_from=CURRENT_DATE-10,effective_to=CURRENT_DATE-1 WHERE id=$1",
        [postStartAdminRoleId],
      );
      expect((await second.inject({ method: "GET", url: "/api/v1/auth/me",
        headers: authHeader(postStartJwt.token) })).statusCode).toBe(403);
      await pool.query(
        "UPDATE core.user_roles SET status='active',effective_from=CURRENT_DATE,effective_to=NULL WHERE id=$1",
        [postStartAdminRoleId],
      );
      expect((await second.inject({ method: "GET", url: "/api/v1/auth/me",
        headers: authHeader(postStartJwt.token) })).statusCode).toBe(200);
      await pool.query("UPDATE platform.company_profiles SET status='inactive' WHERE id=$1", [companyB]);
      expect((await second.inject({ method: "GET", url: "/api/v1/auth/me",
        headers: authHeader(postStartJwt.token) })).statusCode).toBe(400);
      expect((await second.inject({ method: "GET", url: "/api/v1/dashboard/summary",
        headers: authHeader(postStartJwt.token) })).statusCode).toBe(400);
      await pool.query("UPDATE platform.company_profiles SET status='active' WHERE id=$1", [companyB]);
      const postStartAuditReport = await second.inject({
        method: "GET",
        url: "/api/v1/reports/audit?page=1&page_size=10",
        headers: authHeader(postStartJwt.token),
      });
      expect(postStartAuditReport.statusCode, postStartAuditReport.body).toBe(200);
      await pool.query(
        "UPDATE core.users SET employment_status='inactive' WHERE id=$1",
        [postStartUserId],
      );
      expect((await second.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authHeader(postStartJwt.token),
      })).statusCode).toBe(401);
      await pool.query(
        "UPDATE core.users SET employment_status='active' WHERE id=$1",
        [postStartUserId],
      );
      expect((await second.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(postStartJwt.token),
      })).statusCode).toBe(200);

      const financeAdminRoleId = randomUUID();
      await pool.query(
        `INSERT INTO core.user_roles (id,user_id,role_key,status,effective_from)
         VALUES ($1,$2,'Admin','active',CURRENT_DATE)`,
        [financeAdminRoleId, finance.user.id],
      );
      await pool.query(
        "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Finance Manager'",
        [finance.user.id],
      );
      try {
        const secondRevoked = await second.inject({
          method: "GET",
          url: `/api/v1/expenses/${ticketId}/finance-detail`,
          headers: authHeader(finance.token),
        });
        expect(secondRevoked.statusCode).toBe(403);
      } finally {
        await pool.query(
          "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Finance Manager'",
          [finance.user.id],
        );
        await pool.query("DELETE FROM core.user_roles WHERE id=$1", [financeAdminRoleId]);
      }
      expect((await second.inject({
        method: "GET",
        url: `/api/v1/expenses/${ticketId}/finance-detail`,
        headers: authHeader(finance.token),
      })).statusCode).toBe(200);
    } finally {
      await second.close();
    }

    await pool.query(
      "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Finance Manager'",
      [finance.user.id],
    );
    const revoked = await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/finance-detail`, headers: authHeader(finance.token) });
    expect(revoked.statusCode).toBe(403);
    await pool.query("UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Finance Manager'", [finance.user.id]);
    await pool.query("UPDATE core.roles SET status='inactive' WHERE role_key='Finance Manager'");
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}/finance-detail`, headers: authHeader(finance.token) })).statusCode).toBe(403);

    await pool.query("UPDATE core.roles SET status='active' WHERE role_key='Finance Manager'");
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=ANY($1::uuid[])",
      [[admin.user.id, auditor.user.id], companyA],
    );
    commandReader = await buildRealApp({ reset: false });
    await commandReader.ready();
    const conflictingLegacyAudit = await pool.connect();
    try {
      await conflictingLegacyAudit.query("BEGIN");
      await conflictingLegacyAudit.query("SELECT set_config('app.expense_command_v1','on',true)");
      await conflictingLegacyAudit.query(
        `INSERT INTO expenses.expense_audit_logs
          (ticket_id,actor_user_id,event_type,remarks,new_value)
         VALUES ($1,$2,'expense.owner.audited_repair','Typed owner overrides conflicting legacy JSON',
           jsonb_build_object('company_id',$3::text))`,
        [ticketId, admin.user.id, companyB],
      );
      await conflictingLegacyAudit.query("COMMIT");
    } catch (error) {
      await conflictingLegacyAudit.query("ROLLBACK");
      throw error;
    } finally {
      conflictingLegacyAudit.release();
    }
    const conflictingLegacyContext = await app.store.persistence?.auditReportReadContext?.(
      admin.user.id,
    );
    expect(conflictingLegacyContext).toBeDefined();
    if (!conflictingLegacyContext) throw new Error("PostgreSQL audit context required");
    const conflictingLegacyTicket = conflictingLegacyContext.store.tickets.find(
      (candidate) => candidate.id === ticketId,
    );
    expect(conflictingLegacyTicket).toBeDefined();
    if (!conflictingLegacyTicket) throw new Error("Typed audit ticket required");
    conflictingLegacyTicket.context_payload = { company_id: companyB };
    expect(new ReportService(conflictingLegacyContext.store).auditReport(
      conflictingLegacyContext.actor,
      { page: 1, page_size: 50, action: "audited_repair" },
      conflictingLegacyContext.companyId,
    ).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: ticketId, action: "expense.owner.audited_repair" }),
    ]));
    const typedAuditReport = await commandReader.inject({
      method: "GET",
      url: "/api/v1/reports/audit?page=1&page_size=50&action=audited_repair",
      headers: authHeader(admin.token),
    });
    expect(typedAuditReport.statusCode, typedAuditReport.body).toBe(200);
    expect(typedAuditReport.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: ticketId, action: "expense.owner.audited_repair" }),
    ]));
    const financeHeaders = { ...authHeader(finance.token), "idempotency-key": `expense-approve-${ticketId}` };
    const approvePayload = { decision: "verify", expected_version: 1 };
    const historyBeforeCommand = await commandReader.inject({
      method: "GET",
      url: `/api/v1/reports/expenses/finance-history?page=1&page_size=50&requester_user_id=${employee.user.id}`,
      headers: authHeader(finance.token),
    });
    expect(historyBeforeCommand.statusCode, historyBeforeCommand.body).toBe(200);
    const notificationsBeforeCommand = await commandReader.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision",
      headers: authHeader(employee.token),
    });
    expect(notificationsBeforeCommand.statusCode, notificationsBeforeCommand.body).toBe(200);
    const unreadNotificationsBeforeCommand = await commandReader.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision&unread_only=true",
      headers: authHeader(employee.token),
    });
    expect(unreadNotificationsBeforeCommand.statusCode, unreadNotificationsBeforeCommand.body).toBe(200);
    const adminDashboardBeforeTypedOutbox = await commandReader.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(adminDashboardBeforeTypedOutbox.statusCode, adminDashboardBeforeTypedOutbox.body).toBe(200);
    await pool.query(
      `INSERT INTO platform.outbox_events
       (aggregate_type,aggregate_id,event_type,payload,idempotency_key)
       VALUES ('expense_ticket',$1,'expense.typed-owner-only','{}'::jsonb,$2)`,
      [ticketId, `typed-owner-only-${ticketId}`],
    );
    const adminDashboardBeforeApprove = await commandReader.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(adminDashboardBeforeApprove.statusCode, adminDashboardBeforeApprove.body).toBe(200);
    expect(adminDashboardBeforeApprove.json().operations.outbox_pending).toBe(
      adminDashboardBeforeTypedOutbox.json().operations.outbox_pending + 1,
    );
    const malformedCommandState = async () => (await pool.query(
      `SELECT t.status,t.version,
        (SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=t.id) AS approvals,
        (SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=t.id) AS payments,
        (SELECT count(*) FROM expenses.expense_audit_logs WHERE ticket_id=t.id) AS audits,
        (SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=t.id) AS command_results,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=t.id) AS outbox,
        (SELECT count(*) FROM platform.notifications WHERE payload->>'ticket_id'=t.id::text) AS notifications
       FROM expenses.expense_tickets t WHERE t.id=$1`,
      [ticketId],
    )).rows[0];
    const assertMalformedCommandKeys = async (
      url: string,
      payload: Record<string, unknown>,
      phase: string,
    ) => {
      const before = await malformedCommandState();
      for (const [label, key] of [
        ["too-short", "short"],
        ["invalid-character", "invalid/key"],
        ["too-long", "x".repeat(201)],
      ] as const) {
        const denied = await app.inject({
          method: "POST",
          url,
          headers: { ...authHeader(finance.token), "idempotency-key": key },
          payload,
        });
        expect(denied.statusCode, `${phase} ${label}`).toBe(400);
      }
      expect(await malformedCommandState()).toEqual(before);
    };
    await assertMalformedCommandKeys(
      `/api/v1/expenses/${ticketId}/finance/approve`, approvePayload, "approve",
    );
    const missingCommandKey = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: authHeader(finance.token),
      payload: approvePayload,
    });
    expect(missingCommandKey.statusCode).toBe(400);
    expect((await pool.query("SELECT version FROM expenses.expense_tickets WHERE id=$1", [ticketId])).rows[0]?.version).toBe(1);
    expect(Number((await pool.query(
      "SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=$1", [ticketId],
    )).rows[0]?.count)).toBe(0);
    let financeEmployeeRoleId = (await pool.query<{ id: string }>(
      "SELECT id FROM core.user_roles WHERE user_id=$1 AND role_key='Employee'",
      [finance.user.id],
    )).rows[0]?.id;
    const financeEmployeeRoleAdded = !financeEmployeeRoleId;
    if (!financeEmployeeRoleId) {
      financeEmployeeRoleId = randomUUID();
      await pool.query(
        `INSERT INTO core.user_roles (id,user_id,role_key,status,effective_from)
         VALUES ($1,$2,'Employee','active',CURRENT_DATE)`,
        [financeEmployeeRoleId, finance.user.id],
      );
    }
    await pool.query(
      "UPDATE platform.user_session_preferences SET active_role='Employee' WHERE user_id=$1",
      [finance.user.id],
    );
    const financeRole = await pool.query<{ id: string }>(
      "SELECT id FROM core.user_roles WHERE user_id=$1 AND role_key='Finance Manager'",
      [finance.user.id],
    );
    const financeRoleId = financeRole.rows[0]?.id;
    expect(financeRoleId).toBeTruthy();
    if (!financeRoleId) throw new Error("Finance role fixture required");
    const beforeStaleApprove = await malformedCommandState();
    await pool.query("UPDATE core.user_roles SET status='inactive' WHERE id=$1", [financeRoleId]);
    expect((await app.inject({
      method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: { ...authHeader(finance.token), "idempotency-key": `stale-secondary-approve-${ticketId}` },
      payload: approvePayload,
    })).statusCode).toBe(403);
    expect(await malformedCommandState()).toEqual(beforeStaleApprove);
    await pool.query(
      "UPDATE core.user_roles SET status='active',effective_from=CURRENT_DATE,effective_to=NULL WHERE id=$1",
      [financeRoleId],
    );
    const approved = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: financeHeaders, payload: approvePayload });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toEqual({ id: ticketId, status: "Finance Approved", version: 2 });
    const approveReplay = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: financeHeaders, payload: approvePayload });
    expect(approveReplay.statusCode, approveReplay.body).toBe(200);
    expect(approveReplay.json()).toEqual(approved.json());
    const commandSideEffects = async () => (await pool.query(
      `SELECT t.status,t.version,
        (SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=t.id) AS approvals,
        (SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=t.id) AS payments,
        (SELECT count(*) FROM expenses.expense_audit_logs WHERE ticket_id=t.id) AS audits,
        (SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=t.id) AS command_results,
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=t.id) AS outbox,
        (SELECT count(*) FROM platform.notifications WHERE payload->>'ticket_id'=t.id::text) AS notifications
       FROM expenses.expense_tickets t WHERE t.id=$1`,
      [ticketId],
    )).rows[0];
    const assertNonFinanceCommandDenied = async (
      phase: "payment" | "settlement",
      url: string,
      payload: Record<string, unknown>,
    ) => {
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=ANY($1::uuid[])",
        [[admin.user.id, auditor.user.id], companyA],
      );
      const before = await commandSideEffects();
      try {
        for (const [roleLabel, deniedActor] of [["admin", admin], ["auditor", auditor]] as const) {
          const denied = await app.inject({
            method: "POST",
            url,
            headers: {
              ...authHeader(deniedActor.token),
              "idempotency-key": `${phase}-${roleLabel}-${ticketId}`,
            },
            payload,
          });
          expect(denied.statusCode, `${phase} ${roleLabel}`).toBe(403);
        }
        const multiRoleId = randomUUID();
        await pool.query(
          `INSERT INTO core.user_roles (id,user_id,role_key,status,effective_from)
           VALUES ($1,$2,'Auditor','active',CURRENT_DATE)`,
          [multiRoleId, admin.user.id],
        );
        try {
          const multiRoleDenied = await app.inject({
            method: "POST",
            url,
            headers: {
              ...authHeader(admin.token),
              "idempotency-key": `${phase}-admin-auditor-${ticketId}`,
            },
            payload,
          });
          expect(multiRoleDenied.statusCode, `${phase} admin+auditor`).toBe(403);
        } finally {
          await pool.query("DELETE FROM core.user_roles WHERE id=$1", [multiRoleId]);
        }
      } finally {
        await pool.query(
          "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=ANY($1::uuid[])",
          [[admin.user.id, auditor.user.id], companyA],
        );
      }
      expect(await commandSideEffects()).toEqual(before);
    };
    const sameInstanceHistory = await app.inject({
      method: "GET",
      url: `/api/v1/reports/expenses/finance-history?page=1&page_size=50&requester_user_id=${employee.user.id}`,
      headers: authHeader(finance.token),
    });
    expect(sameInstanceHistory.statusCode, sameInstanceHistory.body).toBe(200);
    expect(sameInstanceHistory.json().total).toBe(historyBeforeCommand.json().total + 1);
    expect(sameInstanceHistory.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        audit_event_type: "expense.finance.verify",
        ticket: expect.objectContaining({ id: ticketId, status: "Finance Approved" }),
      }),
    ]));
    const sameInstanceNotifications = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision",
      headers: authHeader(employee.token),
    });
    expect(sameInstanceNotifications.statusCode, sameInstanceNotifications.body).toBe(200);
    expect(sameInstanceNotifications.json().total).toBe(notificationsBeforeCommand.json().total + 1);
    expect(sameInstanceNotifications.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "expense.finance_decision", target_user_id: employee.user.id }),
    ]));
    const approvalNotification = sameInstanceNotifications.json().items.find(
      (item: { description: string }) => item.description.includes(ticketId),
    );
    expect(approvalNotification).toEqual(expect.objectContaining({
      type: "expense.finance_decision",
      target_user_id: employee.user.id,
      read: false,
    }));
    {
      const secondHistory = await commandReader.inject({
        method: "GET",
        url: `/api/v1/reports/expenses/finance-history?page=1&page_size=50&requester_user_id=${employee.user.id}`,
        headers: authHeader(finance.token),
      });
      expect(secondHistory.statusCode, secondHistory.body).toBe(200);
      expect(secondHistory.json().total).toBe(sameInstanceHistory.json().total);
      expect(secondHistory.json().items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          audit_event_type: "expense.finance.verify",
          ticket: expect.objectContaining({ id: ticketId, status: "Finance Approved" }),
        }),
      ]));
      const secondNotifications = await commandReader.inject({
        method: "GET",
        url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision",
        headers: authHeader(employee.token),
      });
      expect(secondNotifications.statusCode, secondNotifications.body).toBe(200);
      expect(secondNotifications.json().total).toBe(sameInstanceNotifications.json().total);
      expect(secondNotifications.json().items).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "expense.finance_decision", target_user_id: employee.user.id }),
      ]));
      const secondUnreadBeforeMark = await commandReader.inject({
        method: "GET",
        url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision&unread_only=true",
        headers: authHeader(employee.token),
      });
      expect(secondUnreadBeforeMark.statusCode, secondUnreadBeforeMark.body).toBe(200);
      expect(secondUnreadBeforeMark.json().total).toBe(unreadNotificationsBeforeCommand.json().total + 1);
      const markedBySecondInstance = await commandReader.inject({
        method: "POST",
        url: `/api/v1/notifications/${approvalNotification.id}/read`,
        headers: authHeader(employee.token),
        payload: { expected_version: approvalNotification.version },
      });
      expect(markedBySecondInstance.statusCode, markedBySecondInstance.body).toBe(200);
      expect(markedBySecondInstance.json().notification).toEqual(expect.objectContaining({
        id: approvalNotification.id,
        read: true,
        version: approvalNotification.version + 1,
      }));
      const idempotentSameInstance = await app.inject({
        method: "POST",
        url: `/api/v1/notifications/${approvalNotification.id}/read`,
        headers: authHeader(employee.token),
        payload: {},
      });
      expect(idempotentSameInstance.statusCode, idempotentSameInstance.body).toBe(200);
      expect(idempotentSameInstance.json().notification.version).toBe(approvalNotification.version + 1);
      for (const reader of [app, commandReader]) {
        const afterMark = await reader.inject({
          method: "GET",
          url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision&unread_only=true",
          headers: authHeader(employee.token),
        });
        expect(afterMark.statusCode, afterMark.body).toBe(200);
        expect(afterMark.json().total).toBe(unreadNotificationsBeforeCommand.json().total);
        const fullList = await reader.inject({
          method: "GET",
          url: "/api/v1/notifications?page=1&page_size=50&type=expense.finance_decision",
          headers: authHeader(employee.token),
        });
        expect(fullList.statusCode, fullList.body).toBe(200);
        expect(fullList.json().items).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: approvalNotification.id, read: true }),
        ]));
      }
    }
    const adminDashboardAfterApprove = await commandReader.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(adminDashboardAfterApprove.statusCode, adminDashboardAfterApprove.body).toBe(200);
    expect(adminDashboardAfterApprove.json().operations.outbox_pending).toBe(
      adminDashboardBeforeApprove.json().operations.outbox_pending + 1,
    );
    expect((await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: financeHeaders, payload: { ...approvePayload, remarks: "different" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: { ...authHeader(foreignFinance.token), "idempotency-key": `foreign-${ticketId}` },
      payload: approvePayload })).statusCode).toBe(404);
    await pool.query("UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Finance Manager'", [finance.user.id]);
    expect((await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: financeHeaders, payload: approvePayload })).statusCode).toBe(403);
    await pool.query("UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Finance Manager'", [finance.user.id]);

    const paymentKey = `expense-payment-${ticketId}`;
    const paymentPayload = { payment_date: "2026-11-11", amount: "100.00", payment_mode: "NEFT",
      reference_no: `PAY-${ticketId}`, expected_version: 2 };
    await assertMalformedCommandKeys(
      `/api/v1/expenses/${ticketId}/finance/payment`, paymentPayload, "payment",
    );
    await assertNonFinanceCommandDenied(
      "payment", `/api/v1/expenses/${ticketId}/finance/payment`, paymentPayload,
    );
    const beforeStalePayment = await commandSideEffects();
    await pool.query(
      "UPDATE core.user_roles SET effective_from=CURRENT_DATE-10,effective_to=CURRENT_DATE-1 WHERE id=$1",
      [financeRoleId],
    );
    expect((await app.inject({
      method: "POST", url: `/api/v1/expenses/${ticketId}/finance/payment`,
      headers: { ...authHeader(finance.token), "idempotency-key": `stale-secondary-payment-${ticketId}` },
      payload: paymentPayload,
    })).statusCode).toBe(403);
    expect(await commandSideEffects()).toEqual(beforeStalePayment);
    await pool.query(
      "UPDATE core.user_roles SET effective_from=CURRENT_DATE,effective_to=NULL WHERE id=$1",
      [financeRoleId],
    );
    const paymentUnreadBeforeCommand = await commandReader.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=50&type=expense.payment_released&unread_only=true",
      headers: authHeader(employee.token),
    });
    expect(paymentUnreadBeforeCommand.statusCode, paymentUnreadBeforeCommand.body).toBe(200);
    const paid = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/payment`,
      headers: { ...authHeader(finance.token), "idempotency-key": paymentKey }, payload: paymentPayload });
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json()).toEqual({ id: ticketId, status: "Payment Released", version: 3 });
    const paymentReplay = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/payment`,
      headers: { ...authHeader(finance.token), "idempotency-key": paymentKey }, payload: paymentPayload });
    expect(paymentReplay.statusCode, paymentReplay.body).toBe(200);
    expect(paymentReplay.json()).toEqual(paid.json());
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=$1", [ticketId])).rows[0]?.count)).toBe(1);
    {
      for (const reader of [app, commandReader]) {
        const paymentUnread = await reader.inject({
          method: "GET",
          url: "/api/v1/notifications?page=1&page_size=50&type=expense.payment_released&unread_only=true",
          headers: authHeader(employee.token),
        });
        expect(paymentUnread.statusCode, paymentUnread.body).toBe(200);
        expect(paymentUnread.json().total).toBe(paymentUnreadBeforeCommand.json().total + 1);
      }
      const markPaymentRead = await commandReader.inject({
        method: "POST",
        url: "/api/v1/notifications/read-all",
        headers: authHeader(employee.token),
        payload: { type: "expense.payment_released" },
      });
      expect(markPaymentRead.statusCode, markPaymentRead.body).toBe(200);
      expect(markPaymentRead.json().updated_count).toBe(paymentUnreadBeforeCommand.json().total + 1);
      expect(markPaymentRead.json().has_more).toBe(false);
      const repeatedMarkAll = await app.inject({
        method: "POST",
        url: "/api/v1/notifications/read-all",
        headers: authHeader(employee.token),
        payload: { type: "expense.payment_released" },
      });
      expect(repeatedMarkAll.statusCode, repeatedMarkAll.body).toBe(200);
      expect(repeatedMarkAll.json().updated_count).toBe(0);
      expect(repeatedMarkAll.json().has_more).toBe(false);
      for (const reader of [app, commandReader]) {
        const paymentUnread = await reader.inject({
          method: "GET",
          url: "/api/v1/notifications?page=1&page_size=50&type=expense.payment_released&unread_only=true",
          headers: authHeader(employee.token),
        });
        expect(paymentUnread.statusCode, paymentUnread.body).toBe(200);
        expect(paymentUnread.json().total).toBe(0);
      }
    }

    const settleUrl = `/api/v1/expenses/${ticketId}/settlement`;
    const settleHeaders = { ...authHeader(finance.token), "idempotency-key": `expense-settle-${ticketId}` };
    const settlePayload = { actual_amount: "100.00", expected_version: 3 };
    await assertMalformedCommandKeys(settleUrl, settlePayload, "settlement");
    await assertNonFinanceCommandDenied("settlement", settleUrl, settlePayload);
    const beforeStaleSettlement = await commandSideEffects();
    await pool.query(
      "UPDATE core.user_roles SET effective_from=CURRENT_DATE+1,effective_to=NULL WHERE id=$1",
      [financeRoleId],
    );
    expect((await app.inject({ method: "POST", url: settleUrl,
      headers: { ...authHeader(finance.token), "idempotency-key": `stale-secondary-settle-${ticketId}` },
      payload: settlePayload })).statusCode).toBe(403);
    expect(await commandSideEffects()).toEqual(beforeStaleSettlement);
    await pool.query(
      "UPDATE core.user_roles SET effective_from=CURRENT_DATE,effective_to=NULL WHERE id=$1",
      [financeRoleId],
    );
    const missingDocuments = await app.inject({ method: "POST", url: settleUrl,
      headers: settleHeaders, payload: settlePayload });
    expect(missingDocuments.statusCode).toBe(400);
    const docsClient = await pool.connect();
    try {
      await docsClient.query("BEGIN");
      await docsClient.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      // A verified link alone is insufficient: missing, foreign-parent,
      // deleted and mismatched metadata must not satisfy closure.
      const invalid = [
        { type: "travel_ticket", parent: ticketId, absent: true, deleted: false, metadataType: "travel_ticket", versionSize: 12 },
        { type: "boarding_pass", parent: companyBTicketId, absent: false, deleted: false, metadataType: "boarding_pass", versionSize: 12 },
        { type: "receipt", parent: ticketId, absent: false, deleted: true, metadataType: "receipt", versionSize: 12 },
        { type: "receipt", parent: ticketId, absent: false, deleted: false, metadataType: "other_type", versionSize: 12 },
        { type: "travel_ticket", parent: ticketId, absent: false, deleted: false, metadataType: "travel_ticket", versionSize: 13 },
        { type: "receipt", parent: ticketId, absent: false, deleted: false, metadataType: "receipt", versionSize: 12, checksumMismatch: true },
      ];
      for (const item of invalid) {
        const documentId = randomUUID();
        const storageKey = `expense-invalid/${documentId}`;
        if (!item.absent) {
          await docsClient.query(
            `INSERT INTO documents.doc_metadata
             (id,business_object_type,business_object_id,classification,document_type,
             file_name,storage_key,mime_type,size_bytes,created_by_user_id,deleted_at,checksum_sha256)
             VALUES ($1,'expense_ticket',$2,'finance',$3,'fixture.pdf',$4,'application/pdf',12,$5,$6,$7)`,
            [documentId, item.parent, item.metadataType, storageKey, employee.user.id,
              item.deleted ? new Date() : null, item.checksumMismatch ? "a".repeat(64) : null],
          );
          await docsClient.query(
            `INSERT INTO documents.doc_versions
             (document_id,version,storage_key,file_name,size_bytes,created_by_user_id,checksum_sha256)
             VALUES ($1,1,$2,'fixture.pdf',$3,$4,$5)`,
            [documentId, storageKey, item.versionSize, employee.user.id,
              item.checksumMismatch ? "b".repeat(64) : null],
          );
        }
        await docsClient.query(
          `INSERT INTO expenses.expense_documents
           (ticket_id,document_id,document_type,verification_status,uploaded_by)
           VALUES ($1,$2,$3,'verified',$4)`,
          [ticketId, documentId, item.type, employee.user.id],
        );
      }
      await docsClient.query("COMMIT");
    } catch (error) {
      await docsClient.query("ROLLBACK");
      throw error;
    } finally {
      docsClient.release();
    }
    expect((await app.inject({ method: "POST", url: settleUrl,
      headers: settleHeaders, payload: settlePayload })).statusCode).toBe(400);
    expect((await pool.query("SELECT version FROM expenses.expense_tickets WHERE id=$1", [ticketId])).rows[0]?.version).toBe(3);
    const validDocs = await pool.connect();
    try {
      await validDocs.query("BEGIN");
      await validDocs.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      for (const documentType of ["travel_ticket", "boarding_pass", "receipt"]) {
        const documentId = randomUUID();
        const storageKey = `expense-valid/${documentId}`;
        await validDocs.query(
          `INSERT INTO documents.doc_metadata
           (id,business_object_type,business_object_id,classification,document_type,
            file_name,storage_key,mime_type,size_bytes,created_by_user_id)
           VALUES ($1,'expense_ticket',$2,'finance',$3,'fixture.pdf',$4,'application/pdf',12,$5)`,
          [documentId, ticketId, documentType, storageKey, employee.user.id],
        );
        await validDocs.query(
          `INSERT INTO documents.doc_versions
           (document_id,version,storage_key,file_name,size_bytes,created_by_user_id)
           VALUES ($1,1,$2,'fixture.pdf',12,$3)`,
          [documentId, storageKey, employee.user.id],
        );
        await validDocs.query(
          `INSERT INTO expenses.expense_documents
           (ticket_id,document_id,document_type,verification_status,uploaded_by)
           VALUES ($1,$2,$3,'verified',$4)`,
          [ticketId, documentId, documentType, employee.user.id],
        );
      }
      await validDocs.query("COMMIT");
    } catch (error) {
      await validDocs.query("ROLLBACK");
      throw error;
    } finally {
      validDocs.release();
    }
    const beforeSettlementDashboard = await commandReader.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(finance.token),
    });
    expect(beforeSettlementDashboard.statusCode, beforeSettlementDashboard.body).toBe(200);
    const financePendingBeforeSettlement = beforeSettlementDashboard.json().approvals.expense_finance_pending;
    expect(financePendingBeforeSettlement).toBeGreaterThan(0);
    {
      const secondBeforeSettlement = await app.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
        headers: authHeader(finance.token),
      });
      expect(secondBeforeSettlement.statusCode, secondBeforeSettlement.body).toBe(200);
      expect(secondBeforeSettlement.json().approvals.expense_finance_pending).toBe(financePendingBeforeSettlement);
    }
    const settled = await app.inject({ method: "POST", url: settleUrl,
      headers: settleHeaders, payload: settlePayload });
    expect(settled.statusCode, settled.body).toBe(200);
    expect(settled.json()).toEqual({ id: ticketId, status: "Closed", version: 4 });
    const settledReplay = await app.inject({ method: "POST", url: settleUrl,
      headers: settleHeaders, payload: settlePayload });
    expect(settledReplay.statusCode, settledReplay.body).toBe(200);
    expect(settledReplay.json()).toEqual(settled.json());
    const sameDashboard = await app.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(finance.token),
    });
    expect(sameDashboard.statusCode, sameDashboard.body).toBe(200);
    expect(sameDashboard.json().approvals.expense_finance_pending).toBe(financePendingBeforeSettlement - 1);
    {
      const secondDashboard = await commandReader.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(finance.token),
      });
      expect(secondDashboard.statusCode, secondDashboard.body).toBe(200);
      expect(secondDashboard.json().approvals.expense_finance_pending).toBe(financePendingBeforeSettlement - 1);
      const secondUnread = await commandReader.inject({
        method: "GET", url: "/api/v1/notifications/unread-count", headers: authHeader(employee.token),
      });
      expect(secondUnread.statusCode, secondUnread.body).toBe(200);
      expect(secondUnread.json().unread_count).toBeGreaterThanOrEqual(1);
    }
    await pool.query(
      `INSERT INTO platform.notifications (target_user_id,event_type,payload)
       SELECT $1,'expense.bulk-continuation',jsonb_build_object('fixture',series)
       FROM generate_series(1,1001) AS series`,
      [employee.user.id],
    );
    const bulkCutoff = new Date().toISOString();
    const firstBulkMark = await commandReader.inject({
      method: "POST", url: "/api/v1/notifications/read-all",
      headers: authHeader(employee.token),
      payload: { type: "expense.bulk-continuation", before: bulkCutoff },
    });
    expect(firstBulkMark.statusCode, firstBulkMark.body).toBe(200);
    expect(firstBulkMark.json()).toMatchObject({ updated_count: 1000, has_more: true });
    const arrivedAfterCutoff = await pool.query<{ id: string }>(
      `INSERT INTO platform.notifications
        (target_user_id,event_type,payload,created_at,updated_at)
       VALUES ($1,'expense.bulk-continuation','{"fixture":"after-cutoff"}',
         $2::timestamptz + interval '1 second',$2::timestamptz + interval '1 second')
       RETURNING id`,
      [employee.user.id, bulkCutoff],
    );
    const arrivedAfterCutoffId = arrivedAfterCutoff.rows[0]?.id;
    expect(arrivedAfterCutoffId).toBeTruthy();
    const bulkRemaining = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=10&type=expense.bulk-continuation&unread_only=true",
      headers: authHeader(employee.token),
    });
    expect(bulkRemaining.statusCode, bulkRemaining.body).toBe(200);
    expect(bulkRemaining.json().total).toBe(2);
    expect(bulkRemaining.json().items.map((item: { id: string }) => item.id)).toContain(
      arrivedAfterCutoffId,
    );
    const secondBulkMark = await app.inject({
      method: "POST", url: "/api/v1/notifications/read-all",
      headers: authHeader(employee.token),
      payload: { type: "expense.bulk-continuation", before: bulkCutoff },
    });
    expect(secondBulkMark.statusCode, secondBulkMark.body).toBe(200);
    expect(secondBulkMark.json()).toMatchObject({ updated_count: 1, has_more: false });
    const bulkFinished = await commandReader.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=10&type=expense.bulk-continuation&unread_only=true",
      headers: authHeader(employee.token),
    });
    expect(bulkFinished.statusCode, bulkFinished.body).toBe(200);
    expect(bulkFinished.json().total).toBe(1);
    expect(bulkFinished.json().items.map((item: { id: string }) => item.id)).toEqual([
      arrivedAfterCutoffId,
    ]);
    const cleanupAfterCutoff = await commandReader.inject({
      method: "POST", url: "/api/v1/notifications/read-all",
      headers: authHeader(employee.token), payload: { type: "expense.bulk-continuation" },
    });
    expect(cleanupAfterCutoff.statusCode, cleanupAfterCutoff.body).toBe(200);
    expect(cleanupAfterCutoff.json()).toMatchObject({ updated_count: 1, has_more: false });
    await commandReader.close();
    commandReader = null;
    await pool.query(
      "UPDATE platform.user_session_preferences SET active_role='Finance Manager' WHERE user_id=$1",
      [finance.user.id],
    );
    if (financeEmployeeRoleAdded) {
      await pool.query("DELETE FROM core.user_roles WHERE id=$1", [financeEmployeeRoleId]);
    }
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=$1", [ticketId])).rows[0]?.count)).toBe(3);
    expect(Number((await pool.query("SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=$1 AND payload->>'company_id'=$2", [ticketId, companyA])).rows[0]?.count)).toBe(4);
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=$1 AND settlement_status='no_balance'", [ticketId])).rows[0]?.count)).toBe(1);
    await expect(pool.query(
      "UPDATE expenses.expense_command_results SET response_body='{}'::jsonb WHERE ticket_id=$1",
      [ticketId],
    )).rejects.toThrow(/immutable audit\/log rows/u);
    await expect(pool.query(
      "DELETE FROM expenses.expense_command_results WHERE ticket_id=$1",
      [ticketId],
    )).rejects.toThrow(/immutable audit\/log rows/u);

    expect((await app.inject({ method: "POST", url: `/api/v1/expenses/${companyBTicketId}/finance/approve`,
      headers: { ...authHeader(employee.token), "idempotency-key": `self-${companyBTicketId}` },
      payload: { decision: "verify", expected_version: 1 } })).statusCode).toBe(403);
    const selfTicketId = randomUUID();
    const selfFixture = await pool.connect();
    try {
      await selfFixture.query("BEGIN");
      await selfFixture.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      await selfFixture.query(
        `INSERT INTO expenses.expense_tickets
         (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
          expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
          estimated_amount,payment_type,finance_approver_id,status,context_payload,
          company_id,owner_resolution_status)
         VALUES ($1,$2,$3,'Finance Manager',$4,'Project','Project Travel','Self fixture',
           'Fixture',CURRENT_DATE,CURRENT_DATE,100,'Advance',$3,'Manager Verified',
           jsonb_build_object('company_id',$5::text),$5::uuid,'typed_creation')`,
        [selfTicketId, `EXP-SELF-${selfTicketId}`, employee.user.id, companyBDepartmentId, companyB],
      );
      await selfFixture.query("COMMIT");
    } catch (error) { await selfFixture.query("ROLLBACK"); throw error; }
    finally { selfFixture.release(); }
    const selfDenied = await app.inject({ method: "POST", url: `/api/v1/expenses/${selfTicketId}/finance/approve`,
      headers: { ...authHeader(employee.token), "idempotency-key": `self-proof-${selfTicketId}` },
      payload: { decision: "verify", expected_version: 1 } });
    expect(selfDenied.statusCode).toBe(403);
    expect(selfDenied.json().code).toBe("SELF_APPROVAL_BLOCKED");
    expect((await pool.query("SELECT version FROM expenses.expense_tickets WHERE id=$1", [selfTicketId])).rows[0]?.version).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=$1", [selfTicketId])).rows[0]?.count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=$1", [selfTicketId])).rows[0]?.count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=$1", [selfTicketId])).rows[0]?.count)).toBe(0);

    const raceTicketId = randomUUID();
    const faultTicketId = randomUUID();
    const fixture = await pool.connect();
    try {
      await fixture.query("BEGIN");
      await fixture.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      for (const id of [raceTicketId, faultTicketId]) {
        await fixture.query(
          `INSERT INTO expenses.expense_tickets
           (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
            expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
            estimated_amount,payment_type,manager_verifier_id,finance_approver_id,status,
            context_payload,company_id,owner_resolution_status)
           VALUES ($1,$2,$3,'Employee',$4,'Project','Project Travel','Race fixture',
             'Fixture',CURRENT_DATE,CURRENT_DATE,100,'Advance',$5,$6,'Manager Verified',
             jsonb_build_object('company_id',$7::text),$7::uuid,'typed_creation')`,
          [id, `EXP-CMD-${id}`, employee.user.id, employee.user.department_id,
            manager.user.id, finance.user.id, companyA],
        );
      }
      await fixture.query("COMMIT");
    } catch (error) {
      await fixture.query("ROLLBACK"); throw error;
    } finally { fixture.release(); }
    const secondWriter = await buildRealApp({ reset: false });
    await secondWriter.ready();
    try {
      const raceUrl = `/api/v1/expenses/${raceTicketId}/finance/approve`;
      const [firstRace, secondRace] = await Promise.all([
        app.inject({ method: "POST", url: raceUrl,
          headers: { ...authHeader(finance.token), "idempotency-key": `race-first-${raceTicketId}` },
          payload: { decision: "verify", expected_version: 1 } }),
        secondWriter.inject({ method: "POST", url: raceUrl,
          headers: { ...authHeader(finance.token), "idempotency-key": `race-second-${raceTicketId}` },
          payload: { decision: "verify", expected_version: 1 } }),
      ]);
      expect([firstRace.statusCode, secondRace.statusCode].sort()).toEqual([200, 409]);
      expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_approvals WHERE ticket_id=$1", [raceTicketId])).rows[0]?.count)).toBe(1);
      expect((await secondWriter.inject({ method: "GET", url: `/api/v1/expenses/${raceTicketId}/finance-detail`,
        headers: authHeader(finance.token) })).json().ticket.status).toBe("Finance Approved");
    } finally { await secondWriter.close(); }
    const racePayment = await app.inject({ method: "POST", url: `/api/v1/expenses/${raceTicketId}/finance/payment`,
      headers: { ...authHeader(finance.token), "idempotency-key": `race-payment-${raceTicketId}` },
      payload: { payment_date: "2026-11-11", amount: "100.00", payment_mode: "NEFT",
        reference_no: `PAY-${raceTicketId}`, expected_version: 2 } });
    expect(racePayment.statusCode, racePayment.body).toBe(200);
    const verified = await pool.connect();
    try {
      await verified.query("BEGIN");
      await verified.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      for (const documentType of ["travel_ticket", "boarding_pass", "receipt"]) {
        const documentId = randomUUID();
        const storageKey = `expense-race/${documentId}`;
        await verified.query(
          `INSERT INTO documents.doc_metadata
           (id,business_object_type,business_object_id,classification,document_type,
            file_name,storage_key,mime_type,size_bytes,created_by_user_id)
           VALUES ($1,'expense_ticket',$2,'finance',$3,'fixture.pdf',$4,'application/pdf',12,$5)`,
          [documentId, raceTicketId, documentType, storageKey, employee.user.id],
        );
        await verified.query(
          `INSERT INTO documents.doc_versions
           (document_id,version,storage_key,file_name,size_bytes,created_by_user_id)
           VALUES ($1,1,$2,'fixture.pdf',12,$3)`,
          [documentId, storageKey, employee.user.id],
        );
        await verified.query(
          `INSERT INTO expenses.expense_documents
           (ticket_id,document_id,document_type,verification_status,uploaded_by)
           VALUES ($1,$2,$3,'verified',$4)`,
          [raceTicketId, documentId, documentType, employee.user.id],
        );
      }
      await verified.query("COMMIT");
    } catch (error) { await verified.query("ROLLBACK"); throw error; }
    finally { verified.release(); }
    const nonzero = await app.inject({ method: "POST", url: `/api/v1/expenses/${raceTicketId}/settlement`,
      headers: { ...authHeader(finance.token), "idempotency-key": `race-settle-${raceTicketId}` },
      payload: { actual_amount: "90.00", expected_version: 3 } });
    expect(nonzero.statusCode, nonzero.body).toBe(200);
    expect(nonzero.json()).toEqual({ id: raceTicketId, status: "Pending Adjustment", version: 4 });
    expect(Number((await pool.query("SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=$1 AND event_type='expense.closed'", [raceTicketId])).rows[0]?.count)).toBe(0);

    await pool.query(`CREATE FUNCTION platform.reject_expense_test_outbox() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='expense.finance.hold' THEN
      RAISE EXCEPTION 'local fault injection'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER expense_test_outbox_fault BEFORE INSERT ON platform.outbox_events
      FOR EACH ROW EXECUTE FUNCTION platform.reject_expense_test_outbox()`);
    try {
      const failed = await app.inject({ method: "POST", url: `/api/v1/expenses/${faultTicketId}/finance/approve`,
        headers: { ...authHeader(finance.token), "idempotency-key": `fault-${faultTicketId}` },
        payload: { decision: "hold", remarks: "review", expected_version: 1 } });
      expect(failed.statusCode).toBe(500);
      const durable = await pool.query<{ status: string; version: number }>(
        "SELECT status,version FROM expenses.expense_tickets WHERE id=$1", [faultTicketId],
      );
      expect(durable.rows[0]).toMatchObject({ status: "Manager Verified", version: 1 });
      for (const table of ["expense_approvals", "expense_audit_logs", "expense_command_results"]) {
        expect(Number((await pool.query(`SELECT count(*) FROM expenses.${table} WHERE ticket_id=$1`, [faultTicketId])).rows[0]?.count)).toBe(0);
      }
      expect(Number((await pool.query("SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=$1", [faultTicketId])).rows[0]?.count)).toBe(0);
      expect(Number((await pool.query("SELECT count(*) FROM platform.notifications WHERE payload->>'ticket_id'=$1", [faultTicketId])).rows[0]?.count)).toBe(0);
    } finally {
      await pool.query("DROP TRIGGER expense_test_outbox_fault ON platform.outbox_events");
      await pool.query("DROP FUNCTION platform.reject_expense_test_outbox()");
    }
  });
});
