import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("core hierarchy API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns active subordinate subtree with summary/depth and hierarchy scoping", async () => {
    const reviewer = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");
    const auditor = await loginAs(app, "AUD");

    const reviewerSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(reviewer.token)
    });
    expect(reviewerSubtree.statusCode).toBe(200);
    expect(reviewerSubtree.json().total_active_descendants).toBe(3);
    expect(reviewerSubtree.json().max_depth).toBe(1);
    expect(reviewerSubtree.json().summary.root_employee_code).toBe("D1");
    expect(reviewerSubtree.json().items.map((user: { employee_code: string }) => user.employee_code).sort()).toEqual(["E1", "E2", "E3"]);
    expect(reviewerSubtree.json().items.every((user: { depth: number }) => user.depth === 1)).toBe(true);

    const ownSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${employee.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ownSubtree.statusCode).toBe(200);
    expect(ownSubtree.json().total).toBe(0);

    const ancestorAttempt = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ancestorAttempt.statusCode).toBe(403);

    const auditorSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(auditor.token)
    });
    expect(auditorSubtree.statusCode).toBe(200);
  });

  it("returns enriched session context and scoped employee directory/detail shapes", async () => {
    const manager = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(manager.token)
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().active_role.key).toBe("Employee");
    expect(session.json().permissions).toContain("expense:create");
    expect(session.json().navigation.map((item: { key: string }) => item.key)).toContain("dashboard");
    expect(session.json().company.timezone).toBe("Asia/Kolkata");
    expect(session.json().session_metadata.low_bandwidth_defaults).toMatchObject({ page_size: 25, max_page_size: 100 });

    const managerDirectory = await app.inject({
      method: "GET",
      url: "/api/v1/core/users?page=1&page_size=10&role=Employee&sort=employee_code",
      headers: authHeader(manager.token)
    });
    expect(managerDirectory.statusCode).toBe(200);
    expect(managerDirectory.json().items.map((user: { employee_code: string }) => user.employee_code)).toEqual(["D1", "E1", "E2", "E3"]);
    expect(managerDirectory.json().items[0].department.department_code).toBe("SALES");
    expect(managerDirectory.json().items[0].login_state).toBe("enabled");

    const adminFiltered = await app.inject({
      method: "GET",
      url: `/api/v1/core/users?page=1&page_size=10&department_id=${manager.user.department_id}&manager_user_id=${manager.user.id}&login_state=enabled`,
      headers: authHeader(admin.token)
    });
    expect(adminFiltered.statusCode).toBe(200);
    expect(adminFiltered.json().total).toBe(3);
    expect(adminFiltered.json().summary.filters_applied.sort()).toEqual(["department_id", "login_state", "manager_user_id"]);

    const employeeDetail = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${employee.user.id}`,
      headers: authHeader(manager.token)
    });
    expect(employeeDetail.statusCode).toBe(200);
    expect(employeeDetail.json().manager.employee_code).toBe("D1");
    expect(employeeDetail.json().profile_tabs_available).toContain("timesheets");
    expect(employeeDetail.json().expense_summary.total_requests).toBe(0);

    const forbiddenDetail = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${manager.user.id}`,
      headers: authHeader(employee.token)
    });
    expect(forbiddenDetail.statusCode).toBe(403);
  });

});
