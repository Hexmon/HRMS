import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import {
  buildRealApp,
  buildRealAppReplica,
  seedTrustedExpenseDocumentFixtures,
  verifyTrustedExpenseDocumentFixtures,
} from "../../../__tests__/real-infra.js";
import {
  lockExpenseCombinedRoutingWriter,
  lockExpenseRoutingReader,
} from "../routing-locks.js";

function expenseCommandHeaders(token: string) {
  return { ...authHeader(token), "idempotency-key": `expense-test-${randomUUID()}` };
}

async function readExpense(app: FastifyInstance, token: string, id: string) {
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/expenses/${id}`,
    headers: authHeader(token),
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}

describe("expense manager-finance workflow integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("routes employee to manager verification, then finance approval, payment, documents, and settlement", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const unassignedFinance = await loginAs(app, "N2");
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const otherEmployee = await loginAs(app, "E2");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: projectTravelPayload
    });
    expect(create.statusCode).toBe(200);
    expect(Object.keys(create.json()).sort()).toEqual(["id", "status", "version"]);
    const ticket = await readExpense(app, employee.token, create.json().id);
    expect(ticket.status).toBe("Pending Manager Verification");
    expect(ticket.manager_verifier_id).toBe(manager.user.id);
    expect(ticket.finance_approver_id).toBe(finance.user.id);

    const managerQueue = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/manager?page=1&page_size=10",
      headers: expenseCommandHeaders(manager.token)
    });
    expect(managerQueue.statusCode).toBe(200);
    expect(managerQueue.json().items.some((row: { id: string }) => row.id === ticket.id)).toBe(true);

    const managerVerifyHeaders = expenseCommandHeaders(manager.token);
    const managerVerifyPayload = { decision: "approve", expected_version: 1 };
    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/manager/verify`,
      headers: managerVerifyHeaders,
      payload: managerVerifyPayload,
    });
    expect(managerVerify.statusCode).toBe(200);
    expect(managerVerify.json().status).toBe("Manager Verified");
    const managerVerifyReplay = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/manager/verify`,
      headers: managerVerifyHeaders,
      payload: managerVerifyPayload,
    });
    expect(managerVerifyReplay.statusCode, managerVerifyReplay.body).toBe(200);
    expect(managerVerifyReplay.json()).toEqual(managerVerify.json());
    await app.store.pgPool!.query(
      "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Reviewer'",
      [manager.user.id],
    );
    const revokedManagerReplay = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/manager/verify`,
      headers: managerVerifyHeaders,
      payload: managerVerifyPayload,
    });
    expect(revokedManagerReplay.statusCode, revokedManagerReplay.body).toBe(403);
    await app.store.pgPool!.query(
      "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Reviewer'",
      [manager.user.id],
    );

    const missingIdempotencyKey = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "verify", expected_version: 2 }
    });
    expect(missingIdempotencyKey.statusCode).toBe(400);

    const staleFinanceApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "verify", expected_version: 1 }
    });
    expect(staleFinanceApprove.statusCode).toBe(409);

    const financeQueue = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?page=1&page_size=10&status=Manager%20Verified&payment_type=Advance&expense_type=Project&document_status=missing&sort=sla",
      headers: authHeader(finance.token)
    });
    expect(financeQueue.statusCode).toBe(200);
    expect(financeQueue.json().total).toBe(1);
    const pool = app.store.pgPool;
    expect(pool).not.toBeNull();
    if (!pool) throw new Error("PostgreSQL pool required");
    const department = (await pool.query<{ department_code: string; name: string }>(
      "SELECT department_code,name FROM core.departments WHERE id=$1",
      [ticket.department_id],
    )).rows[0];
    expect(department).toBeDefined();
    const requesterFiltered = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?page=1&page_size=1&requester=e1&document_status=any",
      headers: authHeader(finance.token),
    });
    expect(requesterFiltered.statusCode, requesterFiltered.body).toBe(200);
    expect(requesterFiltered.json()).toMatchObject({ total: 1, page: 1, page_size: 1 });
    expect(requesterFiltered.json().items[0].id).toBe(ticket.id);
    const departmentTerm = encodeURIComponent(department!.name.slice(0, 4).toUpperCase());
    const departmentFiltered = await app.inject({
      method: "GET",
      url: `/api/v1/expenses/queue/finance?department=${departmentTerm}`,
      headers: authHeader(finance.token),
    });
    expect(departmentFiltered.statusCode, departmentFiltered.body).toBe(200);
    expect(departmentFiltered.json().items.map((item: { id: string }) => item.id)).toEqual([ticket.id]);
    const completeBeforeVerification = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?document_status=complete",
      headers: authHeader(finance.token),
    });
    expect(completeBeforeVerification.statusCode).toBe(200);
    expect(completeBeforeVerification.json().total).toBe(0);

    const employeeFinanceQueue = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(employeeFinanceQueue.statusCode).toBe(403);

    const financeApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "verify", expected_version: 2 }
    });
    expect(financeApprove.statusCode).toBe(200);
    expect(financeApprove.json().status).toBe("Finance Approved");
    expect(Object.keys(financeApprove.json()).sort()).toEqual(["id", "status", "version"]);

    const payment = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/payment`,
      headers: expenseCommandHeaders(finance.token),
      payload: {
        payment_date: "2026-05-04",
        amount: "500.00",
        payment_mode: "NEFT",
        reference_no: "PAY-001",
        expected_version: 3
      }
    });
    expect(payment.statusCode).toBe(200);
    expect(payment.json().status).toBe("Payment Released");
    expect(Object.keys(payment.json()).sort()).toEqual(["id", "status", "version"]);

    const blockedUpload = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/documents`,
      headers: expenseCommandHeaders(employee.token),
      payload: {
        classification: "finance",
        document_type: "travel_ticket",
        file_name: "travel_ticket.pdf",
        mime_type: "application/pdf",
        size_bytes: 2000
      }
    });
    expect(blockedUpload.statusCode).toBe(409);
    const uploadedDocuments = await seedTrustedExpenseDocumentFixtures(app, {
      ticketId: ticket.id,
      uploadedByUserId: employee.user.id,
      documentTypes: ["travel_ticket", "boarding_pass", "receipt"],
    });
    await expect(verifyTrustedExpenseDocumentFixtures(app, {
      ticketId: ticket.id,
      documentIds: [uploadedDocuments[0]!.id, randomUUID()],
    })).rejects.toThrow("Every trusted expense document fixture must be pending");
    expect((await pool.query<{ verification_status: string }>(
      `SELECT verification_status FROM expenses.expense_documents
       WHERE ticket_id=$1 ORDER BY document_type`,
      [ticket.id],
    )).rows.every((document) => document.verification_status === "pending")).toBe(true);
    await pool.query(
      "UPDATE documents.doc_metadata SET checksum_sha256=$2 WHERE id=$1",
      [uploadedDocuments[0]!.id, "b".repeat(64)],
    );
    await expect(verifyTrustedExpenseDocumentFixtures(app, {
      ticketId: ticket.id,
      documentIds: uploadedDocuments.map((document) => document.id),
    })).rejects.toThrow("Every trusted expense document fixture must be pending");
    expect((await pool.query<{ verification_status: string }>(
      `SELECT verification_status FROM expenses.expense_documents
       WHERE ticket_id=$1 ORDER BY document_type`,
      [ticket.id],
    )).rows.every((document) => document.verification_status === "pending")).toBe(true);
    await pool.query(
      "UPDATE documents.doc_metadata SET checksum_sha256=NULL WHERE id=$1",
      [uploadedDocuments[0]!.id],
    );

    const billsState = async () => (await pool.query(
      `SELECT
        (SELECT jsonb_build_object('status',status,'version',version)
           FROM expenses.expense_tickets WHERE id=$1) AS ticket,
        (SELECT count(*)::int FROM expenses.expense_audit_logs WHERE ticket_id=$1) AS audits,
        (SELECT count(*)::int FROM platform.outbox_events WHERE aggregate_id=$1) AS outbox,
        (SELECT count(*)::int FROM platform.notifications WHERE payload->>'ticket_id'=$1::text) AS notifications,
        (SELECT count(*)::int FROM expenses.expense_command_results
           WHERE ticket_id=$1 AND action='bills') AS commands`,
      [ticket.id],
    )).rows[0];
    const beforeDeniedBills = await billsState();
    for (const [actor, label] of [
      [admin, "admin"],
      [auditor, "auditor"],
      [unassignedFinance, "unassigned-finance"],
      [otherEmployee, "other-employee"],
    ] as const) {
      const deniedBills = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticket.id}/bills`,
        headers: {
          ...authHeader(actor.token),
          "idempotency-key": `denied-bills-${label}-${randomUUID()}`,
        },
        payload: { expected_version: 4 },
      });
      expect(deniedBills.statusCode, deniedBills.body).toBe(403);
    }
    const originalCompanyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [employee.user.id],
    )).rows[0]!.company_id;
    const transferCompanyId = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles
       (id,company_name,company_slug,status)
       VALUES ($1,'Bills transfer company',$2,'active')`,
      [transferCompanyId, `bills-transfer-${transferCompanyId}`],
    );
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$1 WHERE user_id=$2",
      [transferCompanyId, employee.user.id],
    );
    const transferredRequesterBills = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/bills`,
      headers: expenseCommandHeaders(employee.token),
      payload: { expected_version: 4 },
    });
    expect(transferredRequesterBills.statusCode, transferredRequesterBills.body).toBe(404);
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$1 WHERE user_id=$2",
      [originalCompanyId, employee.user.id],
    );
    expect(await billsState()).toEqual(beforeDeniedBills);

    const billsHeaders = expenseCommandHeaders(employee.token);
    const billsPayload = { expected_version: 4 };
    const bills = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/bills`,
      headers: billsHeaders,
      payload: billsPayload,
    });
    expect(bills.statusCode).toBe(200);
    expect(bills.json().status).toBe("Bills Submitted");
    const billsReplay = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/bills`,
      headers: billsHeaders,
      payload: billsPayload,
    });
    expect(billsReplay.statusCode, billsReplay.body).toBe(200);
    expect(billsReplay.json()).toEqual(bills.json());

    const blockedByPendingDocumentVerification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/settlement`,
      headers: expenseCommandHeaders(finance.token),
      payload: { actual_amount: "500.00", expected_version: 5 }
    });
    expect(blockedByPendingDocumentVerification.statusCode).toBe(400);

    const blockedVerification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/documents/${uploadedDocuments[0]!.id}/verify`,
      headers: expenseCommandHeaders(manager.token)
    });
    expect(blockedVerification.statusCode).toBe(409);
    await verifyTrustedExpenseDocumentFixtures(app, {
      ticketId: ticket.id,
      documentIds: uploadedDocuments.map((document) => document.id),
    });
    const completeAfterVerification = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?document_status=complete",
      headers: authHeader(finance.token),
    });
    expect(completeAfterVerification.statusCode).toBe(200);
    expect(completeAfterVerification.json().items.map((item: { id: string }) => item.id)).toEqual([ticket.id]);
    await pool.query(
      "UPDATE documents.doc_metadata SET current_version=2 WHERE id=$1",
      [uploadedDocuments[0]!.id],
    );
    const incompleteVersion = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?document_status=complete",
      headers: authHeader(finance.token),
    });
    expect(incompleteVersion.statusCode).toBe(200);
    expect(incompleteVersion.json().total).toBe(0);
    await pool.query(
      "UPDATE documents.doc_metadata SET current_version=1 WHERE id=$1",
      [uploadedDocuments[0]!.id],
    );
    await pool.query(
      "UPDATE documents.doc_metadata SET checksum_sha256=$2 WHERE id=$1",
      [uploadedDocuments[0]!.id, "a".repeat(64)],
    );
    const incompleteChecksum = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?document_status=complete",
      headers: authHeader(finance.token),
    });
    expect(incompleteChecksum.statusCode).toBe(200);
    expect(incompleteChecksum.json().total).toBe(0);
    await pool.query(
      "UPDATE documents.doc_metadata SET checksum_sha256=NULL WHERE id=$1",
      [uploadedDocuments[0]!.id],
    );
    await pool.query(
      "UPDATE documents.doc_metadata SET deleted_at=now() WHERE id=$1",
      [uploadedDocuments[0]!.id],
    );
    const incompleteDeletedMetadata = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?document_status=complete",
      headers: authHeader(finance.token),
    });
    expect(incompleteDeletedMetadata.statusCode).toBe(200);
    expect(incompleteDeletedMetadata.json().total).toBe(0);
    await pool.query(
      "UPDATE documents.doc_metadata SET deleted_at=NULL WHERE id=$1",
      [uploadedDocuments[0]!.id],
    );

    const settle = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/settlement`,
      headers: expenseCommandHeaders(finance.token),
      payload: { actual_amount: "500.00", expected_version: 5 }
    });
    expect(settle.statusCode).toBe(200);
    expect(settle.json().status).toBe("Closed");
    expect(Object.keys(settle.json()).sort()).toEqual(["id", "status", "version"]);

    const managerHistory = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/manager-history?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(managerHistory.statusCode).toBe(200);
    expect(managerHistory.json().total).toBeGreaterThanOrEqual(1);

    const financeHistory = await app.inject({
      method: "GET",
      url: "/api/v1/reports/expenses/finance-history?page=1&page_size=10",
      headers: authHeader(finance.token)
    });
    expect(financeHistory.statusCode).toBe(200);
    expect(financeHistory.json().total).toBeGreaterThanOrEqual(3);

    const audit = await app.inject({
      method: "GET",
      url: `/api/v1/expenses/${ticket.id}/audit?page=1&page_size=50`,
      headers: authHeader(finance.token)
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBeGreaterThanOrEqual(8);
  });

  it("enforces validation, manager self-processing, remarks, and finance gates", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const pool = app.store.pgPool!;
    const durableCounts = async () => (await pool.query(
      `SELECT
        (SELECT count(*)::int FROM expenses.expense_tickets) AS tickets,
        (SELECT count(*)::int FROM expenses.expense_audit_logs) AS audits,
        (SELECT count(*)::int FROM platform.outbox_events) AS outbox,
        (SELECT count(*)::int FROM platform.notifications) AS notifications,
        (SELECT count(*)::int FROM expenses.expense_command_results) AS commands`,
    )).rows[0];
    const beforeInvalidPaths = await durableCounts();

    const invalidPath = await app.inject({
      method: "POST",
      url: "/api/v1/expenses/not-a-uuid/submit",
      headers: expenseCommandHeaders(employee.token),
      payload: { expected_version: 1 },
    });
    expect(invalidPath.statusCode).toBe(400);
    for (const [path, payload] of [
      ["finance/approve", { decision: "verify", expected_version: 1 }],
      ["finance/payment", {
        payment_date: "2026-11-11",
        amount: "10.00",
        payment_mode: "NEFT",
        reference_no: "INVALID-PATH",
        expected_version: 1,
      }],
      ["settlement", { actual_amount: "10.00", expected_version: 1 }],
    ] as const) {
      const invalidFinancePath = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/not-a-uuid/${path}`,
        headers: expenseCommandHeaders(finance.token),
        payload,
      });
      expect(invalidFinancePath.statusCode, invalidFinancePath.body).toBe(400);
    }
    expect(await durableCounts()).toEqual(beforeInvalidPaths);

    const invalidDate = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, end_date: "2026-04-30" }
    });
    expect(invalidDate.statusCode).toBe(400);

    const overAdvance = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, advance_amount: "1200.00" }
    });
    expect(overAdvance.statusCode).toBe(400);

    const pendingResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, project_code: "GATE-1" }
    });
    const pendingTicket = pendingResponse.json();
    const earlyFinance = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "verify", expected_version: 1 }
    });
    expect(earlyFinance.statusCode).toBe(403);

    const rejectWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/manager/verify`,
      headers: expenseCommandHeaders(manager.token),
      payload: { decision: "reject", expected_version: 1 }
    });
    expect(rejectWithoutRemarks.statusCode).toBe(400);

    const returned = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/manager/verify`,
      headers: expenseCommandHeaders(manager.token),
      payload: { decision: "return", remarks: "Attach itinerary", expected_version: 1 }
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().status).toBe("Manager Returned");

    const resubmitHeaders = expenseCommandHeaders(employee.token);
    const resubmitPayload = { expected_version: returned.json().version };
    const resubmitted = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/submit`,
      headers: resubmitHeaders,
      payload: resubmitPayload,
    });
    expect(resubmitted.statusCode).toBe(200);
    expect(resubmitted.json().status).toBe("Pending Manager Verification");
    const resubmittedReplay = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/submit`,
      headers: resubmitHeaders,
      payload: resubmitPayload,
    });
    expect(resubmittedReplay.statusCode, resubmittedReplay.body).toBe(200);
    expect(resubmittedReplay.json()).toEqual(resubmitted.json());
    const routedNotificationList = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?page=1&page_size=100&type=expense.submitted",
      headers: authHeader(manager.token),
    });
    expect(routedNotificationList.statusCode, routedNotificationList.body).toBe(200);
    const routedNotification = routedNotificationList.json().items.find(
      (item: { description: string }) => item.description.includes(pendingTicket.id),
    );
    expect(routedNotification).toEqual(expect.objectContaining({
      type: "expense.submitted",
      target_user_id: manager.user.id,
    }));
    await pool.query(
      "UPDATE platform.user_session_preferences SET active_role='Employee' WHERE user_id=$1",
      [manager.user.id],
    );
    await pool.query(
      "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Reviewer'",
      [manager.user.id],
    );
    try {
      const revokedReviewerNotifications = await app.inject({
        method: "GET",
        url: "/api/v1/notifications?page=1&page_size=100&type=expense.submitted",
        headers: authHeader(manager.token),
      });
      expect(revokedReviewerNotifications.statusCode, revokedReviewerNotifications.body).toBe(200);
      expect(revokedReviewerNotifications.json().items).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: routedNotification.id }),
      ]));
      expect((await app.inject({
        method: "POST",
        url: `/api/v1/notifications/${routedNotification.id}/read`,
        headers: authHeader(manager.token),
        payload: { expected_version: routedNotification.version },
      })).statusCode).toBe(404);
    } finally {
      await pool.query(
        "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Reviewer'",
        [manager.user.id],
      );
      await pool.query(
        "UPDATE platform.user_session_preferences SET active_role='Reviewer' WHERE user_id=$1",
        [manager.user.id],
      );
    }

    const rejectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, project_code: "GATE-REJECT" }
    });
    expect(rejectResponse.statusCode).toBe(200);
    const rejectTicket = rejectResponse.json();
    const rejected = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${rejectTicket.id}/manager/verify`,
      headers: expenseCommandHeaders(manager.token),
      payload: { decision: "reject", remarks: "Out of policy", expected_version: 1 }
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe("Manager Rejected");

    const holdResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, project_code: "GATE-HOLD" }
    });
    expect(holdResponse.statusCode).toBe(200);
    const holdTicket = holdResponse.json();
    const holdManagerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/manager/verify`,
      headers: expenseCommandHeaders(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(holdManagerVerify.statusCode).toBe(200);

    const holdWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "hold", expected_version: 2 }
    });
    expect(holdWithoutRemarks.statusCode).toBe(400);

    const clarificationWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "clarification", expected_version: 2 }
    });
    expect(clarificationWithoutRemarks.statusCode).toBe(400);

    const financeHold = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "hold", remarks: "Need vendor GST details", expected_version: 2 }
    });
    expect(financeHold.statusCode).toBe(200);
    expect(financeHold.json().status).toBe("Finance Hold");

    const oldReviewerEndpoint = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/reviewer?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(oldReviewerEndpoint.statusCode).toBe(404);

    const oldDirectorEndpoint = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/director?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(oldDirectorEndpoint.statusCode).toBe(404);

    const oldReviewAction = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/review`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(oldReviewAction.statusCode).toBe(404);

    const oldApproveAction = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(oldApproveAction.statusCode).toBe(404);
  });

  it("returns metadata and dashboard summary, supports requester withdrawal, and records clarifications", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");

    const metadata = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/metadata",
      headers: authHeader(employee.token)
    });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json().expense_types.some((row: { value: string }) => row.value === "Project")).toBe(true);
    expect(metadata.json().document_types.length).toBeGreaterThan(0);

    const withdrawCreate = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, project_code: "WITHDRAW-1" }
    });
    expect(withdrawCreate.statusCode).toBe(200);
    const withdrawTicket = withdrawCreate.json();

    const dashboardBeforeWithdraw = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/dashboard-summary",
      headers: authHeader(employee.token)
    });
    expect(dashboardBeforeWithdraw.statusCode).toBe(200);
    expect(dashboardBeforeWithdraw.json().rows.some((row: { id: string }) => row.id === withdrawTicket.id)).toBe(true);

    const withdrawWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${withdrawTicket.id}/withdraw`,
      headers: expenseCommandHeaders(employee.token),
      payload: { expected_version: 1 }
    });
    expect(withdrawWithoutRemarks.statusCode).toBe(400);

    const withdrawHeaders = expenseCommandHeaders(employee.token);
    const withdrawPayload = { expected_version: 1, remarks: "Travel cancelled before approval" };
    const withdraw = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${withdrawTicket.id}/withdraw`,
      headers: withdrawHeaders,
      payload: withdrawPayload,
    });
    expect(withdraw.statusCode).toBe(200);
    expect(withdraw.json()).toEqual({
      id: withdrawTicket.id,
      status: "Cancelled",
      version: 2,
    });
    const withdrawReplay = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${withdrawTicket.id}/withdraw`,
      headers: withdrawHeaders,
      payload: withdrawPayload,
    });
    expect(withdrawReplay.statusCode, withdrawReplay.body).toBe(200);
    expect(withdrawReplay.json()).toEqual(withdraw.json());

    const clarifyCreate = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, project_code: "CLARIFY-1" }
    });
    expect(clarifyCreate.statusCode).toBe(200);
    const clarifyTicket = clarifyCreate.json();

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${clarifyTicket.id}/manager/verify`,
      headers: expenseCommandHeaders(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);

    const financeClarification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${clarifyTicket.id}/finance/approve`,
      headers: expenseCommandHeaders(finance.token),
      payload: { decision: "clarification", remarks: "Attach original GST invoice", expected_version: 2 }
    });
    expect(financeClarification.statusCode).toBe(200);
    expect(financeClarification.json().status).toBe("Clarification Required");

    const reply = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${clarifyTicket.id}/clarifications`,
      headers: expenseCommandHeaders(employee.token),
      payload: { message: "Uploaded the GST invoice copy.", expected_version: 3 }
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({
      id: clarifyTicket.id,
      status: "Clarification Required",
      version: 4,
    });

    const withdrawnClarification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${withdrawTicket.id}/clarifications`,
      headers: expenseCommandHeaders(employee.token),
      payload: { message: "Adding a late note is blocked." }
    });
    expect(withdrawnClarification.statusCode).toBe(400);
  });

  it("replays durable create and clarification commands while denying read-only oversight writers", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const createKey = `create-replay-${randomUUID()}`;
    const createHeaders = { ...authHeader(employee.token), "idempotency-key": createKey };
    const createPayload = { ...projectTravelPayload, project_code: "REPLAY-CLARIFY" };
    const created = await app.inject({
      method: "POST", url: "/api/v1/expenses", headers: createHeaders, payload: createPayload,
    });
    expect(created.statusCode, created.body).toBe(200);
    const ticket = created.json();
    const pool = app.store.pgPool;
    expect(pool).not.toBeNull();
    if (!pool) throw new Error("PostgreSQL pool required");
    const state = async () => (await pool.query(
      `SELECT
        (SELECT count(*)::int FROM expenses.expense_tickets WHERE id=$1) AS tickets,
        (SELECT count(*)::int FROM expenses.expense_audit_logs WHERE ticket_id=$1) AS audits,
        (SELECT count(*)::int FROM platform.outbox_events WHERE aggregate_id=$1) AS outbox,
        (SELECT count(*)::int FROM platform.notifications WHERE payload->>'ticket_id'=$1::text) AS notifications,
        (SELECT count(*)::int FROM expenses.expense_command_results WHERE ticket_id=$1) AS commands`,
      [ticket.id],
    )).rows[0];
    const afterCreate = await state();
    const createReplay = await app.inject({
      method: "POST", url: "/api/v1/expenses", headers: createHeaders, payload: createPayload,
    });
    expect(createReplay.statusCode, createReplay.body).toBe(200);
    expect(createReplay.json()).toEqual(created.json());
    expect(await state()).toEqual(afterCreate);
    const changedCreate = await app.inject({
      method: "POST", url: "/api/v1/expenses", headers: createHeaders,
      payload: { ...createPayload, task_title: "Different request" },
    });
    expect(changedCreate.statusCode).toBe(409);
    expect(await state()).toEqual(afterCreate);

    const targetDocuments = await seedTrustedExpenseDocumentFixtures(app, {
      ticketId: ticket.id,
      uploadedByUserId: employee.user.id,
      documentTypes: ["travel_ticket"],
    });
    const foreignTicketResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(employee.token),
      payload: { ...projectTravelPayload, project_code: "FOREIGN-CLARIFY-DOC" },
    });
    expect(foreignTicketResponse.statusCode, foreignTicketResponse.body).toBe(200);
    const foreignDocuments = await seedTrustedExpenseDocumentFixtures(app, {
      ticketId: foreignTicketResponse.json().id,
      uploadedByUserId: employee.user.id,
      documentTypes: ["travel_ticket"],
    });
    const beforeInvalidDocuments = await state();
    const invalidDocumentSets = [
      [randomUUID()],
      [foreignDocuments[0]!.id],
      [targetDocuments[0]!.id, foreignDocuments[0]!.id],
      [targetDocuments[0]!.id, targetDocuments[0]!.id],
      Array.from({ length: 21 }, () => randomUUID()),
    ];
    for (const [index, documentIds] of invalidDocumentSets.entries()) {
      const invalidClarification = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticket.id}/clarifications`,
        headers: {
          ...authHeader(employee.token),
          "idempotency-key": `invalid-clarification-docs-${index}-${randomUUID()}`,
        },
        payload: {
          message: "Invalid clarification document evidence",
          document_ids: documentIds,
          expected_version: 1,
        },
      });
      expect(invalidClarification.statusCode, invalidClarification.body).toBe(400);
    }
    expect(await state()).toEqual(beforeInvalidDocuments);

    const managerKey = `manager-clarification-${randomUUID()}`;
    const managerClarification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/clarifications`,
      headers: { ...authHeader(manager.token), "idempotency-key": managerKey },
      payload: {
        message: "Manager clarification",
        document_ids: [targetDocuments[0]!.id],
        expected_version: 1,
      },
    });
    expect(managerClarification.statusCode, managerClarification.body).toBe(200);
    expect(managerClarification.json()).toEqual({
      id: ticket.id,
      status: "Pending Manager Verification",
      version: 2,
    });
    const financeClarification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/clarifications`,
      headers: { ...authHeader(finance.token), "idempotency-key": `finance-clarification-${randomUUID()}` },
      payload: { message: "Finance clarification", expected_version: 2 },
    });
    expect(financeClarification.statusCode, financeClarification.body).toBe(200);
    expect(financeClarification.json()).toEqual({
      id: ticket.id,
      status: "Pending Manager Verification",
      version: 3,
    });
    const beforeOversight = await state();
    for (const [actor, label] of [[admin, "admin"], [auditor, "auditor"]] as const) {
      const denied = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticket.id}/clarifications`,
        headers: { ...authHeader(actor.token), "idempotency-key": `${label}-clarification-${randomUUID()}` },
        payload: { message: "Read authority is not write authority", expected_version: 3 },
      });
      expect(denied.statusCode).toBe(403);
    }
    expect(await state()).toEqual(beforeOversight);
    const requesterKey = `requester-clarification-${randomUUID()}`;
    const requesterHeaders = { ...authHeader(employee.token), "idempotency-key": requesterKey };
    const requesterPayload = { message: "Requester response", expected_version: 3 };
    const requesterClarification = await app.inject({
      method: "POST", url: `/api/v1/expenses/${ticket.id}/clarifications`,
      headers: requesterHeaders, payload: requesterPayload,
    });
    expect(requesterClarification.statusCode, requesterClarification.body).toBe(200);
    expect(requesterClarification.json()).toEqual({
      id: ticket.id,
      status: "Pending Manager Verification",
      version: 4,
    });
    const afterClarification = await state();
    const clarificationReplay = await app.inject({
      method: "POST", url: `/api/v1/expenses/${ticket.id}/clarifications`,
      headers: requesterHeaders, payload: requesterPayload,
    });
    expect(clarificationReplay.statusCode, clarificationReplay.body).toBe(200);
    expect(clarificationReplay.json()).toEqual(requesterClarification.json());
    expect(await state()).toEqual(afterClarification);
    const changedClarification = await app.inject({
      method: "POST", url: `/api/v1/expenses/${ticket.id}/clarifications`,
      headers: requesterHeaders,
      payload: { message: "Different response", expected_version: 3 },
    });
    expect(changedClarification.statusCode).toBe(409);
    expect(await state()).toEqual(afterClarification);
    const journalBodies = (await pool.query<{ response_body: Record<string, unknown> }>(
      `SELECT response_body FROM expenses.expense_command_results
       WHERE ticket_id=$1 ORDER BY created_at,id`,
      [ticket.id],
    )).rows.map((row) => row.response_body);
    for (const responseBody of journalBodies) {
      expect(Object.keys(responseBody).sort()).toEqual(["id", "status", "version"]);
    }
  });

  it("returns one committed replay for simultaneous same-key commands across two app instances", async () => {
    const replica = await buildRealAppReplica(app);
    await replica.ready();
    try {
      const employee = await loginAs(app, "E1");
      const manager = await loginAs(app, "D1");
      const createHeaders = {
        ...authHeader(employee.token),
        "idempotency-key": `concurrent-create-${randomUUID()}`,
      };
      const createPayload = {
        ...projectTravelPayload,
        project_code: "CONCURRENT-REPLAY",
      };
      const [createdByFirst, createdBySecond] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/api/v1/expenses",
          headers: createHeaders,
          payload: createPayload,
        }),
        replica.inject({
          method: "POST",
          url: "/api/v1/expenses",
          headers: createHeaders,
          payload: createPayload,
        }),
      ]);
      expect(createdByFirst.statusCode, createdByFirst.body).toBe(200);
      expect(createdBySecond.statusCode, createdBySecond.body).toBe(200);
      expect(createdBySecond.json()).toEqual(createdByFirst.json());
      expect(Object.keys(createdByFirst.json()).sort()).toEqual([
        "id",
        "status",
        "version",
      ]);
      const ticketId = createdByFirst.json().id as string;
      const pool = app.store.pgPool!;
      expect((await pool.query(
        "SELECT count(*)::int AS count FROM expenses.expense_tickets WHERE id=$1",
        [ticketId],
      )).rows[0]?.count).toBe(1);
      expect((await pool.query(
        "SELECT count(*)::int AS count FROM expenses.expense_line_items WHERE ticket_id=$1",
        [ticketId],
      )).rows[0]?.count).toBe(createPayload.line_items.length);
      expect((await pool.query(
        `SELECT count(*)::int AS count FROM expenses.expense_command_results
         WHERE ticket_id=$1 AND action='create'`,
        [ticketId],
      )).rows[0]?.count).toBe(1);

      const managerHeaders = {
        ...authHeader(manager.token),
        "idempotency-key": `concurrent-manager-${randomUUID()}`,
      };
      const managerPayload = { decision: "approve", expected_version: 1 };
      const [verifiedByFirst, verifiedBySecond] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/api/v1/expenses/${ticketId}/manager/verify`,
          headers: managerHeaders,
          payload: managerPayload,
        }),
        replica.inject({
          method: "POST",
          url: `/api/v1/expenses/${ticketId}/manager/verify`,
          headers: managerHeaders,
          payload: managerPayload,
        }),
      ]);
      expect(verifiedByFirst.statusCode, verifiedByFirst.body).toBe(200);
      expect(verifiedBySecond.statusCode, verifiedBySecond.body).toBe(200);
      expect(verifiedBySecond.json()).toEqual(verifiedByFirst.json());
      expect(verifiedByFirst.json()).toEqual({
        id: ticketId,
        status: "Manager Verified",
        version: 2,
      });
      expect((await pool.query(
        `SELECT count(*)::int AS count FROM expenses.expense_command_results
         WHERE ticket_id=$1 AND action='manager.verify'`,
        [ticketId],
      )).rows[0]?.count).toBe(1);
      expect((await pool.query(
        `SELECT count(*)::int AS count FROM expenses.expense_approvals
         WHERE ticket_id=$1 AND approval_stage='manager'`,
        [ticketId],
      )).rows[0]?.count).toBe(1);
    } finally {
      await replica.close();
    }
  });

  it("serializes routing commands behind governance and reviewer writers", async () => {
    const employee = await loginAs(app, "E1");
    const otherEmployee = await loginAs(app, "E2");
    const manager = await loginAs(app, "D1");
    const newFinance = await loginAs(app, "N2");
    const pool = app.store.pgPool!;
    const firstReader = await pool.connect();
    const secondReader = await pool.connect();
    try {
      await firstReader.query("BEGIN");
      await secondReader.query("BEGIN");
      await lockExpenseRoutingReader(firstReader, [employee.user.id]);
      await secondReader.query("SET LOCAL lock_timeout='250ms'");
      let secondReaderOutcome: "acquired" | "timeout" = "acquired";
      try {
        await lockExpenseRoutingReader(secondReader, [otherEmployee.user.id]);
      } catch {
        secondReaderOutcome = "timeout";
      }
      expect(secondReaderOutcome).toBe("acquired");
      const sharedLocks = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM pg_locks
         WHERE locktype='advisory' AND mode='ShareLock' AND granted`,
      );
      expect(sharedLocks.rows[0]?.count).toBeGreaterThanOrEqual(4);
    } finally {
      await secondReader.query("ROLLBACK").catch(() => undefined);
      await firstReader.query("ROLLBACK").catch(() => undefined);
      secondReader.release();
      firstReader.release();
    }

    const persistence = app.store.persistence;
    if (!persistence?.flushDomain) {
      throw new Error("PostgreSQL domain persistence is required");
    }
    const ticketNumberBlocker = await pool.connect();
    let ticketNumberBlockerOpen = false;
    const pendingOperations: Promise<unknown>[] = [];
    try {
      await ticketNumberBlocker.query("BEGIN");
      ticketNumberBlockerOpen = true;
      await ticketNumberBlocker.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('expense-ticket-number', 0))",
      );
      const createDuringPlatformFlush = app.inject({
        method: "POST",
        url: "/api/v1/expenses",
        headers: expenseCommandHeaders(employee.token),
        payload: {
          ...projectTravelPayload,
          project_code: "ROUTING-PLATFORM-FLUSH",
        },
      });
      pendingOperations.push(Promise.resolve(createDuringPlatformFlush));
      let createWaitingObserved = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_locks
           WHERE locktype='advisory' AND NOT granted`,
        );
        if ((waiting.rows[0]?.count ?? 0) >= 1) {
          createWaitingObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const platformFlush = persistence.flushDomain("platform");
      pendingOperations.push(platformFlush);
      let platformWaitingObserved = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_locks
           WHERE locktype='advisory' AND NOT granted`,
        );
        if ((waiting.rows[0]?.count ?? 0) >= 2) {
          platformWaitingObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await ticketNumberBlocker.query("COMMIT");
      ticketNumberBlockerOpen = false;
      const [createdDuringFlush] = await Promise.all([
        createDuringPlatformFlush,
        platformFlush,
      ]);
      expect(createWaitingObserved).toBe(true);
      expect(platformWaitingObserved).toBe(true);
      expect(createdDuringFlush.statusCode, createdDuringFlush.body).toBe(200);
    } finally {
      if (ticketNumberBlockerOpen) {
        await ticketNumberBlocker.query("ROLLBACK").catch(() => undefined);
      }
      await Promise.allSettled(pendingOperations);
      ticketNumberBlocker.release();
    }

    await pool.query(
      "UPDATE core.users SET manager_user_id=NULL WHERE id=$1",
      [employee.user.id],
    );
    const writer = await pool.connect();
    let writerOpen = false;
    try {
      await writer.query("BEGIN");
      writerOpen = true;
      await writer.query(
        "SELECT set_config('app.expense_command_v1','on',true)",
      );
      await lockExpenseCombinedRoutingWriter(writer, [employee.user.id]);
      const reviewerUpdate = await writer.query(
        `UPDATE expenses.employee_reviewer_mappings
         SET reviewer_user_id=$2,updated_at=now(),version=version+1
         WHERE employee_user_id=$1 AND deleted_at IS NULL`,
        [employee.user.id, manager.user.id],
      );
      expect(reviewerUpdate.rowCount).toBe(1);
      const governanceUpdate = await writer.query(
        `UPDATE platform.finance_governance_config
         SET primary_finance_manager_user_id=$1,updated_at=now(),version=version+1
         WHERE deleted_at IS NULL`,
        [newFinance.user.id],
      );
      expect(governanceUpdate.rowCount).toBe(1);

      const pendingCreate = app.inject({
        method: "POST",
        url: "/api/v1/expenses",
        headers: expenseCommandHeaders(employee.token),
        payload: {
          ...projectTravelPayload,
          project_code: "ROUTING-WRITER-RACE",
        },
      });
      let waitingObserved = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_locks
           WHERE locktype='advisory' AND NOT granted`,
        );
        if ((waiting.rows[0]?.count ?? 0) > 0) {
          waitingObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(waitingObserved).toBe(true);
      await writer.query("COMMIT");
      writerOpen = false;

      const created = await pendingCreate;
      expect(created.statusCode, created.body).toBe(200);
      const detail = await readExpense(app, employee.token, created.json().id);
      expect(detail.manager_verifier_id).toBe(manager.user.id);
      expect(detail.finance_approver_id).toBe(newFinance.user.id);
      expect(detail.route_snapshot).toMatchObject({
        manager_verifier_id: manager.user.id,
        finance_approver_id: newFinance.user.id,
      });
      const childCounts = (await pool.query<{
        tickets: number;
        line_items: number;
        approvals: number;
        audits: number;
        commands: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM expenses.expense_tickets WHERE id=$1) AS tickets,
          (SELECT count(*)::int FROM expenses.expense_line_items WHERE ticket_id=$1) AS line_items,
          (SELECT count(*)::int FROM expenses.expense_approvals WHERE ticket_id=$1) AS approvals,
          (SELECT count(*)::int FROM expenses.expense_audit_logs WHERE ticket_id=$1) AS audits,
          (SELECT count(*)::int FROM expenses.expense_command_results WHERE ticket_id=$1) AS commands`,
        [created.json().id],
      )).rows[0];
      expect(childCounts).toMatchObject({
        tickets: 1,
        line_items: projectTravelPayload.line_items.length,
        approvals: 0,
        commands: 1,
      });
      expect(childCounts!.audits).toBeGreaterThanOrEqual(1);
    } finally {
      if (writerOpen) await writer.query("ROLLBACK").catch(() => undefined);
      writer.release();
    }
  });

  it("uses configured finance governance for finance-manager self-request backup", async () => {
    const admin = await loginAs(app, "ADM");
    const executive = await loginAs(app, "S1");
    const financePrimary = await loginAs(app, "N1");
    const financeBackup = await loginAs(app, "N2");

    const governance = await app.inject({
      method: "GET",
      url: "/api/v1/platform/finance-governance",
      headers: authHeader(admin.token)
    });
    expect(governance.statusCode).toBe(200);
    expect(governance.json().primary_finance_manager.employee_code).toBe("N1");
    expect(governance.json().finance_backup_actor.employee_code).toBe("N2");

    const selfRequestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(financePrimary.token),
      payload: {
        ...projectTravelPayload,
        project_code: "FIN-SELF-1",
        line_items: [{ line_category: "travel", description: "Finance self request", line_total: "1000.00" }]
      }
    });
    expect(selfRequestResponse.statusCode).toBe(200);
    const selfRequest = await readExpense(
      app,
      financePrimary.token,
      selfRequestResponse.json().id,
    );
    expect(selfRequest.status).toBe("Pending Manager Verification");
    expect(selfRequest.manager_verifier_id).toBe(executive.user.id);
    expect(selfRequest.finance_approver_id).toBe(financeBackup.user.id);
    expect(selfRequest.route_snapshot.finance_backup_applied).toBe(true);

    const primaryFinanceDenied = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${selfRequest.id}/finance/approve`,
      headers: expenseCommandHeaders(financePrimary.token),
      payload: { decision: "verify", expected_version: 1 }
    });
    expect(primaryFinanceDenied.statusCode).toBe(403);

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${selfRequest.id}/manager/verify`,
      headers: expenseCommandHeaders(executive.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);

    const backupFinanceApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${selfRequest.id}/finance/approve`,
      headers: expenseCommandHeaders(financeBackup.token),
      payload: { decision: "verify", expected_version: 2 }
    });
    expect(backupFinanceApprove.statusCode).toBe(200);
    expect(backupFinanceApprove.json().status).toBe("Finance Approved");
  });

  it("blocks finance-manager self-request when independent finance backup is missing", async () => {
    const admin = await loginAs(app, "ADM");
    const financePrimary = await loginAs(app, "N1");

    const governance = await app.inject({
      method: "GET",
      url: "/api/v1/platform/finance-governance",
      headers: authHeader(admin.token)
    });
    expect(governance.statusCode).toBe(200);

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/platform/finance-governance",
      headers: authHeader(admin.token),
      payload: {
        primary_finance_manager_user_id: governance.json().primary_finance_manager.id,
        manager_backup_user_id: governance.json().config.manager_backup_user_id,
        finance_approval_backup_user_id: null,
        effective_from: governance.json().config.effective_from,
        effective_to: null,
        status: "active",
        expected_version: governance.json().config.version
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().valid).toBe(false);

    const selfRequestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: expenseCommandHeaders(financePrimary.token),
      payload: {
        ...projectTravelPayload,
        project_code: "FIN-SELF-2",
        line_items: [{ line_category: "travel", description: "Finance self request", line_total: "1000.00" }]
      }
    });
    expect(selfRequestResponse.statusCode).toBe(400);
    expect(selfRequestResponse.json().message).toBe(
      "Expense cannot be submitted until an independent Finance Manager approver is configured."
    );
  });
});
