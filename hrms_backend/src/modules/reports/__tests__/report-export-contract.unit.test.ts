import { describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import {
  normalizeReportExportType,
  ReportExportTypeValues,
} from "../export-contract.js";
import { ReportService } from "../service.js";

describe("report export type contract", () => {
  it("normalizes every supported report type and current aliases", () => {
    for (const reportType of ReportExportTypeValues) {
      expect(normalizeReportExportType(reportType)).toBe(reportType);
    }
    expect(normalizeReportExportType("  HR/Employees  ")).toBe("hr/employees");
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
});
