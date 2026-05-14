import { describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { Roles } from "#shared";
import { CoreService } from "../service.js";

describe("core hierarchy", () => {
  it("resolves ltree-style subtree without recursive traversal", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const subtree = service.resolveSubtree(seedIds.reviewer);
    expect(subtree.map((user) => user.employee_code).sort()).toEqual(["E1", "E2", "E3"]);
  });

  it("excludes inactive users from active lookup", () => {
    const store = createMemoryDataStore();
    store.users.find((user) => user.id === seedIds.employee1)!.employment_status = "inactive";
    const service = new CoreService(store);
    const subtree = service.resolveSubtree(seedIds.reviewer);
    expect(subtree.map((user) => user.employee_code)).not.toContain("E1");
  });

  it("filters and enriches the employee directory for scoped frontend tables", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const result = service.listUsers(admin, {
      page: 1,
      page_size: 10,
      manager_user_id: seedIds.manager,
      role: Roles.Employee,
      login_state: "enabled",
      sort: "-employee_code"
    });

    expect(result.total).toBe(3);
    expect(result.summary.filters_applied.sort()).toEqual(["login_state", "manager_user_id", "role"]);
    expect(result.items.map((user) => user.employee_code)).toEqual(["E3", "E2", "E1"]);
    expect(result.items[0]).toMatchObject({
      department: { department_code: "SALES" },
      designation: { designation_code: "EMPLOYEE" },
      manager: { employee_code: "D1" },
      login_state: "enabled",
      display_label: "E3 - Employee E3"
    });
  });

  it("returns employee detail summaries without loading unavailable modules", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const detail = service.getUser(admin, seedIds.manager);

    expect(detail.direct_reports_summary).toEqual({ total: 3, active: 3 });
    expect(detail.reporting_line.map((user) => user.employee_code)).toEqual(["S1"]);
    expect(detail.profile_tabs_available).toContain("expenses");
    expect(detail.attendance_summary.status).toBe("not_available");
    expect(detail.leave_summary.status).toBe("not_available");
  });

});
