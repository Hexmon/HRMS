import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

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

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload
    });
    expect(create.statusCode).toBe(200);
    const ticket = create.json();
    expect(ticket.status).toBe("Pending Manager Verification");
    expect(ticket.manager_verifier_id).toBe(manager.user.id);
    expect(ticket.finance_approver_id).toBe(finance.user.id);

    const managerQueue = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/manager?page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(managerQueue.statusCode).toBe(200);
    expect(managerQueue.json().items.some((row: { id: string }) => row.id === ticket.id)).toBe(true);

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);
    expect(managerVerify.json().status).toBe("Manager Verified");

    const staleFinanceApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/approve`,
      headers: authHeader(finance.token),
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

    const employeeFinanceQueue = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/queue/finance?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(employeeFinanceQueue.statusCode).toBe(403);

    const financeApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "verify", expected_version: 2 }
    });
    expect(financeApprove.statusCode).toBe(200);
    expect(financeApprove.json().status).toBe("Finance Approved");

    const payment = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/finance/payment`,
      headers: authHeader(finance.token),
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

    const uploadedDocuments: Array<{ id: string; document_type: string }> = [];
    for (const document_type of ["travel_ticket", "boarding_pass", "receipt"]) {
      const upload = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticket.id}/documents`,
        headers: authHeader(employee.token),
        payload: {
          classification: "finance",
          document_type,
          file_name: `${document_type}.pdf`,
          mime_type: "application/pdf",
          size_bytes: 2000
        }
      });
      expect(upload.statusCode).toBe(200);
      uploadedDocuments.push({ id: upload.json().id, document_type });
    }

    const bills = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/bills`,
      headers: authHeader(employee.token),
      payload: { expected_version: 4 }
    });
    expect(bills.statusCode).toBe(200);
    expect(bills.json().status).toBe("Bills Submitted");

    const blockedByPendingDocumentVerification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/settlement`,
      headers: authHeader(finance.token),
      payload: { actual_amount: "500.00", expected_version: 5 }
    });
    expect(blockedByPendingDocumentVerification.statusCode).toBe(400);

    for (const document of uploadedDocuments) {
      const verifyDocument = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${ticket.id}/documents/${document.id}/verify`,
        headers: authHeader(manager.token)
      });
      expect(verifyDocument.statusCode).toBe(200);
      expect(verifyDocument.json().documents.find((item: { type: string; status: string }) => item.type === document.document_type)?.status).toBe("verified");
    }

    const settle = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticket.id}/settlement`,
      headers: authHeader(finance.token),
      payload: { actual_amount: "500.00", expected_version: 5 }
    });
    expect(settle.statusCode).toBe(200);
    expect(settle.json().status).toBe("Closed");

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

    const invalidDate = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: { ...projectTravelPayload, end_date: "2026-04-30" }
    });
    expect(invalidDate.statusCode).toBe(400);

    const overAdvance = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: { ...projectTravelPayload, advance_amount: "1200.00" }
    });
    expect(overAdvance.statusCode).toBe(400);

    const pendingResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: { ...projectTravelPayload, project_code: "GATE-1" }
    });
    const pendingTicket = pendingResponse.json();
    const earlyFinance = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "verify", expected_version: 1 }
    });
    expect(earlyFinance.statusCode).toBe(403);

    const rejectWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "reject", expected_version: 1 }
    });
    expect(rejectWithoutRemarks.statusCode).toBe(400);

    const returned = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "return", remarks: "Attach itinerary", expected_version: 1 }
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().status).toBe("Manager Returned");

    const resubmitted = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${pendingTicket.id}/submit`,
      headers: authHeader(employee.token),
      payload: { expected_version: returned.json().version }
    });
    expect(resubmitted.statusCode).toBe(200);
    expect(resubmitted.json().status).toBe("Pending Manager Verification");

    const rejectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: { ...projectTravelPayload, project_code: "GATE-REJECT" }
    });
    expect(rejectResponse.statusCode).toBe(200);
    const rejectTicket = rejectResponse.json();
    const rejected = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${rejectTicket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "reject", remarks: "Out of policy", expected_version: 1 }
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe("Manager Rejected");

    const holdResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: { ...projectTravelPayload, project_code: "GATE-HOLD" }
    });
    expect(holdResponse.statusCode).toBe(200);
    const holdTicket = holdResponse.json();
    const holdManagerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(holdManagerVerify.statusCode).toBe(200);

    const holdWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "hold", expected_version: 2 }
    });
    expect(holdWithoutRemarks.statusCode).toBe(400);

    const clarificationWithoutRemarks = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "clarification", expected_version: 2 }
    });
    expect(clarificationWithoutRemarks.statusCode).toBe(400);

    const financeHold = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${holdTicket.id}/finance/approve`,
      headers: authHeader(finance.token),
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
      headers: authHeader(finance.token),
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
      headers: authHeader(employee.token),
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
      headers: authHeader(employee.token),
      payload: { expected_version: 1 }
    });
    expect(withdrawWithoutRemarks.statusCode).toBe(400);

    const withdraw = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${withdrawTicket.id}/withdraw`,
      headers: authHeader(employee.token),
      payload: { expected_version: 1, remarks: "Travel cancelled before approval" }
    });
    expect(withdraw.statusCode).toBe(200);
    expect(withdraw.json().expense.status).toBe("Cancelled");
    expect(withdraw.json().timeline_event.event_type).toBe("expense.withdrawn");

    const clarifyCreate = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: { ...projectTravelPayload, project_code: "CLARIFY-1" }
    });
    expect(clarifyCreate.statusCode).toBe(200);
    const clarifyTicket = clarifyCreate.json();

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${clarifyTicket.id}/manager/verify`,
      headers: authHeader(manager.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);

    const financeClarification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${clarifyTicket.id}/finance/approve`,
      headers: authHeader(finance.token),
      payload: { decision: "clarification", remarks: "Attach original GST invoice", expected_version: 2 }
    });
    expect(financeClarification.statusCode).toBe(200);
    expect(financeClarification.json().status).toBe("Clarification Required");

    const reply = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${clarifyTicket.id}/clarifications`,
      headers: authHeader(employee.token),
      payload: { message: "Uploaded the GST invoice copy.", expected_version: 3 }
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.json().thread.length).toBeGreaterThanOrEqual(2);
    expect(reply.json().expense_version).toBe(4);

    const withdrawnClarification = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${withdrawTicket.id}/clarifications`,
      headers: authHeader(employee.token),
      payload: { message: "Adding a late note is blocked." }
    });
    expect(withdrawnClarification.statusCode).toBe(400);
  });

  it("uses configured finance governance for finance-manager self-request backup", async () => {
    const admin = await loginAs(app, "ADM");
    const executive = await loginAs(app, "S1");
    const financePrimary = await loginAs(app, "N1");

    const governance = await app.inject({
      method: "GET",
      url: "/api/v1/platform/finance-governance",
      headers: authHeader(admin.token)
    });
    expect(governance.statusCode).toBe(200);
    expect(governance.json().primary_finance_manager.employee_code).toBe("N1");
    expect(governance.json().finance_backup_actor.employee_code).toBe("ADM");

    const selfRequestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(financePrimary.token),
      payload: {
        ...projectTravelPayload,
        project_code: "FIN-SELF-1",
        line_items: [{ line_category: "travel", description: "Finance self request", line_total: "1000.00" }]
      }
    });
    expect(selfRequestResponse.statusCode).toBe(200);
    const selfRequest = selfRequestResponse.json();
    expect(selfRequest.status).toBe("Pending Manager Verification");
    expect(selfRequest.manager_verifier_id).toBe(executive.user.id);
    expect(selfRequest.finance_approver_id).toBe(admin.user.id);
    expect(selfRequest.route_snapshot.finance_backup_applied).toBe(true);

    const primaryFinanceDenied = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${selfRequest.id}/finance/approve`,
      headers: authHeader(financePrimary.token),
      payload: { decision: "verify", expected_version: 1 }
    });
    expect(primaryFinanceDenied.statusCode).toBe(403);

    const managerVerify = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${selfRequest.id}/manager/verify`,
      headers: authHeader(executive.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(managerVerify.statusCode).toBe(200);

    const backupFinanceApprove = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${selfRequest.id}/finance/approve`,
      headers: authHeader(admin.token),
      payload: { decision: "verify", expected_version: 2 }
    });
    expect(backupFinanceApprove.statusCode).toBe(200);
    expect(backupFinanceApprove.json().status).toBe("Finance Approved");
  });

  it("routes finance-manager self-request to finance routing exception when backup is missing", async () => {
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
      headers: authHeader(financePrimary.token),
      payload: {
        ...projectTravelPayload,
        project_code: "FIN-SELF-2",
        line_items: [{ line_category: "travel", description: "Finance self request", line_total: "1000.00" }]
      }
    });
    expect(selfRequestResponse.statusCode).toBe(200);
    const selfRequest = selfRequestResponse.json();
    expect(selfRequest.status).toBe("Finance Routing Exception");
    expect(selfRequest.finance_approver_id).toBeNull();
    expect(selfRequest.route_snapshot.notes).toContain("finance_approval_backup_missing");
  });
});
