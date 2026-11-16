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
    const companyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1",
      [admin.user.id],
    )).rows[0]!.company_id;
    await expect(
      pool.query("SELECT name, version FROM core.departments WHERE id = $1", [create.json().department.id]),
    ).resolves.toMatchObject({ rows: [{ name: "Engineering", version: 1 }] });
    await expect(
      pool.query(
        "SELECT event_type, payload->>'company_id' AS company_id FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
        [create.json().department.id],
      ),
    ).resolves.toMatchObject({ rows: [{ event_type: "admin.master_data.department.created", company_id: companyId }] });

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

    const durableEvents = await pool.query<{ event_type: string; company_id: string }>(
      "SELECT event_type, payload->>'company_id' AS company_id FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
      [create.json().department.id],
    );
    expect(durableEvents.rows).toEqual([
      { event_type: "admin.master_data.department.created", company_id: companyId },
      { event_type: "admin.master_data.department.updated", company_id: companyId },
      { event_type: "admin.master_data.department.updated", company_id: companyId },
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
    await expect(
      persistence.createDepartmentForActor!(admin.user.id, { name: "Forbidden Inactive User", code: "FORBIDDEN_INACTIVE_USER" }),
    ).rejects.toMatchObject({ statusCode: 401 });
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

  it("fails closed when company context changes while a durable write waits for its lock", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const preference = await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1",
      [admin.user.id],
    );
    const companyAId = preference.rows[0]!.company_id;
    const companyBId = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status, bootstrap_completed_at)
       VALUES ($1, 'Context Race Company', $2, 'active', now())`,
      [companyBId, `context-race-${companyBId}`],
    );
    const blocker = await pool.connect();
    let blockerOpen = false;
    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [
        `core:master-assignment:${companyAId}`,
      ]);
      const pending = persistence.createDepartmentForActor!(admin.user.id, {
        name: "Context Race",
        code: "CONTEXT_RACE",
      });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const waiting = await pool.query<{ waiting: number }>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`,
        );
        if (waiting.rows[0]!.waiting > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (attempt === 39) throw new Error("Admin write did not wait for the master-assignment lock.");
      }
      await pool.query("UPDATE platform.user_session_preferences SET company_id = $2 WHERE user_id = $1", [
        admin.user.id,
        companyBId,
      ]);
      await blocker.query("COMMIT");
      blockerOpen = false;
      await expect(pending).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        pool.query("SELECT count(*)::text AS count FROM core.departments WHERE department_code = 'CONTEXT_RACE'"),
      ).resolves.toMatchObject({ rows: [{ count: "0" }] });
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
      await pool.query("UPDATE platform.user_session_preferences SET company_id = $2 WHERE user_id = $1", [
        admin.user.id,
        companyAId,
      ]);
    }
  });

  it("fences Company A from Company B master data and permits an effective HR Manager", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const companyA = await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1",
      [admin.user.id],
    );
    const companyAId = companyA.rows[0]!.company_id;
    const companyBId = randomUUID();
    const foreignDepartmentId = randomUUID();
    const foreignDesignationId = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status, bootstrap_completed_at)
       VALUES ($1, 'Company B', $2, 'active', now())`,
      [companyBId, `company-b-${companyBId}`],
    );
    await pool.query(
      `INSERT INTO core.departments (id, company_id, department_code, name, status, version)
       VALUES ($1, $2, $3, 'Foreign Department', 'active', 1)`,
      [foreignDepartmentId, companyBId, `FOREIGN_DEPT_${companyBId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO core.designations (id, company_id, designation_code, title, status, version)
       VALUES ($1, $2, $3, 'Foreign Designation', 'active', 1)`,
      [foreignDesignationId, companyBId, `FOREIGN_DESIG_${companyBId.slice(0, 8)}`],
    );
    const before = await pool.query(
      `SELECT
         (SELECT version FROM core.departments WHERE id = $1) AS department_version,
         (SELECT version FROM core.designations WHERE id = $2) AS designation_version,
         (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_id = ANY($3::uuid[])) AS events`,
      [foreignDepartmentId, foreignDesignationId, [foreignDepartmentId, foreignDesignationId]],
    );

    expect((await persistence.departmentsForActor!(admin.user.id)).some((row) => row.id === foreignDepartmentId)).toBe(false);
    expect((await persistence.designationsForActor!(admin.user.id)).some((row) => row.id === foreignDesignationId)).toBe(false);
    await expect(
      persistence.updateDepartmentForActor!(admin.user.id, foreignDepartmentId, { name: "Tenant Escape", expected_version: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      persistence.createDepartmentForActor!(admin.user.id, { name: "Foreign Parent", code: "FOREIGN_PARENT_DENIED", parent_id: foreignDepartmentId }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      persistence.updateDesignationForActor!(admin.user.id, foreignDesignationId, { title: "Tenant Escape", expected_version: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const after = await pool.query(
      `SELECT
         (SELECT version FROM core.departments WHERE id = $1) AS department_version,
         (SELECT version FROM core.designations WHERE id = $2) AS designation_version,
         (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_id = ANY($3::uuid[])) AS events`,
      [foreignDepartmentId, foreignDesignationId, [foreignDepartmentId, foreignDesignationId]],
    );
    expect(after.rows).toEqual(before.rows);

    await pool.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, 'HR Manager', 'active', CURRENT_DATE)`,
      [randomUUID(), admin.user.id],
    );
    await pool.query("UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = 'Admin'", [admin.user.id]);
    await pool.query("UPDATE platform.user_session_preferences SET active_role = 'HR Manager' WHERE user_id = $1", [admin.user.id]);
    const hrDepartment = await persistence.createDepartmentForActor!(admin.user.id, {
      name: "HR Managed Department",
      code: "HR_MANAGED_DEPARTMENT",
    });
    const hrDesignation = await persistence.createDesignationForActor!(admin.user.id, {
      title: "HR Managed Designation",
      code: "HR_MANAGED_DESIGNATION",
    });
    expect(hrDepartment.company_id).toBe(companyAId);
    expect(hrDesignation.company_id).toBe(companyAId);
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
      const eventCount = await app.store.pgPool!.query<{ total: string; updates: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE event_type = 'admin.master_data.department.updated')::text AS updates
         FROM platform.outbox_events WHERE aggregate_id = ANY($1::uuid[])`,
        [[first.json().department.id, other.json().department.id]],
      );
      expect(eventCount.rows).toEqual([{ total: "3", updates: "1" }]);
    } finally {
      await second.close();
      if (previousResetOverride === undefined) delete process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
      else process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = previousResetOverride;
    }
  });

  it("does not let a stale second instance overwrite transaction-owned master data", async () => {
    const admin = await loginAs(app, "ADM");
    const previousResetOverride = process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
    process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = "true";
    const stale = await buildRealApp({ reset: false });
    await stale.ready();
    try {
      const created = await app.store.persistence!.createDepartmentForActor!(admin.user.id, {
        name: "Durable New Name",
        code: "STALE_FLUSH_GUARD",
      });
      const updated = await app.store.persistence!.updateDepartmentForActor!(admin.user.id, created.id, {
        name: "Durable Updated Name",
        expected_version: 1,
      });
      stale.store.departments.push({ ...created, name: "Stale Snapshot Name", version: 1 });

      const nullablePreference = stale.store.userSessionPreferences.find(
        (preference) => preference.user_id !== admin.user.id && preference.company_id,
      )!;
      const nullablePreferenceCompanyId = nullablePreference.company_id!;
      const inactiveUser = stale.store.users.find(
        (user) => user.id !== admin.user.id && user.id !== nullablePreference.user_id,
      )!;
      const inactiveUserStatus = inactiveUser.employment_status;
      nullablePreference.company_id = null;
      inactiveUser.employment_status = "inactive";
      stale.store.designations.push({
        ...stale.store.designations[0]!,
        id: randomUUID(),
        company_id: randomUUID(),
        designation_code: "FILTERED_FOREIGN_DESIGNATION",
      });
      await stale.store.persistence!.flush();
      nullablePreference.company_id = nullablePreferenceCompanyId;
      inactiveUser.employment_status = inactiveUserStatus;
      await app.store.pgPool!.query(
        "UPDATE platform.user_session_preferences SET company_id = $2 WHERE user_id = $1",
        [nullablePreference.user_id, nullablePreferenceCompanyId],
      );
      await app.store.pgPool!.query("UPDATE core.users SET employment_status = $2 WHERE id = $1", [
        inactiveUser.id,
        inactiveUserStatus,
      ]);
      await stale.store.persistence!.flushDomain!("core", { userIds: [] });
      await expect(stale.store.persistence!.flushCompanyBootstrap!({})).rejects.toThrow(
        "Company bootstrap persistence requires an explicit company id.",
      );
      await stale.store.persistence!.flushCompanyBootstrap!({ companyIds: [created.company_id!] });

      await expect(
        app.store.pgPool!.query("SELECT name, version FROM core.departments WHERE id = $1", [created.id]),
      ).resolves.toMatchObject({ rows: [{ name: updated.name, version: 2 }] });
      await expect(
        app.store.pgPool!.query(
          "SELECT count(*)::text AS count FROM platform.outbox_events WHERE aggregate_id = $1",
          [created.id],
        ),
      ).resolves.toMatchObject({ rows: [{ count: "2" }] });
    } finally {
      await stale.close();
      if (previousResetOverride === undefined) delete process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
      else process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = previousResetOverride;
    }
  });

  it("serializes active employee assignment against master-data deactivation", async () => {
    const admin = await loginAs(app, "ADM");
    const department = await app.store.persistence!.createDepartmentForActor!(admin.user.id, {
      name: "Assignment Race Department",
      code: "ASSIGNMENT_RACE_DEPARTMENT",
    });
    const previousResetOverride = process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
    process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = "true";
    const second = await buildRealApp({ reset: false });
    await second.ready();
    try {
      const secondAdmin = await loginAs(second, "ADM");
      const employee = second.store.users.find((user) => user.employee_code === "E1")!;
      const [assignment, deactivation] = await Promise.allSettled([
        second.inject({
          method: "PATCH",
          url: `/api/v1/core/users/${employee.id}`,
          headers: authHeader(secondAdmin.token),
          payload: { department_id: department.id, expected_version: employee.version },
        }),
        app.store.persistence!.updateDepartmentForActor!(admin.user.id, department.id, {
          status: "inactive",
          expected_version: 1,
        }),
      ]);
      const assignmentSucceeded = assignment.status === "fulfilled" && assignment.value.statusCode === 200;
      const deactivationSucceeded = deactivation.status === "fulfilled";
      expect(Number(assignmentSucceeded) + Number(deactivationSucceeded)).toBe(1);
      expect(assignment.status).toBe("fulfilled");
      if (assignment.status === "fulfilled") {
        expect([200, 409]).toContain(assignment.value.statusCode);
      }
      if (deactivation.status === "rejected") {
        expect(deactivation.reason).toMatchObject({ statusCode: 409 });
      }
      const invariant = await app.store.pgPool!.query<{ employment_status: string; department_status: string }>(
        `SELECT u.employment_status, d.status AS department_status
         FROM core.users u JOIN core.departments d ON d.id = u.department_id
         WHERE u.id = $1`,
        [employee.id],
      );
      expect(invariant.rows[0]).not.toEqual({ employment_status: "active", department_status: "inactive" });
    } finally {
      await second.close();
      if (previousResetOverride === undefined) delete process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
      else process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = previousResetOverride;
    }
  });

  it("serializes active employee creation against designation deactivation", async () => {
    const admin = await loginAs(app, "ADM");
    const designation = await app.store.persistence!.createDesignationForActor!(admin.user.id, {
      title: "Creation Race Designation",
      code: "CREATION_RACE_DESIGNATION",
    });
    const previousResetOverride = process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
    process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = "true";
    const second = await buildRealApp({ reset: false });
    await second.ready();
    try {
      const secondAdmin = await loginAs(second, "ADM");
      const department = second.store.departments.find((row) => row.status === "active" && !row.deleted_at)!;
      const employeeEmail = `race-${randomUUID()}@example.test`;
      const [assignment, deactivation] = await Promise.allSettled([
        second.inject({
          method: "POST",
          url: "/api/v1/core/users",
          headers: authHeader(secondAdmin.token),
          payload: {
            employee_code: `RACE${randomUUID().replaceAll("-", "").slice(0, 8)}`,
            email: employeeEmail,
            full_name: "Concurrent Employee",
            department_id: department.id,
            designation_id: designation.id,
            employment_status: "active",
          },
        }),
        app.store.persistence!.updateDesignationForActor!(admin.user.id, designation.id, {
          status: "inactive",
          expected_version: 1,
        }),
      ]);
      const assignmentSucceeded = assignment.status === "fulfilled" && assignment.value.statusCode === 200;
      const deactivationSucceeded = deactivation.status === "fulfilled";
      expect(Number(assignmentSucceeded) + Number(deactivationSucceeded)).toBe(1);
      expect(assignment.status).toBe("fulfilled");
      if (assignment.status === "fulfilled") {
        expect([200, 409]).toContain(assignment.value.statusCode);
      }
      if (deactivation.status === "rejected") {
        expect(deactivation.reason).toMatchObject({ statusCode: 409 });
      }
      const invariant = await app.store.pgPool!.query<{ violations: number }>(
        `SELECT count(*)::int AS violations
         FROM core.users u JOIN core.designations d ON d.id = u.designation_id
         WHERE lower(u.email) = lower($1) AND u.employment_status = 'active'
           AND u.deleted_at IS NULL AND d.status = 'inactive'`,
        [employeeEmail],
      );
      expect(invariant.rows).toEqual([{ violations: 0 }]);
    } finally {
      await second.close();
      if (previousResetOverride === undefined) delete process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
      else process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = previousResetOverride;
    }
  });

  it("rejects invalid and corrupted durable department hierarchies without side effects", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const create = (input: Parameters<NonNullable<typeof persistence.createDepartmentForActor>>[1]) =>
      persistence.createDepartmentForActor!(admin.user.id, input);
    const update = (
      id: string,
      input: Parameters<NonNullable<typeof persistence.updateDepartmentForActor>>[2],
    ) => persistence.updateDepartmentForActor!(admin.user.id, id, input);

    await expect(persistence.designationsForActor!("not-a-uuid")).rejects.toMatchObject({ code: "22P02" });

    const root = await create({ name: "Durable Root" });
    const child = await create({
      name: "Durable Child",
      department_code: "DURABLE_CHILD",
      parent_id: root.id,
    });
    const beforeRejectedWrites = await pool.query<{ departments: string; events: string }>(
      `SELECT (SELECT count(*)::text FROM core.departments) AS departments,
              (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'department') AS events`,
    );

    await expect(update(root.id, { parent_id: root.id, expected_version: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(create({ name: "Missing Parent", parent_id: randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await expect(update(root.id, { parent_department_id: child.id, expected_version: 1 })).rejects.toMatchObject({ statusCode: 409 });

    const cycleA = await create({ name: "Cycle A", code: "CYCLE_A_SQL" });
    const cycleB = await create({ name: "Cycle B", code: "CYCLE_B_SQL" });
    await pool.query(
      `UPDATE core.departments
       SET parent_department_id = CASE id WHEN $1 THEN $2::uuid ELSE $1::uuid END
       WHERE id = ANY($3::uuid[])`,
      [cycleA.id, cycleB.id, [cycleA.id, cycleB.id]],
    );
    await expect(create({ name: "Blocked By Cycle", parent_id: cycleA.id })).rejects.toMatchObject({ statusCode: 409 });

    const orphan = await create({ name: "Orphan Anchor", code: "ORPHAN_ANCHOR" });
    await pool.query("UPDATE core.departments SET parent_department_id = $2 WHERE id = $1", [orphan.id, randomUUID()]);
    await expect(create({ name: "Blocked By Orphan", parent_id: orphan.id })).rejects.toMatchObject({ statusCode: 409 });
    await expect(update(randomUUID(), { name: "Missing", expected_version: 1 })).rejects.toMatchObject({ statusCode: 404 });

    const duplicateTarget = await create({ name: "Duplicate Target", code: "DUPLICATE_TARGET" });
    await expect(
      update(child.id, { department_code: duplicateTarget.department_code, expected_version: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const detached = await update(child.id, { parent_id: null, code: "DURABLE_CHILD_V2", expected_version: 1 });
    const withCostCenter = await update(detached.id, { cost_center: " CC-42 ", expected_version: 2 });
    expect(withCostCenter.cost_center).toBe("CC-42");
    const withoutCostCenter = await update(withCostCenter.id, { cost_center: "   ", expected_version: 3 });
    expect(withoutCostCenter.cost_center).toBeNull();

    const afterRejectedWrites = await pool.query<{ departments: string; events: string }>(
      `SELECT (SELECT count(*)::text FROM core.departments) AS departments,
              (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'department') AS events`,
    );
    expect(Number(afterRejectedWrites.rows[0]!.departments)).toBe(Number(beforeRejectedWrites.rows[0]!.departments) + 4);
    expect(Number(afterRejectedWrites.rows[0]!.events)).toBe(Number(beforeRejectedWrites.rows[0]!.events) + 7);
  });

  it("translates durable department constraint and OCC failures and preserves a newer snapshot", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const created = await persistence.createDepartmentForActor!(admin.user.id, {
      name: "Constraint Probe",
      department_code: "CONSTRAINT_PROBE",
    });

    await pool.query(`CREATE OR REPLACE FUNCTION public.test_admin_unique_violation() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE unique_violation USING MESSAGE = 'synthetic unique violation'; END $$`);
    try {
      await pool.query(`CREATE TRIGGER test_admin_department_insert_unique
        BEFORE INSERT ON core.departments FOR EACH ROW EXECUTE FUNCTION public.test_admin_unique_violation()`);
      await expect(
        persistence.createDepartmentForActor!(admin.user.id, { name: "Unique Failure", code: "UNIQUE_FAILURE" }),
      ).rejects.toMatchObject({ statusCode: 409 });
      await pool.query("DROP TRIGGER test_admin_department_insert_unique ON core.departments");

      await pool.query(`CREATE TRIGGER test_admin_department_update_unique
        BEFORE UPDATE ON core.departments FOR EACH ROW EXECUTE FUNCTION public.test_admin_unique_violation()`);
      await expect(
        persistence.updateDepartmentForActor!(admin.user.id, created.id, { name: "Unique Failure", expected_version: 1 }),
      ).rejects.toMatchObject({ statusCode: 409 });
      await pool.query("DROP TRIGGER test_admin_department_update_unique ON core.departments");
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS test_admin_department_insert_unique ON core.departments");
      await pool.query("DROP TRIGGER IF EXISTS test_admin_department_update_unique ON core.departments");
      await pool.query("DROP FUNCTION IF EXISTS public.test_admin_unique_violation()");
    }

    await pool.query(`CREATE OR REPLACE FUNCTION public.test_admin_skip_update() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
    try {
      await pool.query(`CREATE TRIGGER test_admin_department_skip_update
        BEFORE UPDATE ON core.departments FOR EACH ROW EXECUTE FUNCTION public.test_admin_skip_update()`);
      await expect(
        persistence.updateDepartmentForActor!(admin.user.id, created.id, { name: "Skipped", expected_version: 1 }),
      ).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS test_admin_department_skip_update ON core.departments");
      await pool.query("DROP FUNCTION IF EXISTS public.test_admin_skip_update()");
    }

    const snapshot = app.store.departments.find((department) => department.id === created.id)!;
    snapshot.version = 99;
    snapshot.name = "Newer Snapshot";
    const saved = await persistence.updateDepartmentForActor!(admin.user.id, created.id, {
      department_code: "CONSTRAINT_PROBE_V2",
      expected_version: 1,
    });
    expect(saved).toMatchObject({ department_code: "CONSTRAINT_PROBE_V2", version: 2 });
    expect(snapshot).toMatchObject({ name: "Newer Snapshot", version: 99 });
  });

  it("manages designation master data with OCC and duplicate-code protection", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const companyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1",
      [admin.user.id],
    )).rows[0]!.company_id;

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
      pool.query(
        "SELECT title, version FROM core.designations WHERE id = $1",
        [create.json().designation.id],
      ),
    ).resolves.toMatchObject({ rows: [{ title: "Principal Engineer", version: 1 }] });
    await expect(
      app.store.pgPool!.query(
        "SELECT event_type, payload->>'company_id' AS company_id FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
        [create.json().designation.id],
      ),
    ).resolves.toMatchObject({ rows: [{ event_type: "admin.master_data.designation.created", company_id: companyId }] });

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
    const durableEvents = await pool.query<{ event_type: string; company_id: string }>(
      "SELECT event_type, payload->>'company_id' AS company_id FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY id",
      [create.json().designation.id],
    );
    expect(durableEvents.rows).toEqual([
      { event_type: "admin.master_data.designation.created", company_id: companyId },
      { event_type: "admin.master_data.designation.updated", company_id: companyId },
      { event_type: "admin.master_data.designation.updated", company_id: companyId },
    ]);
  });

  it("rejects invalid durable designation changes and active references", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const beforeInvalid = await pool.query(
      `SELECT
         (SELECT count(*)::text FROM core.designations) AS designations,
         (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'designation') AS events`,
    );

    await expect(
      persistence.updateDesignationForActor!(admin.user.id, randomUUID(), { title: "Missing", expected_version: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      persistence.createDesignationForActor!(admin.user.id, { code: "MISSING_TITLE" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const afterInvalid = await pool.query(
      `SELECT
         (SELECT count(*)::text FROM core.designations) AS designations,
         (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'designation') AS events`,
    );
    expect(afterInvalid.rows).toEqual(beforeInvalid.rows);

    const nameOnly = await persistence.createDesignationForActor!(admin.user.id, { name: "Solutions Architect" });
    expect(nameOnly).toMatchObject({ designation_code: "SOLUTIONS_ARCHITECT", level: null, status: "active" });
    const beforeDeniedUpdates = await pool.query(
      `SELECT title, status, version,
              (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_id = $1) AS events
       FROM core.designations WHERE id = $1`,
      [nameOnly.id],
    );
    await expect(
      persistence.updateDesignationForActor!(admin.user.id, nameOnly.id, { title: "Stale", expected_version: 9 }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await pool.query("UPDATE core.users SET designation_id = $1 WHERE id = $2", [nameOnly.id, employee.user.id]);
    await expect(
      persistence.updateDesignationForActor!(admin.user.id, nameOnly.id, { status: "inactive", expected_version: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const afterDeniedUpdates = await pool.query(
      `SELECT title, status, version,
              (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_id = $1) AS events
       FROM core.designations WHERE id = $1`,
      [nameOnly.id],
    );
    expect(afterDeniedUpdates.rows).toEqual(beforeDeniedUpdates.rows);
  });

  it("translates durable designation constraint and OCC failures and preserves a newer snapshot", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const created = await persistence.createDesignationForActor!(admin.user.id, {
      title: "Designation Probe",
      designation_code: "DESIGNATION_PROBE",
    });

    await pool.query(`CREATE OR REPLACE FUNCTION public.test_admin_designation_unique() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE unique_violation USING MESSAGE = 'synthetic unique violation'; END $$`);
    try {
      await pool.query(`CREATE TRIGGER test_admin_designation_unique
        BEFORE UPDATE ON core.designations FOR EACH ROW EXECUTE FUNCTION public.test_admin_designation_unique()`);
      await expect(
        persistence.updateDesignationForActor!(admin.user.id, created.id, { title: "Unique Failure", expected_version: 1 }),
      ).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS test_admin_designation_unique ON core.designations");
      await pool.query("DROP FUNCTION IF EXISTS public.test_admin_designation_unique()");
    }

    await pool.query(`CREATE OR REPLACE FUNCTION public.test_admin_designation_skip() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
    try {
      await pool.query(`CREATE TRIGGER test_admin_designation_skip
        BEFORE UPDATE ON core.designations FOR EACH ROW EXECUTE FUNCTION public.test_admin_designation_skip()`);
      await expect(
        persistence.updateDesignationForActor!(admin.user.id, created.id, { title: "Skipped", expected_version: 1 }),
      ).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS test_admin_designation_skip ON core.designations");
      await pool.query("DROP FUNCTION IF EXISTS public.test_admin_designation_skip()");
    }

    const snapshot = app.store.designations.find((designation) => designation.id === created.id)!;
    snapshot.version = 99;
    snapshot.title = "Newer Snapshot";
    const saved = await persistence.updateDesignationForActor!(admin.user.id, created.id, {
      code: "DESIGNATION_PROBE_V2",
      expected_version: 1,
    });
    expect(saved).toMatchObject({ designation_code: "DESIGNATION_PROBE_V2", version: 2 });
    expect(snapshot).toMatchObject({ title: "Newer Snapshot", version: 99 });
  });

  it("rolls back every master-data business write when its outbox insert fails", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool!;
    const persistence = app.store.persistence!;
    const department = await persistence.createDepartmentForActor!(admin.user.id, {
      name: "Rollback Department",
      code: "ROLLBACK_DEPARTMENT",
    });
    const designation = await persistence.createDesignationForActor!(admin.user.id, {
      title: "Rollback Designation",
      code: "ROLLBACK_DESIGNATION",
    });

    await pool.query(`CREATE OR REPLACE FUNCTION public.test_admin_outbox_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.event_type LIKE 'admin.master_data.%' THEN
          RAISE EXCEPTION 'synthetic outbox failure';
        END IF;
        RETURN NEW;
      END $$`);
    await pool.query(`CREATE TRIGGER test_admin_outbox_failure
      BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION public.test_admin_outbox_failure()`);
    try {
      await expect(
        persistence.createDepartmentForActor!(admin.user.id, { name: "Rolled Back Create", code: "ROLLED_BACK_CREATE" }),
      ).rejects.toThrow("synthetic outbox failure");
      await expect(
        persistence.updateDepartmentForActor!(admin.user.id, department.id, { name: "Rolled Back Update", expected_version: 1 }),
      ).rejects.toThrow("synthetic outbox failure");
      await expect(
        persistence.createDesignationForActor!(admin.user.id, { title: "Rolled Back Designation Create", code: "ROLLED_BACK_DESIG_CREATE" }),
      ).rejects.toThrow("synthetic outbox failure");
      await expect(
        persistence.updateDesignationForActor!(admin.user.id, designation.id, { title: "Rolled Back Designation Update", expected_version: 1 }),
      ).rejects.toThrow("synthetic outbox failure");
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS test_admin_outbox_failure ON platform.outbox_events");
      await pool.query("DROP FUNCTION IF EXISTS public.test_admin_outbox_failure()");
    }

    await expect(
      pool.query("SELECT name, version FROM core.departments WHERE id = $1", [department.id]),
    ).resolves.toMatchObject({ rows: [{ name: "Rollback Department", version: 1 }] });
    await expect(
      pool.query("SELECT title, version FROM core.designations WHERE id = $1", [designation.id]),
    ).resolves.toMatchObject({ rows: [{ title: "Rollback Designation", version: 1 }] });
    await expect(
      pool.query(
        `SELECT
           (SELECT count(*)::text FROM core.departments WHERE department_code = 'ROLLED_BACK_CREATE') AS departments,
           (SELECT count(*)::text FROM core.designations WHERE designation_code = 'ROLLED_BACK_DESIG_CREATE') AS designations,
           (SELECT count(*)::text FROM platform.outbox_events
              WHERE aggregate_id = ANY($1::uuid[])) AS events`,
        [[department.id, designation.id]],
      ),
    ).resolves.toMatchObject({ rows: [{ departments: "0", designations: "0", events: "2" }] });
  });

  it("rolls back an explicit seed snapshot when a core write fails", async () => {
    const pool = app.store.pgPool!;
    const seedPersistence = app.store.persistence! as typeof app.store.persistence & {
      flushSeedSnapshot(): Promise<void>;
    };
    await pool.query(`CREATE OR REPLACE FUNCTION public.test_admin_seed_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic seed failure'; END $$`);
    await pool.query(`CREATE TRIGGER test_admin_seed_failure
      BEFORE UPDATE ON core.roles FOR EACH ROW EXECUTE FUNCTION public.test_admin_seed_failure()`);
    try {
      await expect(seedPersistence.flushSeedSnapshot()).rejects.toThrow("synthetic seed failure");
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS test_admin_seed_failure ON core.roles");
      await pool.query("DROP FUNCTION IF EXISTS public.test_admin_seed_failure()");
    }
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
