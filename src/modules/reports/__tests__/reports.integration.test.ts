import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("expanded expense reports", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
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
