import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Roles } from "#shared";
import {
  ensureQaAdminCompanyContext,
  ensureQaPersonaCompanyContexts,
  preflightQaAdminCompanyContext,
} from "../../scripts/qa-seed-safety.js";
import {
  ensureReleaseBuiltinRoles,
  verifyReleasePersonaIdentity,
} from "../../scripts/release-seed-support.js";
import { resetPostgresDatabase } from "../platform/postgres-data-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const companySlug = "hawkaii-hrms";

describe.skipIf(!databaseUrl)("QA seed deterministic company boundary", () => {
  let client: Client;
  let adminUserId: string;
  let expectedCompanyId: string;
  let preferenceId: string;

  beforeEach(async () => {
    await resetPostgresDatabase(databaseUrl!);
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    adminUserId = randomUUID();
    expectedCompanyId = randomUUID();
    preferenceId = randomUUID();
    await client.query(
      `INSERT INTO core.users (
         id, employee_code, email, full_name, hierarchy_path, employment_status
       )
       VALUES ($1, 'ADM', 'qa-admin@example.test', 'QA Admin', 'CEO.ADM'::ltree, 'active')`,
      [adminUserId],
    );
  }, 120_000);

  afterEach(async () => {
    await client?.query("ROLLBACK").catch(() => undefined);
    await client?.end();
  });

  async function runSeedContextWithMarker() {
    await client.query("BEGIN");
    try {
      await preflightQaAdminCompanyContext(client, {
        adminUserId,
        companyId: expectedCompanyId,
        preferenceId,
      });
      await client.query(
        `INSERT INTO core.designations (id, designation_code, title, level, status)
         VALUES ($1, 'QA_SEED_MARKER', 'QA Seed Marker', 1, 'active')`,
        [randomUUID()],
      );
      const companyId = await ensureQaAdminCompanyContext(client, {
        adminUserId,
        companyId: expectedCompanyId,
        preferenceId,
      });
      await client.query("COMMIT");
      return companyId;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async function markerCount(): Promise<number> {
    const result = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM core.designations WHERE designation_code = 'QA_SEED_MARKER'",
    );
    return result.rows[0]?.count ?? -1;
  }

  it("refuses a foreign active Admin preference and rolls back all attempted seed rows", async () => {
    const foreignCompanyId = randomUUID();
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Foreign Company', 'foreign-company', 'active')`,
      [foreignCompanyId],
    );
    await client.query(
      `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), adminUserId, Roles.Admin, foreignCompanyId],
    );

    await expect(runSeedContextWithMarker()).rejects.toThrow(
      /non-admin or foreign deterministic release Admin|does not exactly match the deterministic QA company/,
    );
    expect(await markerCount()).toBe(0);
    const companies = await client.query<{ id: string; company_slug: string; status: string }>(
      "SELECT id, company_slug, status FROM platform.company_profiles ORDER BY id",
    );
    expect(companies.rows).toEqual([{ id: foreignCompanyId, company_slug: "foreign-company", status: "active" }]);
    const preferences = await client.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1",
      [adminUserId],
    );
    expect(preferences.rows).toEqual([{ company_id: foreignCompanyId }]);
  });

  it.each(["active", "inactive"])(
    "refuses a %s same-slug foreign UUID without reactivation or rebinding",
    async (status) => {
      const foreignCompanyId = randomUUID();
      await client.query(
        `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
         VALUES ($1, 'Foreign Same Slug', $2, $3)`,
        [foreignCompanyId, companySlug, status],
      );

      await expect(runSeedContextWithMarker()).rejects.toThrow(
        /company (slug|identity) that does not exactly match/,
      );
      expect(await markerCount()).toBe(0);
      const company = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM platform.company_profiles WHERE company_slug = $1",
        [companySlug],
      );
      expect(company.rows).toEqual([{ id: foreignCompanyId, status }]);
      const preferences = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM platform.user_session_preferences WHERE user_id = $1",
        [adminUserId],
      );
      expect(preferences.rows[0]?.count).toBe(0);
    },
  );

  it.each(["active", "inactive"])(
    "refuses a %s foreign slug occupying the deterministic UUID before any marker write",
    async (status) => {
      await client.query(
        `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
         VALUES ($1, 'Foreign UUID Company', $2, $3)`,
        [expectedCompanyId, `foreign-uuid-${status}`, status],
      );

      await expect(runSeedContextWithMarker()).rejects.toThrow(/company identity/);
      expect(await markerCount()).toBe(0);
      const company = await client.query<{ id: string; company_slug: string; status: string }>(
        "SELECT id, company_slug, status FROM platform.company_profiles WHERE id = $1",
        [expectedCompanyId],
      );
      expect(company.rows).toEqual([{ id: expectedCompanyId, company_slug: `foreign-uuid-${status}`, status }]);
    },
  );

  it("refuses an Admin preference referencing a foreign slug at the deterministic UUID before any marker write", async () => {
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Foreign UUID Company', 'foreign-uuid-admin', 'active')`,
      [expectedCompanyId],
    );
    await client.query(
      `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
       VALUES ($1, $2, $3, $4)`,
      [preferenceId, adminUserId, Roles.Admin, expectedCompanyId],
    );

    await expect(runSeedContextWithMarker()).rejects.toThrow(/company identity/);
    expect(await markerCount()).toBe(0);
    const preference = await client.query<{ company_id: string; active_role: string }>(
      "SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1",
      [adminUserId],
    );
    expect(preference.rows).toEqual([{ company_id: expectedCompanyId, active_role: Roles.Admin }]);
  });

  it.each([Roles.Admin, "employee"])(
    "refuses an existing null-company preference with role %s before any marker write",
    async (role) => {
      await client.query(
        `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
         VALUES ($1, $2, $3, NULL)`,
        [preferenceId, adminUserId, role],
      );

      await expect(runSeedContextWithMarker()).rejects.toThrow(/non-admin or foreign|exactly match/);
      expect(await markerCount()).toBe(0);
      const preference = await client.query<{ company_id: string | null; active_role: string | null }>(
        "SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1",
        [adminUserId],
      );
      expect(preference.rows).toEqual([{ company_id: null, active_role: role }]);
    },
  );

  it("creates the exact deterministic context once and performs no writes on rerun", async () => {
    await expect(runSeedContextWithMarker()).resolves.toBe(expectedCompanyId);
    const first = await client.query<{
      id: string;
      status: string;
      version: number;
      updated_at: Date;
      preference_version: number;
      preference_updated_at: Date;
    }>(
      `SELECT company.id, company.status, company.version, company.updated_at,
              preference.version AS preference_version,
              preference.updated_at AS preference_updated_at
       FROM platform.company_profiles company
       JOIN platform.user_session_preferences preference ON preference.company_id = company.id
       WHERE company.id = $1 AND company.company_slug = $2 AND preference.user_id = $3`,
      [expectedCompanyId, companySlug, adminUserId],
    );
    expect(first.rows).toHaveLength(1);

    await client.query("BEGIN");
    await expect(ensureQaAdminCompanyContext(client, {
      adminUserId,
      companyId: expectedCompanyId,
      preferenceId,
    })).resolves.toBe(expectedCompanyId);
    await client.query("COMMIT");

    const second = await client.query(
      `SELECT company.id, company.status, company.version, company.updated_at,
              preference.version AS preference_version,
              preference.updated_at AS preference_updated_at
       FROM platform.company_profiles company
       JOIN platform.user_session_preferences preference ON preference.company_id = company.id
       WHERE company.id = $1 AND company.company_slug = $2 AND preference.user_id = $3`,
      [expectedCompanyId, companySlug, adminUserId],
    );
    expect(second.rows).toEqual(first.rows);
    expect(await markerCount()).toBe(1);
  });

  it("seeds builtin role authority and binds active release personas without rewriting a rerun", async () => {
    const employeeUserId = randomUUID();
    const employeePreferenceId = randomUUID();
    await ensureReleaseBuiltinRoles(client);
    await client.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, $3, 'active', CURRENT_DATE),
              ($4, $5, $6, 'active', CURRENT_DATE)`,
      [
        randomUUID(),
        adminUserId,
        Roles.Admin,
        randomUUID(),
        employeeUserId,
        Roles.Employee,
      ],
    );
    await client.query(
      `INSERT INTO core.users (
         id, employee_code, email, full_name, hierarchy_path, employment_status
       ) VALUES ($1, 'E-QA', 'qa-employee@example.test', 'QA Employee', 'CEO.EQA'::ltree, 'active')`,
      [employeeUserId],
    );
    const companyId = await ensureQaAdminCompanyContext(client, {
      adminUserId,
      companyId: expectedCompanyId,
      preferenceId,
    });
    const contexts = [
      {
        userId: adminUserId,
        preferenceId,
        activeRole: Roles.Admin,
        employeeCode: "ADM",
        email: "qa-admin@example.test",
      },
      {
        userId: employeeUserId,
        preferenceId: employeePreferenceId,
        activeRole: Roles.Employee,
        employeeCode: "E-QA",
        email: "qa-employee@example.test",
      },
    ];

    await ensureQaPersonaCompanyContexts(client, companyId, contexts);
    const first = await client.query(
      `SELECT id, user_id, company_id, active_role, version, updated_at
         FROM platform.user_session_preferences
        WHERE user_id = ANY($1::uuid[])
        ORDER BY user_id`,
      [[adminUserId, employeeUserId]],
    );
    expect(first.rows).toHaveLength(2);

    await ensureReleaseBuiltinRoles(client);
    await ensureQaPersonaCompanyContexts(client, companyId, contexts);
    const second = await client.query(
      `SELECT id, user_id, company_id, active_role, version, updated_at
         FROM platform.user_session_preferences
        WHERE user_id = ANY($1::uuid[])
        ORDER BY user_id`,
      [[adminUserId, employeeUserId]],
    );
    expect(second.rows).toEqual(first.rows);
    const roles = await client.query<{ role_key: string }>(
      "SELECT role_key FROM core.roles WHERE status = 'active' AND deleted_at IS NULL ORDER BY role_key",
    );
    expect(roles.rows.map((row) => row.role_key)).toEqual(
      [...Object.values(Roles)].sort(),
    );
  });

  it("rejects a foreign persona preference before adding any missing company context", async () => {
    const employeeUserId = randomUUID();
    const foreignCompanyId = randomUUID();
    await ensureReleaseBuiltinRoles(client);
    await client.query(
      `INSERT INTO core.users (
         id, employee_code, email, full_name, hierarchy_path, employment_status
       ) VALUES ($1, 'E-FOREIGN', 'foreign-employee@example.test', 'Foreign Employee', 'CEO.EFOREIGN'::ltree, 'active')`,
      [employeeUserId],
    );
    await client.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, $3, 'active', CURRENT_DATE),
              ($4, $5, $6, 'active', CURRENT_DATE)`,
      [
        randomUUID(),
        adminUserId,
        Roles.Admin,
        randomUUID(),
        employeeUserId,
        Roles.Employee,
      ],
    );
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Foreign Persona Company', 'foreign-persona-company', 'active')`,
      [foreignCompanyId],
    );
    await client.query(
      `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), employeeUserId, Roles.Employee, foreignCompanyId],
    );
    const companyId = await ensureQaAdminCompanyContext(client, {
      adminUserId,
      companyId: expectedCompanyId,
      preferenceId,
    });

    await expect(
      ensureQaPersonaCompanyContexts(client, companyId, [
        {
          userId: adminUserId,
          preferenceId,
          activeRole: Roles.Admin,
          employeeCode: "ADM",
          email: "qa-admin@example.test",
        },
        {
          userId: employeeUserId,
          preferenceId: randomUUID(),
          activeRole: Roles.Employee,
          employeeCode: "E-FOREIGN",
          email: "foreign-employee@example.test",
        },
      ]),
    ).rejects.toThrow(
      /persona preference identity, company, or role collision/,
    );
    const adminPreference = await client.query(
      "SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1",
      [adminUserId],
    );
    expect(adminPreference.rows).toEqual([
      { company_id: expectedCompanyId, active_role: Roles.Admin },
    ]);
    const employeePreference = await client.query(
      "SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1",
      [employeeUserId],
    );
    expect(employeePreference.rows).toEqual([
      { company_id: foreignCompanyId, active_role: Roles.Employee },
    ]);
  });

  it.each([
    ["same employee code", () => randomUUID(), "ADM", "qa-admin@example.test"],
    ["same user ID with foreign email", () => adminUserId, "ADM", "foreign@example.test"],
  ])(
    "rolls back role authority and leaves no dependent state for a %s collision",
    async (_label, expectedId, employeeCode, email) => {
      await client.query("BEGIN");
      try {
        await ensureReleaseBuiltinRoles(client);
        await verifyReleasePersonaIdentity(client, {
          userId: expectedId(),
          employeeCode,
          email,
        });
        throw new Error("expected identity collision");
      } catch (error) {
        await client.query("ROLLBACK");
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/identity collision for ADM/);
      }

      const state = await client.query<{
        roles: number;
        credentials: number;
        preferences: number;
        companies: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM core.roles) AS roles,
           (SELECT count(*)::int FROM platform.user_credentials) AS credentials,
           (SELECT count(*)::int FROM platform.user_session_preferences) AS preferences,
           (SELECT count(*)::int FROM platform.company_profiles) AS companies`,
      );
      expect(state.rows).toEqual([
        { roles: 0, credentials: 0, preferences: 0, companies: 0 },
      ]);
    },
  );

  it("rolls back inserted builtin roles when an inactive authorization role collides", async () => {
    await client.query(
      `INSERT INTO core.roles (role_key, name, status, builtin)
       VALUES ($1, 'Disabled Admin', 'inactive', true)`,
      [Roles.Admin],
    );
    await client.query("BEGIN");
    try {
      await ensureReleaseBuiltinRoles(client);
      throw new Error("expected role collision");
    } catch (error) {
      await client.query("ROLLBACK");
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/role collision/);
    }
    const roles = await client.query(
      "SELECT role_key, name, status, builtin, deleted_at FROM core.roles ORDER BY role_key",
    );
    expect(roles.rows).toEqual([
      {
        role_key: Roles.Admin,
        name: "Disabled Admin",
        status: "inactive",
        builtin: true,
        deleted_at: null,
      },
    ]);
  });

  it("rejects an inactive company before creating a persona preference", async () => {
    await ensureReleaseBuiltinRoles(client);
    await client.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, $3, 'active', CURRENT_DATE)`,
      [randomUUID(), adminUserId, Roles.Admin],
    );
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Inactive Company', 'inactive-company', 'inactive')`,
      [expectedCompanyId],
    );
    await client.query("BEGIN");
    await expect(
      ensureQaPersonaCompanyContexts(client, expectedCompanyId, [
        {
          userId: adminUserId,
          preferenceId,
          activeRole: Roles.Admin,
          employeeCode: "ADM",
          email: "qa-admin@example.test",
        },
      ]),
    ).rejects.toThrow(/missing or inactive persona company context/);
    await client.query("ROLLBACK");
    const preferences = await client.query(
      "SELECT id FROM platform.user_session_preferences WHERE user_id = $1",
      [adminUserId],
    );
    expect(preferences.rows).toEqual([]);
  });

  it("holds the active company boundary against concurrent deactivation", async () => {
    await ensureReleaseBuiltinRoles(client);
    await client.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, $3, 'active', CURRENT_DATE)`,
      [randomUUID(), adminUserId, Roles.Admin],
    );
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Locked Company', 'locked-company', 'active')`,
      [expectedCompanyId],
    );
    await client.query("BEGIN");
    await ensureQaPersonaCompanyContexts(client, expectedCompanyId, [
      {
        userId: adminUserId,
        preferenceId,
        activeRole: Roles.Admin,
        employeeCode: "ADM",
        email: "qa-admin@example.test",
      },
    ]);

    const concurrent = new Client({ connectionString: databaseUrl });
    await concurrent.connect();
    try {
      await concurrent.query("SET lock_timeout = '250ms'");
      await expect(
        concurrent.query(
          "UPDATE platform.company_profiles SET status = 'inactive' WHERE id = $1",
          [expectedCompanyId],
        ),
      ).rejects.toMatchObject({ code: "55P03" });
    } finally {
      await concurrent.end();
      await client.query("ROLLBACK");
    }
    const company = await client.query(
      "SELECT status FROM platform.company_profiles WHERE id = $1",
      [expectedCompanyId],
    );
    expect(company.rows).toEqual([{ status: "active" }]);
  });

  it.each([
    ["inactive", false, "inactive", null],
    ["soft-deleted", true, "active", null],
    ["non-admin role", false, "active", "employee"],
  ])("refuses an %s deterministic Admin context before any marker write", async (_label, deleted, status, role) => {
    const companyId = expectedCompanyId;
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Expected Company', $2, 'active')`,
      [companyId, companySlug],
    );
    await client.query("UPDATE core.users SET employment_status = $1, deleted_at = $2 WHERE id = $3", [status, deleted ? new Date() : null, adminUserId]);
    await client.query(
      `INSERT INTO platform.user_session_preferences (id, user_id, active_role, company_id)
       VALUES ($1, $2, $3, $4)`,
      [preferenceId, adminUserId, role ?? Roles.Admin, companyId],
    );

    await expect(runSeedContextWithMarker()).rejects.toThrow();
    expect(await markerCount()).toBe(0);
    const state = await client.query<{ employment_status: string; deleted_at: Date | null; active_role: string; company_id: string }>(
      `SELECT u.employment_status, u.deleted_at, p.active_role, p.company_id
       FROM core.users u JOIN platform.user_session_preferences p ON p.user_id = u.id WHERE u.id = $1`,
      [adminUserId],
    );
    expect(state.rows[0]?.employment_status).toBe(status);
    expect(state.rows[0]?.active_role).toBe(role ?? Roles.Admin);
    expect(state.rows[0]?.company_id).toBe(companyId);
  });
});
