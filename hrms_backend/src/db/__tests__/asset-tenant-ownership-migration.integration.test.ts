import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_NAME_PATTERN = /(test|ci)/i;

function requiredTestDatabaseUrl(): URL {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required for asset migration tests");
  const url = new URL(value);
  if (!TEST_DATABASE_NAME_PATTERN.test(url.pathname)) {
    throw new Error("Asset migration tests require an isolated test database URL");
  }
  return url;
}

function migrationFiles(maximumId: number): string[] {
  return readdirSync("src/db/migrations")
    .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= maximumId)
    .sort();
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(readFileSync(`src/db/migrations/${filename}`, "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function withAssetWriter<T>(client: Client, action: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL hrms.asset_writer_v2 = 'on'");
    const result = await action();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

describe("asset tenant ownership migration", () => {
  const sourceUrl = requiredTestDatabaseUrl();
  const databaseName = `hrms_asset_tenant_test_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  const databaseUrl = new URL(sourceUrl);
  databaseUrl.pathname = `/${databaseName}`;
  let admin: Client;
  let client: Client;

  const companyA = randomUUID();
  const companyB = randomUUID();
  const assetId = randomUUID();
  const assignmentId = randomUUID();
  const requestId = randomUUID();
  const vendorId = randomUUID();

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    client = new Client({ connectionString: databaseUrl.toString() });
    await client.connect();
    for (const filename of migrationFiles(67)) await applyMigration(client, filename);

    await client.query("BEGIN");
    await client.query("SET LOCAL hrms.asset_writer_v2 = 'on'");
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Company A', $2, 'active'), ($3, 'Company B', $4, 'active')`,
      [companyA, `company-a-${companyA}`, companyB, `company-b-${companyB}`],
    );
    await client.query(
      `INSERT INTO assets.assets (id, asset_code, qr_hash, asset_type, name, status)
       VALUES ($1, 'ASSET-1', $2, 'Laptop', 'Legacy laptop', 'assigned')`,
      [assetId, `qr-${assetId}`],
    );
    await client.query(
      `INSERT INTO assets.asset_assignments (
         id, asset_id, assigned_to_user_id, assigned_by_user_id, status
       ) VALUES ($1, $2, $3, $4, 'active')`,
      [assignmentId, assetId, randomUUID(), randomUUID()],
    );
    await client.query(
      `INSERT INTO assets.asset_state_events (asset_id, event_type)
       VALUES ($1, 'assigned')`,
      [assetId],
    );
    await client.query(
      `INSERT INTO assets.software_vendors (id, name, status)
       VALUES ($1, 'Legacy Vendor', 'active')`,
      [vendorId],
    );
    await client.query(
      `INSERT INTO assets.asset_requests (
         id, request_code, requester_user_id, request_type, asset_type, asset_id,
         reason, priority, status
       ) VALUES ($1, 'REQ-1', $2, 'repair', 'Laptop', $3, 'Repair', 'medium', 'pending')`,
      [requestId, randomUUID(), assetId],
    );
    await client.query(
      `INSERT INTO assets.asset_acknowledgements (
         asset_id, employee_user_id, assignment_id, acknowledgement_type, status
       ) VALUES ($1, $2, $3, 'received', 'pending')`,
      [assetId, randomUUID(), assignmentId],
    );
    await client.query(
      `INSERT INTO assets.asset_maintenance_records (
         asset_id, maintenance_type, vendor_id, started_on, status
       ) VALUES ($1, 'repair', $2, '2026-11-14', 'scheduled')`,
      [assetId, vendorId],
    );
    await client.query(
      `INSERT INTO assets.asset_recovery_tickets (
         employee_user_id, asset_id, assignment_id, status
       ) VALUES ($1, $2, $3, 'open')`,
      [randomUUID(), assetId, assignmentId],
    );
    await client.query("COMMIT");
    await applyMigration(client, "0068_asset_tenant_ownership_map.sql");
  }, 30_000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    await admin?.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await admin?.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin?.end().catch(() => undefined);
  }, 60_000);

  it("fails closed until verified roots agree, then enforces immutable tenant ownership", async () => {
    await expect(
      applyMigration(client, "0069_asset_tenant_ownership.sql"),
    ).rejects.toMatchObject({ code: "23502" });

    await client.query(
      `INSERT INTO assets.asset_tenant_ownership_map (
         resource_type, resource_id, company_id, verification_note
       ) VALUES
         ('asset', $1, $2, 'verified asset owner'),
         ('request', $3, $4, 'intentionally conflicting request owner'),
         ('vendor', $5, $2, 'verified vendor owner')`,
      [assetId, companyA, requestId, companyB, vendorId],
    );
    await expect(
      applyMigration(client, "0069_asset_tenant_ownership.sql"),
    ).rejects.toMatchObject({ code: "23514" });

    await client.query(
      `UPDATE assets.asset_tenant_ownership_map
       SET company_id = $1, verification_note = 'corrected after source review'
       WHERE resource_type = 'request' AND resource_id = $2`,
      [companyA, requestId],
    );
    await applyMigration(client, "0069_asset_tenant_ownership.sql");

    const ownership = await client.query<{ table_name: string; company_id: string }>(
      `SELECT 'assets' AS table_name, company_id FROM assets.assets WHERE id = $1
       UNION ALL SELECT 'assignments', company_id FROM assets.asset_assignments WHERE id = $2
       UNION ALL SELECT 'requests', company_id FROM assets.asset_requests WHERE id = $3
       UNION ALL SELECT 'vendors', company_id FROM assets.software_vendors WHERE id = $4
       UNION ALL SELECT 'events', company_id FROM assets.asset_state_events WHERE asset_id = $1
       UNION ALL SELECT 'acknowledgements', company_id FROM assets.asset_acknowledgements WHERE asset_id = $1
       UNION ALL SELECT 'maintenance', company_id FROM assets.asset_maintenance_records WHERE asset_id = $1
       UNION ALL SELECT 'recovery', company_id FROM assets.asset_recovery_tickets WHERE asset_id = $1`,
      [assetId, assignmentId, requestId, vendorId],
    );
    expect(ownership.rows).toHaveLength(8);
    expect(new Set(ownership.rows.map((row) => row.company_id))).toEqual(
      new Set([companyA]),
    );
    const immutableEventTrigger = await client.query<{ tgenabled: string }>(
      `SELECT trigger.tgenabled
         FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'assets.asset_state_events'::regclass
          AND trigger.tgname = 'assets_state_events_immutable_trg'`,
    );
    expect(immutableEventTrigger.rows).toEqual([{ tgenabled: "O" }]);

    await expect(
      withAssetWriter(client, () =>
        client.query("UPDATE assets.assets SET company_id = $1 WHERE id = $2", [
          companyB,
          assetId,
        ]),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "assets_company_ownership_immutable",
    });

    const commandResultId = randomUUID();
    await withAssetWriter(client, () =>
      client.query(
        `INSERT INTO assets.asset_command_results (
           id, company_id, actor_user_id, action_key, idempotency_key,
           request_hash, response_status, response_body
         ) VALUES ($1, $2, $3, 'assets.test', $4, $5, 200, '{"ok":true}'::jsonb)`,
        [commandResultId, companyA, randomUUID(), randomUUID(), "a".repeat(64)],
      ),
    );
    await expect(
      withAssetWriter(client, () =>
        client.query(
          "UPDATE assets.asset_command_results SET company_id = $1 WHERE id = $2",
          [companyB, commandResultId],
        ),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "assets_company_ownership_immutable",
    });

    const companyBAsset = randomUUID();
    await withAssetWriter(client, () =>
      client.query(
        `INSERT INTO assets.assets (
           id, company_id, asset_code, qr_hash, asset_type, name, status
         ) VALUES ($1, $2, 'ASSET-1', $3, 'Laptop', 'Company B laptop', 'available')`,
        [companyBAsset, companyB, `qr-${companyBAsset}`],
      ),
    );
    await expect(
      withAssetWriter(client, () =>
        client.query(
          `INSERT INTO assets.assets (
             company_id, asset_code, qr_hash, asset_type, name, status
           ) VALUES ($1, 'ASSET-1', $2, 'Laptop', 'Duplicate', 'available')`,
          [companyA, `qr-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505", constraint: "assets_company_asset_code_uq" });

    await expect(
      withAssetWriter(client, () =>
        client.query(
          `INSERT INTO assets.asset_assignments (
             company_id, asset_id, assigned_to_user_id, assigned_by_user_id, status
           ) VALUES ($1, $2, $3, $4, 'active')`,
          [companyA, companyBAsset, randomUUID(), randomUUID()],
        ),
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "asset_assignments_company_asset_fkey",
    });

    await expect(
      client.query("DELETE FROM platform.company_profiles WHERE id = $1", [companyA]),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_company_profile_asset_reference",
    });

    const crossSchemaForeignKeys = await client.query(
      `SELECT 1
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_schema <> ccu.table_schema`,
    );
    expect(crossSchemaForeignKeys.rowCount).toBe(0);
  }, 30_000);
});
