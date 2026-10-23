import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

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

  it("requires active company context before attendance reporting or export creation", async () => {
    const admin = await loginAs(app, "ADM");
    const preference = app.store.userSessionPreferences.find((candidate) => candidate.user_id === admin.user.id);
    expect(preference).toBeDefined();
    preference!.company_id = null;

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/reports/attendance/summary?page=1&page_size=10",
      headers: authHeader(admin.token),
    });
    expect(summary.statusCode).toBe(400);
    expect(summary.json().code).toBe("COMPANY_CONTEXT_REQUIRED");

    const exportRequest = await app.inject({
      method: "POST",
      url: "/api/v1/reports/exports",
      headers: authHeader(admin.token),
      payload: { report_type: "attendance", format: "csv", filters: {} },
    });
    expect(exportRequest.statusCode).toBe(400);
    expect(exportRequest.json().code).toBe("COMPANY_CONTEXT_REQUIRED");
  });

  it("returns non-expense summary reports and document-backed export jobs", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbiddenHr = await app.inject({
      method: "GET",
      url: "/api/v1/reports/hr/employees",
      headers: authHeader(employee.token)
    });
    expect(forbiddenHr.statusCode).toBe(403);

    for (const url of [
      "/api/v1/reports/hr/employees?page=1&page_size=10",
      "/api/v1/reports/attendance/summary?page=1&page_size=10",
      "/api/v1/reports/leave-wfh/summary?page=1&page_size=10",
      "/api/v1/reports/projects/summary?page=1&page_size=10",
      "/api/v1/reports/timesheets/summary?page=1&page_size=10",
      "/api/v1/reports/assets/summary?page=1&page_size=10",
      "/api/v1/reports/helpdesk/summary?page=1&page_size=10"
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: authHeader(admin.token)
      });
      expect(response.statusCode, url).toBe(200);
      expect(response.json()).toMatchObject({ page: 1, page_size: 10 });
      expect(response.json().totals, url).toBeDefined();
      expect(response.json().filters, url).toBeDefined();
    }

    const createExport = await app.inject({
      method: "POST",
      url: "/api/v1/reports/exports",
      headers: authHeader(admin.token),
      payload: {
        report_type: "hr/employees",
        format: "csv",
        filters: { status: "active" }
      }
    });
    expect(createExport.statusCode).toBe(200);
    expect(createExport.json()).toMatchObject({
      report_type: "hr/employees",
      format: "csv",
      status: "ready",
      adapter: `${app.store.objectStorage?.kind}-generated-csv`,
      download_document_id: expect.any(String)
    });
    await expect(app.store.objectStorage?.statObject(app.store.documents.find((document) => document.id === createExport.json().download_document_id)?.storage_key ?? "")).resolves.toMatchObject({
      size: expect.any(Number)
    });

    const xlsxExport = await app.inject({
      method: "POST",
      url: "/api/v1/reports/exports",
      headers: authHeader(admin.token),
      payload: {
        report_type: "hr/employees",
        format: "xlsx",
        filters: { status: "active" }
      }
    });
    expect(xlsxExport.statusCode).toBe(200);
    expect(xlsxExport.json()).toMatchObject({
      report_type: "hr/employees",
      format: "xlsx",
      status: "ready",
      adapter: `${app.store.objectStorage?.kind}-generated-xlsx`,
      file_name: expect.stringMatching(/\.xlsx$/u),
      download_document_id: expect.any(String)
    });
    const xlsxDocument = app.store.documents.find((document) => document.id === xlsxExport.json().download_document_id);
    expect(xlsxDocument?.mime_type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await expect(app.store.objectStorage?.statObject(xlsxDocument?.storage_key ?? "")).resolves.toMatchObject({
      size: expect.any(Number)
    });

    const listExports = await app.inject({
      method: "GET",
      url: "/api/v1/reports/exports?page=1&page_size=10&report_type=hr/employees",
      headers: authHeader(admin.token)
    });
    expect(listExports.statusCode).toBe(200);
    expect(listExports.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createExport.json().id,
          report_type: "hr/employees"
        })
      ])
    );

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/reports/exports/${createExport.json().id}`,
      headers: authHeader(admin.token)
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().event_id).toBe(createExport.json().event_id);
    expect(detail.json().download_document_id).toBe(createExport.json().download_document_id);

    // Fresh PostgreSQL export reads must not make an admin's export visible
    // after the actor switches to a different company context.
    const adminPreference = app.store.userSessionPreferences.find((preference) => preference.user_id === admin.user.id)!;
    const originalCompanyId = adminPreference.company_id;
    adminPreference.company_id = randomUUID();
    try {
      const otherCompanyList = await app.inject({
        method: "GET", url: "/api/v1/reports/exports?page=1&page_size=10",
        headers: authHeader(admin.token)
      });
      expect(otherCompanyList.statusCode).toBe(200);
      expect(otherCompanyList.json().items).toEqual([]);
      const otherCompanyDetail = await app.inject({
        method: "GET", url: `/api/v1/reports/exports/${createExport.json().id}`,
        headers: authHeader(admin.token)
      });
      expect(otherCompanyDetail.statusCode).toBe(403);
    } finally {
      adminPreference.company_id = originalCompanyId;
    }

    await app.store.pgPool!.query(
      "UPDATE platform.outbox_events SET payload = payload - 'company_id' WHERE event_id = $1",
      [createExport.json().event_id],
    );
    const legacyList = await app.inject({
      method: "GET", url: "/api/v1/reports/exports?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(legacyList.statusCode).toBe(200);
    expect(legacyList.json().items.some((item: { id: string }) => item.id === createExport.json().id)).toBe(false);
    const legacyDetail = await app.inject({
      method: "GET", url: `/api/v1/reports/exports/${createExport.json().id}`,
      headers: authHeader(admin.token)
    });
    expect(legacyDetail.statusCode).toBe(403);

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/reports/audit?page=1&page_size=10&module=reports",
      headers: authHeader(admin.token)
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reports.export.requested",
          module: "Reports"
        })
      ])
    );
  });
});
