import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildApp } from "../../../app.js";
import { buildRealApp } from "../../../__tests__/real-infra.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const holidayRlsRole = "hrms_holiday_rls_test";
const holidayBody = (name: string, expectedVersion?: number) => ({
  name, date: "2026-12-26", region: "A Region", optional: false,
  ...(expectedVersion === undefined ? {} : { expected_version: expectedVersion }),
});

describe("holiday tenant transaction boundary", () => {
  let app: FastifyInstance;
  let second: FastifyInstance | undefined;
  let pool: Pool;

  beforeEach(async () => {
    // A timed-out reset may continue in the background and collide with the
    // next migration. Give the disposable Docker fixture a bounded cold-start
    // window; the holiday command assertions retain their normal test timer.
    const setupStarted = Date.now();
    second = undefined;
    app = undefined as unknown as FastifyInstance;
    pool = undefined as unknown as Pool;
    app = await buildRealApp();
    await app.ready();
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    if (process.env.HRMS_HOLIDAY_SETUP_TIMING === "1") {
      console.info(`Holiday disposable fixture setup: ${Date.now() - setupStarted} ms`);
    }
  }, 120_000);

  afterEach(async () => {
    try {
      await second?.close();
      await pool?.end();
      await app?.close();
    } finally {
      second = undefined;
      pool = undefined as unknown as Pool;
      app = undefined as unknown as FastifyInstance;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  async function holiday(id: string) {
    const { rows } = await pool.query(
      "SELECT id, company_id, name, holiday_date::text AS holiday_date, version FROM leave_wfh.holidays WHERE id = $1",
      [id],
    );
    return rows[0] as { id: string; company_id: string; name: string; holiday_date: string; version: number } | undefined;
  }

  async function events(id: string) {
    const { rows } = await pool.query(
      "SELECT aggregate_id, idempotency_key, payload, status FROM platform.outbox_events WHERE aggregate_id = $1 AND event_type = 'holiday.upserted' ORDER BY id",
      [id],
    );
    return rows as Array<{ aggregate_id: string; idempotency_key: string; payload: Record<string, unknown>; status: string }>;
  }

  async function secondApp() {
    second = await buildApp({ dataStoreMode: "postgres", seedIfEmpty: false, rateLimit: false });
    await second.ready();
    return second;
  }

  it("denies a foreign UUID even when the first instance has not loaded that company, without SQL/outbox/memory effects", async () => {
    const admin = await loginAs(app, "ADM");
    const legacyConstraint = await pool.query(
      "SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_wfh.holidays'::regclass AND conname = 'holidays_region_holiday_date_name_key'",
    );
    expect(legacyConstraint.rowCount).toBe(0);
    const companyA = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)?.company_id;
    expect(companyA).toBeTruthy();
    const companyB = randomUUID();
    const foreignId = randomUUID();
    await pool.query(
      "INSERT INTO platform.company_profiles (id, company_name, company_slug, status) VALUES ($1, $2, $3, 'active')",
      [companyB, "Other Company", `other-${companyB}`],
    );
    await pool.query(
      "INSERT INTO leave_wfh.holidays (id, company_id, name, holiday_date, region, optional) VALUES ($1, $2, 'B Original', '2026-12-19', 'B Region', false)",
      [foreignId, companyB],
    );
    expect(app.store.holidays.some((row) => row.id === foreignId)).toBe(false);
    const before = await holiday(foreignId);

    for (const expectedVersion of [undefined, 1, 99]) {
      const denied = await app.inject({ method: "PUT", url: `/api/v1/holidays/${foreignId}`,
        headers: authHeader(admin.token), payload: holidayBody("A Collision", expectedVersion) });
      expect(denied.statusCode).toBe(404);
      expect(await holiday(foreignId)).toEqual(before);
      expect(await events(foreignId)).toEqual([]);
      expect(app.store.holidays.some((row) => row.id === foreignId)).toBe(false);
    }

    // A separate B account must retain its own holiday after A's denied ID
    // attempts. The fixture assigns its B preference and Admin role directly;
    // this does not exercise the product's transfer-approval workflow.
    const bAdminUser = app.store.users.find((user) => user.employee_code === "AUD")!;
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id = $2, active_role = $3 WHERE user_id = $1",
      [bAdminUser.id, companyB, Roles.Admin],
    );
    await pool.query("INSERT INTO core.user_roles (company_id, user_id, role_key, status, effective_from) VALUES ($1, $2, $3, 'active', CURRENT_DATE)", [companyB, bAdminUser.id, Roles.Admin]);

    const other = await secondApp();
    const adminOther = await loginAs(other, "ADM");
    const bAdmin = await loginAs(other, "AUD");
    const list = await other.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(adminOther.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().holidays.some((row: { id: string }) => row.id === foreignId)).toBe(false);
    expect((await holiday(foreignId))?.company_id).toBe(companyB);
    const bList = await other.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(bAdmin.token) });
    expect(bList.statusCode).toBe(200);
    expect(bList.json().holidays.find((row: { id: string }) => row.id === foreignId)).toMatchObject({ name: before?.name, version: before?.version });
    const bEdit = await other.inject({ method: "PUT", url: `/api/v1/holidays/${foreignId}`,
      headers: authHeader(bAdmin.token), payload: holidayBody("B Reviewed", before!.version) });
    expect(bEdit.statusCode).toBe(200);
    expect(await holiday(foreignId)).toMatchObject({ company_id: companyB, name: "B Reviewed", version: before!.version + 1 });
    expect(await events(foreignId)).toMatchObject([{ payload: { company_id: companyB, actor_user_id: bAdmin.user.id } }]);

    const ownId = randomUUID();
    const created = await app.inject({ method: "PUT", url: `/api/v1/holidays/${ownId}`,
      headers: authHeader(admin.token), payload: holidayBody("A Own") });
    expect(created.statusCode).toBe(200);
    expect(await holiday(ownId)).toMatchObject({ company_id: companyA, version: 1, name: "A Own" });
    expect(await events(ownId)).toMatchObject([{ payload: { company_id: companyA, actor_user_id: admin.user.id, holiday_id: ownId } }]);
    const sameIdRetry = await app.inject({ method: "PUT", url: `/api/v1/holidays/${ownId}`,
      headers: authHeader(admin.token), payload: holidayBody("A Own") });
    expect(sameIdRetry.statusCode).toBe(200);
    expect(sameIdRetry.json().version).toBe(1);
    expect(await events(ownId)).toHaveLength(1);
    const freshList = await other.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(adminOther.token) });
    expect(freshList.json().holidays.some((row: { id: string }) => row.id === ownId)).toBe(true);

    const hr = await loginAs(app, "E1");
    await pool.query("INSERT INTO core.user_roles (company_id, user_id, role_key, status, effective_from) VALUES ($1, $2, $3, 'active', CURRENT_DATE)", [companyA, hr.user.id, Roles.HRManager]);
    // The selected Employee role and the hydrated JWT can lag the newly
    // assigned HR role; the SQL command must use current effective assignments.
    const hrId = randomUUID();
    const hrCreated = await app.inject({ method: "PUT", url: `/api/v1/holidays/${hrId}`, headers: authHeader(hr.token), payload: holidayBody("HR Own") });
    expect(hrCreated.statusCode).toBe(200);
    expect(await holiday(hrId)).toMatchObject({ company_id: companyA, name: "HR Own" });

    // Reassignment takes effect in SQL even while this process and JWT still
    // carry the old A preference. A's historical holiday keeps A ownership.
    await pool.query("UPDATE platform.user_session_preferences SET company_id = $2 WHERE user_id = $1", [admin.user.id, companyB]);
    const transferred = await app.inject({ method: "PUT", url: `/api/v1/holidays/${ownId}`, headers: authHeader(admin.token), payload: holidayBody("Moved Actor", 1) });
    expect(transferred.statusCode).toBe(403);
    expect(await holiday(ownId)).toMatchObject({ company_id: companyA, name: "A Own", version: 1 });
    expect(await events(ownId)).toHaveLength(1);
    const afterTransfer = await app.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(admin.token) });
    expect(afterTransfer.statusCode).toBe(403);

    const ungrantedBId = randomUUID();
    const ungrantedB = await app.inject({ method: "PUT", url: `/api/v1/holidays/${ungrantedBId}`,
      headers: authHeader(admin.token), payload: holidayBody("No Carried Role") });
    expect(ungrantedB.statusCode).toBe(403);
    expect(await holiday(ungrantedBId)).toBeUndefined();
    expect(await events(ungrantedBId)).toEqual([]);

    // A transfer must explicitly grant the approved roles in the new company;
    // changing the company preference never carries A's Admin grant into B.
    await pool.query(
      "INSERT INTO core.user_roles (company_id, user_id, role_key, status, effective_from) VALUES ($1, $2, $3, 'active', CURRENT_DATE)",
      [companyB, admin.user.id, Roles.Admin],
    );
    const afterBGrant = await app.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(admin.token) });
    expect(afterBGrant.statusCode).toBe(200);
    expect(afterBGrant.json().holidays.some((row: { id: string }) => row.id === foreignId)).toBe(true);
    expect(afterBGrant.json().holidays.some((row: { id: string }) => row.id === ownId)).toBe(false);

    // The old global UNIQUE(region,date,name) must not reject a legitimate
    // same-label holiday in another company after holiday migration 0065.
    const bSameLabelId = randomUUID();
    const bSameLabel = await app.inject({ method: "PUT", url: `/api/v1/holidays/${bSameLabelId}`,
      headers: authHeader(admin.token), payload: holidayBody("A Own") });
    expect(bSameLabel.statusCode).toBe(200);
    expect(await holiday(bSameLabelId)).toMatchObject({ company_id: companyB, name: "A Own", version: 1 });
    expect(await events(bSameLabelId)).toMatchObject([{ payload: { company_id: companyB } }]);
    expect(await holiday(ownId)).toMatchObject({ company_id: companyA, name: "A Own", version: 1 });
  });

  it("uses current SQL roles, preserves supplied version checks, and rolls back a row update if its event cannot commit", async () => {
    const admin = await loginAs(app, "ADM");
    const companyA = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)?.company_id;
    expect(companyA).toBeTruthy();
    const missingEditId = randomUUID();
    const missingEdit = await app.inject({ method: "PUT", url: `/api/v1/holidays/${missingEditId}`,
      headers: authHeader(admin.token), payload: holidayBody("Missing Edit", 1) });
    expect(missingEdit.statusCode).toBe(404);
    expect(await holiday(missingEditId)).toBeUndefined();
    expect(await events(missingEditId)).toEqual([]);
    const protectedFieldId = randomUUID();
    const protectedField = await app.inject({ method: "PUT", url: `/api/v1/holidays/${protectedFieldId}`,
      headers: authHeader(admin.token), payload: { ...holidayBody("Protected Attempt"), company_id: randomUUID(), version: 99 } });
    expect(protectedField.statusCode).toBe(400);
    expect(await holiday(protectedFieldId)).toBeUndefined();
    expect(await events(protectedFieldId)).toEqual([]);
    const id = randomUUID();
    const first = await app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody("First") });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody("Stale", 99) });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().details).toMatchObject({ reason: "stale_version", id });
    expect((await holiday(id))?.name).toBe("First");
    expect(await events(id)).toHaveLength(1);

    const missingVersion = await app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody("Changed Without Version") });
    expect(missingVersion.statusCode).toBe(409);
    expect(missingVersion.json().details).toMatchObject({ reason: "missing_expected_version", id });
    expect((await holiday(id))?.version).toBe(1);
    expect(await events(id)).toHaveLength(1);

    const duplicateId = randomUUID();
    const duplicate = await app.inject({ method: "PUT", url: `/api/v1/holidays/${duplicateId}`, headers: authHeader(admin.token), payload: holidayBody("first") });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().details).toMatchObject({ reason: "duplicate_holiday", holiday_id: id });
    expect(await holiday(duplicateId)).toBeUndefined();
    expect(await events(duplicateId)).toEqual([]);

    // Force an outbox unique-key error after the holiday UPDATE has executed.
    await pool.query(
      `INSERT INTO platform.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ('test', $1, 'test.block', '{}'::jsonb, $2)`,
      [randomUUID(), `holiday.upserted:${id}:2`],
    );
    const failed = await app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody("Should Roll Back", 1) });
    expect(failed.statusCode).toBe(409);
    expect(failed.json().details).toEqual({ reason: "write_conflict" });
    expect(await holiday(id)).toMatchObject({ company_id: companyA, name: "First", version: 1 });
    expect(await events(id)).toHaveLength(1);
    expect(app.store.holidays.find((row) => row.id === id)).toMatchObject({ name: "First", version: 1 });

    // The selected UI role can be Employee while an effective Admin role is assigned.
    await pool.query("INSERT INTO core.user_roles (company_id, user_id, role_key, status, effective_from) VALUES ($1, $2, $3, 'active', CURRENT_DATE)", [companyA, admin.user.id, Roles.Employee]);
    await pool.query("UPDATE platform.user_session_preferences SET active_role = $2 WHERE user_id = $1", [admin.user.id, Roles.Employee]);
    const allowed = await app.inject({ method: "PUT", url: `/api/v1/holidays/${randomUUID()}`, headers: authHeader(admin.token), payload: holidayBody("Role Union") });
    expect(allowed.statusCode).toBe(200);
    await pool.query("UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2", [admin.user.id, Roles.Admin]);
    const deniedId = randomUUID();
    const denied = await app.inject({ method: "PUT", url: `/api/v1/holidays/${deniedId}`, headers: authHeader(admin.token), payload: holidayBody("Revoked Role") });
    expect(denied.statusCode).toBe(403);
    expect(await holiday(deniedId)).toBeUndefined();
    expect(await events(deniedId)).toEqual([]);
    const other = await secondApp();
    const freshRead = await other.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(admin.token) });
    expect(freshRead.statusCode).toBe(200);
    expect(freshRead.json().holidays.some((row: { id: string }) => row.id === deniedId)).toBe(false);

    await pool.query("UPDATE core.user_roles SET status = 'active' WHERE user_id = $1 AND role_key = $2", [admin.user.id, Roles.Admin]);
    await pool.query("UPDATE platform.company_profiles SET status = 'inactive' WHERE id = $1", [companyA]);
    const inactiveCompanyId = randomUUID();
    const inactiveCompany = await app.inject({ method: "PUT", url: `/api/v1/holidays/${inactiveCompanyId}`,
      headers: authHeader(admin.token), payload: holidayBody("Inactive Company") });
    expect(inactiveCompany.statusCode).toBe(400);
    expect(await holiday(inactiveCompanyId)).toBeUndefined();
    expect(await events(inactiveCompanyId)).toEqual([]);

    await pool.query("UPDATE platform.company_profiles SET status = 'active' WHERE id = $1", [companyA]);
    await pool.query("UPDATE core.users SET employment_status = 'suspended' WHERE id = $1", [admin.user.id]);
    const suspendedUserId = randomUUID();
    const suspendedUser = await app.inject({ method: "PUT", url: `/api/v1/holidays/${suspendedUserId}`,
      headers: authHeader(admin.token), payload: holidayBody("Suspended User") });
    expect(suspendedUser.statusCode).toBe(401);
    expect(await holiday(suspendedUserId)).toBeUndefined();
    expect(await events(suspendedUserId)).toEqual([]);
  });

  it("serializes competing same-company edits and a stale instance full flush cannot revert the committed holiday", async () => {
    const admin = await loginAs(app, "ADM");
    const id = randomUUID();
    const created = await app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody("Original") });
    expect(created.statusCode).toBe(200);
    const other = await secondApp();
    const adminOther = await loginAs(other, "ADM");

    const [left, right] = await Promise.all([
      app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody("Changed One", 1) }),
      other.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(adminOther.token), payload: holidayBody("Changed Two", 1) }),
    ]);
    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 409]);
    const persisted = await holiday(id);
    expect(persisted).toMatchObject({ version: 2 });
    const committedEvents = await events(id);
    expect(committedEvents).toHaveLength(2);
    expect(committedEvents.map((event) => event.idempotency_key)).toEqual([`holiday.upserted:${id}:1`, `holiday.upserted:${id}:2`]);
    expect(committedEvents.every((event) => ["pending", "published"].includes(event.status))).toBe(true);
    const retry = await app.inject({ method: "PUT", url: `/api/v1/holidays/${id}`, headers: authHeader(admin.token), payload: holidayBody(persisted!.name) });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().version).toBe(2);
    expect(await events(id)).toHaveLength(2);
    await other.store.persistence?.flush();
    expect(await holiday(id)).toEqual(persisted);
    const refreshed = await app.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(admin.token) });
    expect(refreshed.json().holidays.find((row: { id: string }) => row.id === id)).toMatchObject({ version: 2, name: persisted?.name });
    await other.close();
    second = await buildApp({ dataStoreMode: "postgres", seedIfEmpty: false, rateLimit: false });
    await second.ready();
    const afterRestart = await second.inject({ method: "GET", url: "/api/v1/holidays?year=2026&page=1&page_size=25", headers: authHeader(adminOther.token) });
    expect(afterRestart.json().holidays.find((row: { id: string }) => row.id === id)).toMatchObject({ version: 2, name: persisted?.name });
  });

  it("serializes case-insensitive duplicate creates across two API instances", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)?.company_id;
    const other = await secondApp();
    const adminOther = await loginAs(other, "ADM");
    const firstId = randomUUID();
    const secondId = randomUUID();
    const [first, secondResponse] = await Promise.all([
      app.inject({ method: "PUT", url: `/api/v1/holidays/${firstId}`, headers: authHeader(admin.token), payload: holidayBody("Race Day") }),
      other.inject({ method: "PUT", url: `/api/v1/holidays/${secondId}`, headers: authHeader(adminOther.token), payload: holidayBody("race day") }),
    ]);
    expect([first.statusCode, secondResponse.statusCode].sort()).toEqual([200, 409]);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM leave_wfh.holidays WHERE company_id = $1 AND region = 'A Region'
         AND holiday_date = '2026-12-26' AND lower(name) = 'race day' AND deleted_at IS NULL`,
      [companyId],
    );
    expect(rows).toHaveLength(1);
    expect([...await events(firstId), ...await events(secondId)]).toHaveLength(1);
    expect([firstId, secondId]).toContain(rows[0]!.id);
  });

  it("enforces company isolation for direct SQL through a restricted runtime role", async () => {
    const admin = await loginAs(app, "ADM");
    const companyA = app.store.userSessionPreferences.find((row) => row.user_id === admin.user.id)?.company_id;
    expect(companyA).toBeTruthy();
    const companyB = randomUUID();
    const holidayA = randomUUID();
    const holidayB = randomUUID();
    const blocked = randomUUID();
    await pool.query(
      "INSERT INTO platform.company_profiles (id, company_name, company_slug, status) VALUES ($1, 'Holiday RLS B', $2, 'active')",
      [companyB, `holiday-rls-${companyB}`],
    );
    await pool.query(
      `INSERT INTO leave_wfh.holidays (id, company_id, name, holiday_date, region, optional)
       VALUES ($1, $2, 'Tenant A Day', '2026-12-28', 'RLS', false),
              ($3, $4, 'Tenant B Day', '2026-12-28', 'RLS', false)`,
      [holidayA, companyA, holidayB, companyB],
    );

    await dropHolidayRlsRole();
    await pool.query(
      `CREATE ROLE ${holidayRlsRole}
         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await pool.query(`GRANT ${holidayRlsRole} TO CURRENT_USER`);
    await pool.query(`GRANT USAGE ON SCHEMA leave_wfh TO ${holidayRlsRole}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON leave_wfh.holidays TO ${holidayRlsRole}`,
    );

    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${holidayRlsRole}`);

      await client.query("BEGIN");
      expect((await client.query("SELECT id FROM leave_wfh.holidays")).rows).toEqual([]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyA]);
      const visible = await client.query<{ id: string; company_id: string }>(
        "SELECT id, company_id FROM leave_wfh.holidays ORDER BY id",
      );
      expect(visible.rows.some((row) => row.id === holidayA)).toBe(true);
      expect(visible.rows.some((row) => row.id === holidayB)).toBe(false);
      expect(visible.rows.every((row) => row.company_id === companyA)).toBe(true);
      await expect(
        client.query(
          `INSERT INTO leave_wfh.holidays (id, company_id, name, holiday_date, region, optional)
           VALUES ($1, $2, 'Blocked B Day', '2026-12-29', 'RLS', false)`,
          [blocked, companyB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyA]);
      await expect(
        client.query("UPDATE leave_wfh.holidays SET company_id = $2 WHERE id = $1", [holidayA, companyB]),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } finally {
      await client.query("RESET ROLE").catch(() => undefined);
      client.release();
      await dropHolidayRlsRole();
    }

    expect(await holiday(holidayA)).toMatchObject({ company_id: companyA, name: "Tenant A Day" });
    expect(await holiday(holidayB)).toMatchObject({ company_id: companyB, name: "Tenant B Day" });
    expect(await holiday(blocked)).toBeUndefined();
  });

  async function dropHolidayRlsRole(): Promise<void> {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${holidayRlsRole}') THEN
          REVOKE SELECT, INSERT, UPDATE, DELETE ON leave_wfh.holidays FROM ${holidayRlsRole};
          REVOKE USAGE ON SCHEMA leave_wfh FROM ${holidayRlsRole};
          REVOKE ${holidayRlsRole} FROM CURRENT_USER;
          DROP ROLE ${holidayRlsRole};
        END IF;
      END
      $$;
    `);
  }
});
