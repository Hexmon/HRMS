import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin RBAC settings", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists roles and permissions for admins only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/rbac/roles?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const roles = await app.inject({
      method: "GET",
      url: "/api/v1/admin/rbac/roles?page=1&page_size=25&active_only=true",
      headers: authHeader(admin.token)
    });
    expect(roles.statusCode).toBe(200);
    expect(roles.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role_key: "Admin",
          protected_system_role: true,
          permission_ids: expect.arrayContaining(["dashboard:view", "admin_settings:configure"])
        })
      ])
    );

    const permissions = await app.inject({
      method: "GET",
      url: "/api/v1/admin/rbac/permissions?module=Dashboard",
      headers: authHeader(admin.token)
    });
    expect(permissions.statusCode).toBe(200);
    expect(permissions.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dashboard:view", group: "Dashboard", action: "view" }),
        expect.objectContaining({ id: "dashboard:export", group: "Dashboard", action: "export" })
      ])
    );
  });

  it("creates custom roles and manages metadata and permissions with OCC", async () => {
    const admin = await loginAs(app, "ADM");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/rbac/roles",
      headers: authHeader(admin.token),
      payload: {
        role_key: "Payroll Coordinator",
        name: "Payroll Coordinator",
        description: "Can review payroll reports.",
        permission_ids: ["reports:view", "reports:export"]
      }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().role).toMatchObject({
      role_key: "Payroll Coordinator",
      name: "Payroll Coordinator",
      builtin: false,
      protected_system_role: false,
      version: 1
    });
    expect(create.json().role.permission_ids).toEqual(["reports:export", "reports:view"]);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/rbac/roles",
      headers: authHeader(admin.token),
      payload: {
        role_key: "payroll coordinator",
        name: "Payroll Duplicate",
        permission_ids: []
      }
    });
    expect(duplicate.statusCode).toBe(409);

    const invalidPermission = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/rbac/roles/${create.json().role.id}/permissions`,
      headers: authHeader(admin.token),
      payload: {
        permission_ids: ["unknown:permission"],
        expected_version: 1
      }
    });
    expect(invalidPermission.statusCode).toBe(400);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/rbac/roles/${create.json().role.id}`,
      headers: authHeader(admin.token),
      payload: {
        name: "Payroll Operations",
        description: "Can review payroll and export reports.",
        expected_version: 1
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().role).toMatchObject({
      name: "Payroll Operations",
      description: "Can review payroll and export reports.",
      version: 2
    });

    const staleUpdate = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/rbac/roles/${create.json().role.id}`,
      headers: authHeader(admin.token),
      payload: {
        name: "Stale Payroll",
        expected_version: 1
      }
    });
    expect(staleUpdate.statusCode).toBe(409);

    const replace = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/rbac/roles/${create.json().role.id}/permissions`,
      headers: authHeader(admin.token),
      payload: {
        permission_ids: ["dashboard:view", "reports:view"],
        expected_version: 2,
        remarks: "Narrowed payroll role after review."
      }
    });
    expect(replace.statusCode).toBe(200);
    expect(replace.json().role).toMatchObject({ version: 3 });
    expect(replace.json().role.permission_ids).toEqual(["dashboard:view", "reports:view"]);

    const staleReplace = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/rbac/roles/${create.json().role.id}/permissions`,
      headers: authHeader(admin.token),
      payload: {
        permission_ids: ["dashboard:view"],
        expected_version: 2
      }
    });
    expect(staleReplace.statusCode).toBe(409);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.rbac.role.permissions_replaced");
  });

  it("protects the built-in Admin role from deactivation and permission replacement", async () => {
    const admin = await loginAs(app, "ADM");

    const roles = await app.inject({
      method: "GET",
      url: "/api/v1/admin/rbac/roles?page=1&page_size=25",
      headers: authHeader(admin.token)
    });
    const adminRole = roles.json().items.find((role: { role_key: string }) => role.role_key === "Admin");
    expect(adminRole).toBeDefined();

    const deactivate = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/rbac/roles/${adminRole.id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: adminRole.version }
    });
    expect(deactivate.statusCode).toBe(409);

    const replace = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/rbac/roles/${adminRole.id}/permissions`,
      headers: authHeader(admin.token),
      payload: { permission_ids: ["dashboard:view"], expected_version: adminRole.version }
    });
    expect(replace.statusCode).toBe(409);
  });
});
