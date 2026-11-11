import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("expense typed-owner read boundary on PostgreSQL", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterAll(async () => {
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
    const companyB = randomUUID();
    const ticketId = randomUUID();
    const pendingTicketId = randomUUID();
    const quarantinedId = randomUUID();
    const receiptId = randomUUID();
    const companyBTicketId = randomUUID();
    const companyBDepartmentId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      await client.query(
        "INSERT INTO platform.company_profiles (id, company_name, company_slug, status) VALUES ($1, 'Other Company', $2, 'active')",
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
           finance_approver_id, status, context_payload, company_id, owner_resolution_status)
         VALUES ($1, $2, $3, 'Employee', $4, 'Project', 'Project Travel',
                 'Pending A travel', 'Fixture', CURRENT_DATE, CURRENT_DATE,
                 50, 'Advance', $5, $6, 'Pending Manager Verification',
                 jsonb_build_object('company_id', $7::text), $7::uuid, 'typed_creation')`,
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
      // Simulate a pre-migration legacy row that 0068 quarantined. The local
      // fixture operator bypasses only the owner trigger inside this setup
      // transaction; no application endpoint can perform this repair.
      await client.query("ALTER TABLE expenses.expense_tickets DISABLE TRIGGER expense_ticket_original_company_guard_trg");
      await client.query(
        `INSERT INTO expenses.expense_tickets
          (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
           expense_type, expense_sub_type, task_title, task_description, start_date,
           end_date, estimated_amount, payment_type, manager_verifier_id,
           finance_approver_id, status, context_payload, owner_resolution_status, owner_resolution_reason)
         VALUES ($1, $2, $3, 'Employee', $4, 'Project', 'Project Travel',
                 'Unverified legacy ticket', 'Fixture', CURRENT_DATE, CURRENT_DATE,
                 25, 'Advance', $5, $6, 'Manager Verified',
                 jsonb_build_object('company_id', $7::text), 'quarantined', 'legacy_owner_unverified')`,
        [quarantinedId, `EXP-READ-${quarantinedId}`, employee.user.id, employee.user.department_id,
          manager.user.id, finance.user.id, companyA],
      );
      await client.query("ALTER TABLE expenses.expense_tickets ENABLE TRIGGER expense_ticket_original_company_guard_trg");
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
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${quarantinedId}`, headers: authHeader(employee.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/expenses/${quarantinedId}/finance-detail`, headers: authHeader(finance.token) })).statusCode).toBe(404);
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
    expect((await app.inject({ method: "GET", url: "/api/v1/documents", headers: authHeader(finance.token) })).statusCode).toBe(409);
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

    await pool.query("UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1", [employee.user.id, companyB]);
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
      const secondRead = await second.inject({ method: "GET", url: `/api/v1/expenses/${ticketId}`, headers: authHeader(employee.token) });
      expect(secondRead.statusCode).toBe(200);
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
    const financeHeaders = { ...authHeader(finance.token), "idempotency-key": `expense-approve-${ticketId}` };
    const approvePayload = { decision: "verify", expected_version: 1 };
    const approved = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: financeHeaders, payload: approvePayload });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toEqual({ id: ticketId, status: "Finance Approved", version: 2 });
    const approveReplay = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: financeHeaders, payload: approvePayload });
    expect(approveReplay.statusCode, approveReplay.body).toBe(200);
    expect(approveReplay.json()).toEqual(approved.json());
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
    const paid = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/payment`,
      headers: { ...authHeader(finance.token), "idempotency-key": paymentKey }, payload: paymentPayload });
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json()).toEqual({ id: ticketId, status: "Payment Released", version: 3 });
    const paymentReplay = await app.inject({ method: "POST", url: `/api/v1/expenses/${ticketId}/finance/payment`,
      headers: { ...authHeader(finance.token), "idempotency-key": paymentKey }, payload: paymentPayload });
    expect(paymentReplay.statusCode, paymentReplay.body).toBe(200);
    expect(paymentReplay.json()).toEqual(paid.json());
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=$1", [ticketId])).rows[0]?.count)).toBe(1);

    const settleUrl = `/api/v1/expenses/${ticketId}/settlement`;
    const settleHeaders = { ...authHeader(finance.token), "idempotency-key": `expense-settle-${ticketId}` };
    const settlePayload = { actual_amount: "100.00", expected_version: 3 };
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
    const settled = await app.inject({ method: "POST", url: settleUrl,
      headers: settleHeaders, payload: settlePayload });
    expect(settled.statusCode, settled.body).toBe(200);
    expect(settled.json()).toEqual({ id: ticketId, status: "Closed", version: 4 });
    const settledReplay = await app.inject({ method: "POST", url: settleUrl,
      headers: settleHeaders, payload: settlePayload });
    expect(settledReplay.statusCode, settledReplay.body).toBe(200);
    expect(settledReplay.json()).toEqual(settled.json());
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_command_results WHERE ticket_id=$1", [ticketId])).rows[0]?.count)).toBe(3);
    expect(Number((await pool.query("SELECT count(*) FROM platform.outbox_events WHERE aggregate_id=$1 AND payload->>'company_id'=$2", [ticketId, companyA])).rows[0]?.count)).toBe(4);
    expect(Number((await pool.query("SELECT count(*) FROM expenses.expense_payments WHERE ticket_id=$1 AND settlement_status='no_balance'", [ticketId])).rows[0]?.count)).toBe(1);
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
