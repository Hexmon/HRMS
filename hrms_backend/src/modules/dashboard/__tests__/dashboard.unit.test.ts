import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { DashboardService } from "../service.js";

describe("dashboard summary scoping", () => {
  it("limits privileged dashboard metrics to the actor active company", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.userSessionPreferences.push({
      id: "pref-admin-company-a",
      user_id: admin.id,
      active_role: Roles.Admin,
      company_id: "company-a",
      landing_page: "/dashboard",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      version: 1
    });

    const summary = new DashboardService(store).summary(admin);

    expect(summary.scope).toMatchObject({
      employee_code: "ADM",
      visibility: "all"
    });
    expect(summary.workforce.visible_employees).toBe(1);
    expect(summary.workforce.active_employees).toBe(1);
    expect(summary.workforce.departments.map((department) => ({
      code: department.department_code,
      active_employees: department.active_employees
    }))).toEqual([{ code: "FIN", active_employees: 1 }]);
    expect(summary.cards.find((card) => card.key === "active_employees")?.value).toBe(1);
    expect(summary.cards.find((card) => card.key === "attendance_exceptions")?.value).toBe(0);
    expect(summary.operations.assets_total).toBe(0);
    expect(summary.operations.notifications_pending).toBe(0);
    expect(summary.operations.outbox_pending).toBe(0);
  });
});
