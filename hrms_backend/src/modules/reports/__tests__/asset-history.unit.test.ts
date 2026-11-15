import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, nowIso, seedIds } from "../../../platform/data-store.js";
import { ReportService } from "../service.js";

describe("asset report historical identity", () => {
  it("uses the original-company recovery snapshot instead of a mutable current user profile", () => {
    const store = createMemoryDataStore();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    actor.roles = [Roles.Admin];
    const employee = store.users.find((user) => user.id === seedIds.employee1)!;
    const asset = store.assets[0]!;
    const capturedName = employee.full_name;
    const capturedCode = employee.employee_code;
    const createdAt = nowIso();
    store.assetRecoveryTickets.push({
      id: randomUUID(),
      company_id: asset.company_id,
      employee_user_id: employee.id,
      employee_full_name_snapshot: capturedName,
      employee_code_snapshot: capturedCode,
      asset_id: asset.id,
      assignment_id: null,
      status: "open",
      settlement_status: null,
      settlement_amount: null,
      settlement_remarks: null,
      settled_by_user_id: null,
      settled_at: null,
      version: 1,
      created_at: createdAt,
      updated_at: createdAt,
    });

    employee.full_name = "Foreign Company Profile";
    employee.email = "foreign-profile@example.test";
    employee.roles = [Roles.Admin];

    const report = new ReportService(store).assetsSummary(actor, { page: 1, page_size: 10 });
    expect(report.recovery_rows).toEqual([
      expect.objectContaining({
        employee_user_id: employee.id,
        employee: capturedName,
      }),
    ]);
    expect(report.recovery_rows[0]).not.toHaveProperty("email");
    expect(report.recovery_rows[0]).not.toHaveProperty("roles");
  });
});
