import { describe, expect, it } from "vitest";
import type { AuthUser } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import {
  normalizeReportExportType,
  ReportExportTypeValues,
  type ReportExportType,
} from "../export-contract.js";
import { ReportService } from "../service.js";

describe("report export type contract", () => {
  it("normalizes every supported report type and current aliases", () => {
    for (const reportType of ReportExportTypeValues) {
      expect(normalizeReportExportType(reportType)).toBe(reportType);
    }
    expect(normalizeReportExportType("  HR/Employees  ")).toBe("hr/employees");
  });

  it("dispatches every supported report type to its intended report", () => {
    const store = createMemoryDataStore();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    const service = new ReportService(store);
    const expectedDispatch: Record<ReportExportType, string> = {
      expense: "register",
      expenses: "register",
      "expenses/register": "register",
      "expenses/my": "myExpenses",
      "expenses/manager-queue": "managerQueue",
      "expenses/manager-history": "managerHistory",
      "expenses/finance-dashboard": "financeDashboard",
      "expenses/finance-history": "financeHistory",
      hr: "hrEmployees",
      "hr/employees": "hrEmployees",
      attendance: "attendanceSummary",
      "attendance/summary": "attendanceSummary",
      leave: "leaveWfhSummary",
      "leave-wfh": "leaveWfhSummary",
      "leave-wfh/summary": "leaveWfhSummary",
      projects: "projectsSummary",
      "projects/summary": "projectsSummary",
      timesheets: "timesheetsSummary",
      "timesheets/summary": "timesheetsSummary",
      assets: "assetsSummary",
      "assets/summary": "assetsSummary",
      helpdesk: "helpdeskSummary",
      "helpdesk/summary": "helpdeskSummary",
      audit: "auditReport",
    };
    const methodNames = new Set(Object.values(expectedDispatch));
    Object.assign(
      service,
      Object.fromEntries(
        [...methodNames].map((methodName) => [
          methodName,
          () => ({ items: [{ dispatch: methodName }] }),
        ]),
      ),
    );
    const dispatcher = service as unknown as {
      exportRows: (
        actor: AuthUser,
        reportType: ReportExportType,
        filters: Record<string, unknown>,
      ) => Array<Record<string, unknown>>;
    };

    for (const reportType of ReportExportTypeValues) {
      expect(dispatcher.exportRows(actor, reportType, {})).toEqual([
        { dispatch: expectedDispatch[reportType] },
      ]);
    }
  });

  it("rejects unsupported direct service calls without side effects", async () => {
    const store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    const documentsBefore = structuredClone(store.documents);
    const versionsBefore = structuredClone(store.documentVersions);
    const outboxBefore = structuredClone(store.outbox);

    expect(normalizeReportExportType("unknown-report")).toBeNull();
    await expect(
      new ReportService(store).createExport(actor, {
        report_type: "unknown-report",
        format: "xlsx",
        filters: {},
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400,
    });

    expect(store.documents).toEqual(documentsBefore);
    expect(store.documentVersions).toEqual(versionsBefore);
    expect(store.outbox).toEqual(outboxBefore);
  });

  it("fails closed if malformed runtime input bypasses the public export validator", () => {
    const store = createMemoryDataStore();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    const service = new ReportService(store) as unknown as {
      exportRows: (
        actor: AuthUser,
        reportType: string,
        filters: Record<string, unknown>,
      ) => Array<Record<string, unknown>>;
    };

    let thrown: unknown;
    try {
      service.exportRows(actor, "unknown-report", {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400,
      details: { report_type: "unknown-report" },
    });
  });
});
