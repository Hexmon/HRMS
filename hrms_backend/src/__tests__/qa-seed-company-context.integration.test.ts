import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureQaAdminCompanyContext } from "../../scripts/qa-seed-safety.js";
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
       VALUES ($1, $2, 'admin', $3)`,
      [randomUUID(), adminUserId, foreignCompanyId],
    );

    await expect(runSeedContextWithMarker()).rejects.toThrow(
      /does not exactly match the deterministic QA company/,
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
        /company slug that does not exactly match/,
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
});
