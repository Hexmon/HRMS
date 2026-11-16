import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin master data", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("manages department master data with OCC, duplicate, and active-reference protection", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/departments?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/departments?page=1&page_size=10&search=sales",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual([]);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Engineering", code: "ENG" }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().department).toMatchObject({
      department_code: "ENG",
      name: "Engineering",
      status: "active",
      version: 1
    });
    const pool = app.store.pgPool!;
    await expect(
      pool.query("SELECT name, version FROM core.departments WHERE id = $1", [create.json().department.id]),
    ).resolves.toMatchObject({ rows: [{ name: "Engineering", version: 1 }] });
    await expect(
      pool.query(
        "SELECT event_type FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
        [create.json().department.id],
      ),
    ).resolves.toMatchObject({ rows: [{ event_type: "admin.master_data.department.created" }] });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Engineering Duplicate", code: "ENG" }
    });
    expect(duplicate.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${create.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { name: "Engineering Ops", expected_version: 1 }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().department).toMatchObject({ name: "Engineering Ops", version: 2 });
    await expect(
      pool.query("SELECT name, version FROM core.departments WHERE id = $1", [create.json().department.id]),
    ).resolves.toMatchObject({ rows: [{ name: "Engineering Ops", version: 2 }] });

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${create.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { name: "Stale", expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);

    const inactive = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${create.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: 2 }
    });
    expect(inactive.statusCode).toBe(200);
    expect(inactive.json().department).toMatchObject({ status: "inactive", active: false, version: 3 });

    const protectedDepartment = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Protected Sales", code: "PROTECTED_SALES" }
    });
    expect(protectedDepartment.statusCode).toBe(200);
    await pool.query("UPDATE core.users SET department_id = $1 WHERE id = $2", [
      protectedDepartment.json().department.id,
      employee.user.id,
    ]);

    const referenced = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${protectedDepartment.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: 1 }
    });
    expect(referenced.statusCode).toBe(409);

    const durableEvents = await pool.query<{ event_type: string }>(
      "SELECT event_type FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
      [create.json().department.id],
    );
    expect(durableEvents.rows.map((event) => event.event_type)).toEqual([
      "admin.master_data.department.created",
      "admin.master_data.department.updated",
      "admin.master_data.department.updated",
    ]);

    await app.close();
    app = await buildRealApp({ reset: false });
    await app.ready();
    const restartedAdmin = await loginAs(app, "ADM");
    const afterRestart = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/departments?page=1&page_size=50&search=engineering",
      headers: authHeader(restartedAdmin.token),
    });
    expect(afterRestart.statusCode).toBe(200);
    expect(afterRestart.json().items).toEqual([
      expect.objectContaining({ id: create.json().department.id, name: "Engineering Ops", version: 3 }),
    ]);
  });

  it("fails closed from durable authority and rolls back forbidden hierarchy writes", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const preference = await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1",
      [admin.user.id],
    );
    const companyId = preference.rows[0]!.company_id;
    const before = await pool.query<{ departments: string; events: string }>(
      `SELECT (SELECT count(*)::text FROM core.departments WHERE company_id = $1) AS departments,
              (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'department') AS events`,
      [companyId],
    );

    await expect(persistence.departmentsForActor!(randomUUID())).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      persistence.createDepartmentForActor!(employee.user.id, { name: "Forbidden Role", code: "FORBIDDEN_ROLE" }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await pool.query("UPDATE core.users SET employment_status = 'inactive' WHERE id = $1", [admin.user.id]);
    await expect(persistence.departmentsForActor!(admin.user.id)).rejects.toMatchObject({ statusCode: 401 });
    await pool.query("UPDATE core.users SET employment_status = 'active' WHERE id = $1", [admin.user.id]);

    await pool.query("UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = 'Admin'", [admin.user.id]);
    await expect(persistence.departmentsForActor!(admin.user.id)).rejects.toMatchObject({ statusCode: 403 });
    await pool.query("UPDATE core.user_roles SET status = 'active' WHERE user_id = $1 AND role_key = 'Admin'", [admin.user.id]);

    await pool.query("UPDATE platform.user_session_preferences SET company_id = NULL WHERE user_id = $1", [admin.user.id]);
    const missing = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Forbidden Missing", code: "FORBIDDEN_MISSING" },
    });
    expect(missing.statusCode).toBe(400);

    await pool.query("UPDATE platform.user_session_preferences SET company_id = $2 WHERE user_id = $1", [admin.user.id, companyId]);
    await pool.query("UPDATE platform.company_profiles SET status = 'inactive' WHERE id = $1", [companyId]);
    const inactive = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Forbidden Inactive", code: "FORBIDDEN_INACTIVE" },
    });
    expect(inactive.statusCode).toBe(400);

    const after = await pool.query<{ departments: string; events: string }>(
      `SELECT (SELECT count(*)::text FROM core.departments WHERE company_id = $1) AS departments,
              (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'department') AS events`,
      [companyId],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("serializes concurrent reparenting so two instances cannot commit a cycle", async () => {
    const admin = await loginAs(app, "ADM");
    const previousResetOverride = process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
    process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = "true";
    const second = await buildRealApp({ reset: false });
    await second.ready();
    try {
      const secondAdmin = await loginAs(second, "ADM");
      const create = async (target: FastifyInstance, token: string, name: string, code: string) =>
        target.inject({ method: "POST", url: "/api/v1/admin/master-data/departments", headers: authHeader(token), payload: { name, code } });
      const first = await create(app, admin.token, "Concurrent A", "CONCURRENT_A");
      const other = await create(app, admin.token, "Concurrent B", "CONCURRENT_B");
      expect(first.statusCode).toBe(200);
      expect(other.statusCode).toBe(200);

      const [aToB, bToA] = await Promise.all([
        app.inject({
          method: "PATCH",
          url: `/api/v1/admin/master-data/departments/${first.json().department.id}`,
          headers: authHeader(admin.token),
          payload: { parent_department_id: other.json().department.id, expected_version: 1 },
        }),
        second.inject({
          method: "PATCH",
          url: `/api/v1/admin/master-data/departments/${other.json().department.id}`,
          headers: authHeader(secondAdmin.token),
          payload: { parent_department_id: first.json().department.id, expected_version: 1 },
        }),
      ]);
      expect([aToB.statusCode, bToA.statusCode].sort()).toEqual([200, 409]);
      const rows = await app.store.pgPool!.query<{ id: string; parent_department_id: string | null }>(
        "SELECT id, parent_department_id FROM core.departments WHERE id = ANY($1::uuid[]) ORDER BY id",
        [[first.json().department.id, other.json().department.id]],
      );
      const byId = new Map(rows.rows.map((row) => [row.id, row.parent_department_id]));
      expect(!(byId.get(first.json().department.id) === other.json().department.id && byId.get(other.json().department.id) === first.json().department.id)).toBe(true);
    } finally {
      await second.close();
      if (previousResetOverride === undefined) delete process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
      else process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = previousResetOverride;
    }
  });

  it("manages designation master data with OCC and duplicate-code protection", async () => {
    const admin = await loginAs(app, "ADM");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/designations",
      headers: authHeader(admin.token),
      payload: { title: "Principal Engineer", code: "PRINCIPAL_ENGINEER", level: 9 }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().designation).toMatchObject({
      designation_code: "PRINCIPAL_ENGINEER",
      title: "Principal Engineer",
      level: 9,
      version: 1
    });
    await expect(
      app.store.pgPool!.query(
        "SELECT title, version FROM core.designations WHERE id = $1",
        [create.json().designation.id],
      ),
    ).resolves.toMatchObject({ rows: [{ title: "Principal Engineer", version: 1 }] });
    await expect(
      app.store.pgPool!.query(
        "SELECT event_type FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
        [create.json().designation.id],
      ),
    ).resolves.toMatchObject({ rows: [{ event_type: "admin.master_data.designation.created" }] });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/designations?page=1&page_size=10&search=principal",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/designations",
      headers: authHeader(admin.token),
      payload: { title: "Principal Duplicate", code: "PRINCIPAL_ENGINEER" }
    });
    expect(duplicate.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/designations/${create.json().designation.id}`,
      headers: authHeader(admin.token),
      payload: { title: "Principal Consultant", level: 10, expected_version: 1 }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().designation).toMatchObject({
      title: "Principal Consultant",
      level: 10,
      version: 2
    });

    const inactive = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/designations/${create.json().designation.id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: 2 }
    });
    expect(inactive.statusCode).toBe(200);
    expect(inactive.json().designation).toMatchObject({ status: "inactive", active: false, version: 3 });
  });

  it("manages extended master-data groups for visible Admin Settings tabs", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/employmentTypes?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/employmentTypes?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);
    expect(list.json().items[0]).toMatchObject({ master_key: "employmentTypes", active: true, version: 1 });

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/projectRoles",
      headers: authHeader(admin.token),
      payload: { name: "QA Lead", code: "QA_LEAD", description: "Owns release quality" }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().item).toMatchObject({
      master_key: "projectRoles",
      code: "QA_LEAD",
      name: "QA Lead",
      description: "Owns release quality",
      active: true,
      version: 1
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/projectRoles",
      headers: authHeader(admin.token),
      payload: { name: "QA Lead Duplicate", code: "QA_LEAD" }
    });
    expect(duplicate.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/projectRoles/${create.json().item.id}`,
      headers: authHeader(admin.token),
      payload: { name: "Release QA Lead", status: "inactive", expected_version: 1 }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().item).toMatchObject({
      name: "Release QA Lead",
      status: "inactive",
      active: false,
      version: 2
    });

    const invalidKey = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/notARealGroup",
      headers: authHeader(admin.token)
    });
    expect(invalidKey.statusCode).toBe(400);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.master_data.item.updated");
  });
});
