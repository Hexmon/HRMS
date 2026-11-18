import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPendingMigrations,
  checksumSql,
  discoverMigrations,
  ensureMigrationLedger,
  loadAppliedMigrations,
  validateMigrationPlan,
  type AppliedMigration,
  type MigrationFile,
} from "../../../scripts/db-migration-lib.js";

const TEST_DATABASE_NAME_PATTERN = /(?:^|[_-])test(?:$|[_-])/iu;
const TARGET_DATABASE_NAME = `hrms_migration_runner_test_${process.pid}_${randomBytes(8).toString("hex")}`;

type IsolatedDatabaseTarget = {
  source: URL;
  target: URL;
  targetDatabaseName: string;
};

function databaseName(url: URL, label: string): string {
  try {
    return decodeURIComponent(url.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error(`${label} contains an invalid encoded database name`);
  }
}

function canonicalDatabaseIdentity(url: URL, label: string): string {
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${label} is not an unambiguous PostgreSQL URL`);
  }
  const name = databaseName(url, label);
  if (name === "" || name.includes("/")) {
    throw new Error(`${label} has an invalid database name`);
  }
  const hostname = ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ? "loopback"
    : url.hostname.toLowerCase();
  return `${hostname}:${url.port || "5432"}/${name}`;
}

function quotedTargetDatabaseName(targetDatabaseName: string): string {
  if (!/^hrms_migration_runner_test_[0-9]+_[a-f0-9]{16}$/u.test(targetDatabaseName)) {
    throw new Error("Refusing unsafe migration target database name");
  }
  return `"${targetDatabaseName}"`;
}

async function createFreshTargetDatabase(
  adminClient: Client,
  targetDatabaseName: string,
): Promise<void> {
  await adminClient.query(
    `CREATE DATABASE ${quotedTargetDatabaseName(targetDatabaseName)}`,
  );
}

function requireIsolatedDatabaseSource(
  environment: NodeJS.ProcessEnv = process.env,
  targetDatabaseName = TARGET_DATABASE_NAME,
): IsolatedDatabaseTarget {
  const value = environment.TEST_DATABASE_URL;
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for migration runner integration tests");
  }
  let source: URL;
  try {
    source = new URL(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TEST_DATABASE_URL is invalid: ${message}`);
  }

  const sourceDatabaseName = databaseName(source, "TEST_DATABASE_URL");
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(source.hostname) ||
    source.search !== "" ||
    source.hash !== "" ||
    sourceDatabaseName.includes("/") ||
    !TEST_DATABASE_NAME_PATTERN.test(sourceDatabaseName) ||
    !/^hrms_migration_runner_test_[0-9]+_[a-f0-9]{16}$/u.test(targetDatabaseName)
  ) {
    throw new Error("Refusing non-disposable TEST_DATABASE_URL");
  }

  const target = new URL(source.toString());
  target.pathname = `/${targetDatabaseName}`;
  const sourceIdentity = canonicalDatabaseIdentity(source, "TEST_DATABASE_URL");
  const targetIdentity = canonicalDatabaseIdentity(target, "derived migration target");
  if (sourceIdentity === targetIdentity) {
    throw new Error("Derived migration target must not equal TEST_DATABASE_URL");
  }

  const configuredDatabaseUrl = environment.DATABASE_URL;
  if (configuredDatabaseUrl) {
    try {
      const configuredIdentity = canonicalDatabaseIdentity(
        new URL(configuredDatabaseUrl),
        "DATABASE_URL",
      );
      if (
        configuredIdentity === sourceIdentity ||
        configuredIdentity === targetIdentity
      ) {
        throw new Error("Disposable migration databases must not equal DATABASE_URL");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("must not equal DATABASE_URL")
      ) {
        throw error;
      }
      throw new Error("DATABASE_URL is invalid; refusing destructive integration setup");
    }
  }

  return { source, target, targetDatabaseName };
}

describe("migration runner destructive target guard", () => {
  it.each([
    "postgresql://local:sample@neon.tech/hrms_ci_test",
    "postgresql://local:sample@127.0.0.1/contest_prod",
    "postgresql://local:sample@127.0.0.1/hrms_test?host=neon.tech",
    "postgresql://local:sample@127.0.0.1/hrms_test#hosted",
  ])("rejects non-disposable target %s", (testDatabaseUrl) => {
    expect(() =>
      requireIsolatedDatabaseSource({ TEST_DATABASE_URL: testDatabaseUrl }),
    ).toThrow("Refusing non-disposable TEST_DATABASE_URL");
  });

  it("rejects source or derived-target equivalence with the application database", () => {
    const testDatabaseUrl =
      "postgresql://local:sample@127.0.0.1:55433/hrms_coverage_test";
    const targetDatabaseName =
      "hrms_migration_runner_test_1234_0123456789abcdef";
    expect(() =>
      requireIsolatedDatabaseSource({
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL: testDatabaseUrl,
      }, targetDatabaseName),
    ).toThrow("Disposable migration databases must not equal DATABASE_URL");
    expect(() =>
      requireIsolatedDatabaseSource({
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL:
          "postgresql://other:credentials@127.0.0.1:55433/hrms_migration_runner_test_1234_0123456789abcdef",
      }, targetDatabaseName),
    ).toThrow("Disposable migration databases must not equal DATABASE_URL");
  });

  it("canonicalizes loopback aliases, credentials, and the default PostgreSQL port", () => {
    const targetDatabaseName =
      "hrms_migration_runner_test_1234_0123456789abcdef";
    expect(() =>
      requireIsolatedDatabaseSource({
        TEST_DATABASE_URL: "postgresql://source:secret@localhost/hrms_source_test",
        DATABASE_URL:
          "postgres://app:different@127.0.0.1:5432/hrms_migration_runner_test_1234_0123456789abcdef",
      }, targetDatabaseName),
    ).toThrow("Disposable migration databases must not equal DATABASE_URL");
  });

  it("returns a distinct unique child target without mutating the source", () => {
    const testDatabaseUrl =
      "postgresql://local:sample@127.0.0.1:55433/hrms_coverage_test";
    const targetDatabaseName =
      "hrms_migration_runner_test_1234_0123456789abcdef";
    const result = requireIsolatedDatabaseSource(
      { TEST_DATABASE_URL: testDatabaseUrl },
      targetDatabaseName,
    );
    expect(result.source.toString()).toBe(testDatabaseUrl);
    expect(result.target.toString()).toBe(
      "postgresql://local:sample@127.0.0.1:55433/hrms_migration_runner_test_1234_0123456789abcdef",
    );
    expect(() =>
      requireIsolatedDatabaseSource(
        {
          TEST_DATABASE_URL:
            "postgresql://local:sample@127.0.0.1:55433/hrms_migration_runner_test_1234_0123456789abcdef",
        },
        targetDatabaseName,
      ),
    ).toThrow("Derived migration target must not equal TEST_DATABASE_URL");
  });
});

function migration(id: string, sql: string): MigrationFile {
  const filename = `${id}_migration_runner_probe.sql`;
  return {
    id,
    filename,
    absolutePath: filename,
    sql,
    checksumSha256: checksumSql(sql),
  };
}

describe("migration runner PostgreSQL atomicity", () => {
  let adminClient: Client | undefined;
  let client: Client | undefined;
  let targetDatabaseUrl: URL;
  let ownsTargetDatabase = false;

  async function dropOwnedTargetDatabase(): Promise<void> {
    if (!ownsTargetDatabase) return;
    await client?.end().catch(() => undefined);
    client = undefined;
    await adminClient!.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TARGET_DATABASE_NAME],
    );
    await adminClient!.query(
      `DROP DATABASE ${quotedTargetDatabaseName(TARGET_DATABASE_NAME)}`,
    );
    ownsTargetDatabase = false;
  }

  async function recreateTargetDatabase(): Promise<void> {
    await dropOwnedTargetDatabase();
    await createFreshTargetDatabase(adminClient!, TARGET_DATABASE_NAME);
    ownsTargetDatabase = true;
    client = new Client({ connectionString: targetDatabaseUrl.toString() });
    await client.connect();
    await ensureMigrationLedger(client);
  }

  beforeAll(async () => {
    const { source, target } = requireIsolatedDatabaseSource();
    targetDatabaseUrl = target;
    adminClient = new Client({ connectionString: source.toString() });
    await adminClient.connect();
  });

  beforeEach(async () => {
    await recreateTargetDatabase();
  });

  afterAll(async () => {
    await dropOwnedTargetDatabase().catch(() => undefined);
    await adminClient?.end().catch(() => undefined);
  });

  it("applies schema and one exact ledger row, then replays as a no-op", async () => {
    const candidate = migration(
      "9001",
      "CREATE SCHEMA qa_migration_atomic; CREATE TABLE qa_migration_atomic.probe (id integer PRIMARY KEY);",
    );

    await expect(applyPendingMigrations(client!, [candidate])).resolves.toBe(1);
    const applied = await loadAppliedMigrations(client!);
    const plan = validateMigrationPlan([candidate], applied);

    expect(plan.applied.map(({ id }) => id)).toEqual(["9001"]);
    expect(plan.pending).toEqual([]);
    await expect(applyPendingMigrations(client!, plan.pending)).resolves.toBe(0);
    const ledger = await loadAppliedMigrations(client!);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      migration_id: candidate.id,
      filename: candidate.filename,
      checksum_sha256: candidate.checksumSha256,
    });
  });

  it("rolls back partial DDL and the ledger when the migration body fails", async () => {
    const candidate = migration(
      "9002",
      [
        "CREATE SCHEMA qa_migration_atomic;",
        "CREATE TABLE qa_migration_atomic.probe (id integer PRIMARY KEY);",
        "SELECT * FROM qa_migration_atomic.missing_table;",
      ].join("\n"),
    );

    await expect(applyPendingMigrations(client!, [candidate])).rejects.toMatchObject({
      code: "42P01",
    });
    const state = await client!.query<{ relation: string | null; ledger_count: string }>(`
      SELECT
        to_regclass('qa_migration_atomic.probe')::text AS relation,
        (SELECT count(*)::text FROM platform.schema_migrations) AS ledger_count
    `);
    expect(state.rows[0]).toEqual({ relation: null, ledger_count: "0" });
  });

  it("rolls back successful DDL when the ledger insert fails and allows a clean retry", async () => {
    const candidate = migration(
      "9003",
      "CREATE SCHEMA qa_migration_atomic; CREATE TABLE qa_migration_atomic.probe (id integer PRIMARY KEY);",
    );
    await client!.query(`
      ALTER TABLE platform.schema_migrations
      ADD CONSTRAINT reject_probe_ledger CHECK (migration_id <> '9003')
    `);

    await expect(applyPendingMigrations(client!, [candidate])).rejects.toMatchObject({
      code: "23514",
    });
    const failedState = await client!.query<{ relation: string | null; ledger_count: string }>(`
      SELECT
        to_regclass('qa_migration_atomic.probe')::text AS relation,
        (SELECT count(*)::text FROM platform.schema_migrations) AS ledger_count
    `);
    expect(failedState.rows[0]).toEqual({ relation: null, ledger_count: "0" });

    await client!.query(
      "ALTER TABLE platform.schema_migrations DROP CONSTRAINT reject_probe_ledger",
    );
    await expect(applyPendingMigrations(client!, [candidate])).resolves.toBe(1);
    const recoveredState = await client!.query<{ relation: string; ledger_count: string }>(`
      SELECT
        to_regclass('qa_migration_atomic.probe')::text AS relation,
        (SELECT count(*)::text FROM platform.schema_migrations) AS ledger_count
    `);
    expect(recoveredState.rows[0]).toEqual({
      relation: "qa_migration_atomic.probe",
      ledger_count: "1",
    });
  });

  it("rejects an EOF COMMIT before PostgreSQL can execute preceding DDL", async () => {
    const candidate = migration(
      "9004",
      "CREATE SCHEMA qa_migration_atomic; COMMIT",
    );

    await expect(applyPendingMigrations(client!, [candidate])).rejects.toThrow(
      "must leave transaction ownership to the migration runner",
    );
    const state = await client!.query<{ schema_name: string | null; ledger_count: string }>(`
      SELECT
        to_regnamespace('qa_migration_atomic')::text AS schema_name,
        (SELECT count(*)::text FROM platform.schema_migrations) AS ledger_count
    `);
    expect(state.rows[0]).toEqual({ schema_name: null, ledger_count: "0" });
  });

  it("refuses to replace a pre-existing unowned child database", async () => {
    const unownedDatabaseName =
      `hrms_migration_runner_test_${process.pid}_${randomBytes(8).toString("hex")}`;
    const quotedName = quotedTargetDatabaseName(unownedDatabaseName);
    await adminClient!.query(`CREATE DATABASE ${quotedName}`);
    try {
      await expect(
        createFreshTargetDatabase(adminClient!, unownedDatabaseName),
      ).rejects.toMatchObject({ code: "42P04" });
      const existing = await adminClient!.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
        [unownedDatabaseName],
      );
      expect(existing.rows[0]?.exists).toBe(true);
    } finally {
      await adminClient!.query(`DROP DATABASE ${quotedName}`);
    }
  });

  it("clean-installs through 0064, rolls back the actual 0065 body with its ledger, then upgrades and replays", async () => {
    const files = discoverMigrations();
    const through0064 = files.filter((migration) => Number(migration.id) <= 64);
    const from0065Through0067 = files.filter(
      (migration) => Number(migration.id) >= 65 && Number(migration.id) <= 67,
    );
    const migration0065 = from0065Through0067.find(
      (migration) => migration.id === "0065",
    );
    if (!migration0065) throw new Error("Released migration 0065 is missing");

    await expect(applyPendingMigrations(client!, through0064)).resolves.toBe(64);
    const preFailureState = await client!.query<{
      company_index_definition: string;
      global_constraint_count: string;
      ledger_count: string;
    }>(`
      SELECT
        pg_get_indexdef('leave_wfh.holidays_company_region_date_name_uq'::regclass)
          AS company_index_definition,
        (
          SELECT count(*)::text
          FROM pg_constraint
          WHERE conname = 'holidays_region_holiday_date_name_key'
        ) AS global_constraint_count,
        (
          SELECT count(*)::text
          FROM platform.schema_migrations
          WHERE migration_id = '0065'
        ) AS ledger_count
    `);
    await client!.query(`
      ALTER TABLE platform.schema_migrations
      ADD CONSTRAINT reject_released_0065 CHECK (migration_id <> '0065')
    `);

    await expect(applyPendingMigrations(client!, [migration0065])).rejects.toMatchObject({
      code: "23514",
    });
    const failedState = await client!.query<{
      company_index_definition: string;
      global_constraint_count: string;
      ledger_count: string;
    }>(`
      SELECT
        pg_get_indexdef('leave_wfh.holidays_company_region_date_name_uq'::regclass)
          AS company_index_definition,
        (
          SELECT count(*)::text
          FROM pg_constraint
          WHERE conname = 'holidays_region_holiday_date_name_key'
        ) AS global_constraint_count,
        (
          SELECT count(*)::text
          FROM platform.schema_migrations
          WHERE migration_id = '0065'
        ) AS ledger_count
    `);
    expect(failedState.rows[0]).toEqual(preFailureState.rows[0]);

    await client!.query(
      "ALTER TABLE platform.schema_migrations DROP CONSTRAINT reject_released_0065",
    );
    await expect(
      applyPendingMigrations(client!, from0065Through0067),
    ).resolves.toBe(3);
    const ledger = await loadAppliedMigrations(client!);
    const releasedRows = ledger.filter(({ migration_id }) =>
      ["0064", "0065", "0066", "0067"].includes(migration_id),
    );
    expect(releasedRows.map(({ migration_id }) => migration_id)).toEqual([
      "0064",
      "0065",
      "0066",
      "0067",
    ]);
    expect(releasedRows.find(({ migration_id }) => migration_id === "0065")).toMatchObject({
      filename: migration0065.filename,
      checksum_sha256: migration0065.checksumSha256,
    });
    const appliedState = await client!.query<{
      company_index_definition: string;
      global_constraint_count: string;
    }>(`
      SELECT
        pg_get_indexdef('leave_wfh.holidays_company_region_date_name_uq'::regclass)
          AS company_index_definition,
        (
          SELECT count(*)::text
          FROM pg_constraint
          WHERE conname = 'holidays_region_holiday_date_name_key'
        ) AS global_constraint_count
    `);
    expect(appliedState.rows[0]?.company_index_definition).toContain("lower(name)");
    expect(appliedState.rows[0]?.global_constraint_count).toBe("0");
    const replay = validateMigrationPlan(files, ledger);
    expect(replay.pending).toEqual([]);
    await expect(applyPendingMigrations(client!, replay.pending)).resolves.toBe(0);
  });

  it("accepts the exact released 0065 ledger identity and rejects drift", async () => {
    const filename = "0065_holiday_company_unique_constraint.sql";
    const sql = readFileSync(
      resolve(process.cwd(), "src/db/migrations", filename),
      "utf8",
    );
    const released: MigrationFile = {
      id: "0065",
      filename,
      absolutePath: filename,
      sql,
      checksumSha256: checksumSql(sql),
    };
    const exact: AppliedMigration = {
      migration_id: released.id,
      filename: released.filename,
      checksum_sha256: released.checksumSha256,
      applied_at: new Date("2026-11-18T00:00:00.000Z"),
      execution_time_ms: 1,
    };

    expect(validateMigrationPlan([released], [exact])).toMatchObject({
      applied: [released],
      pending: [],
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      validateMigrationPlan([released], [
        { ...exact, checksum_sha256: "0".repeat(64) },
      ]),
    ).toThrow();
    expect(errorLog).toHaveBeenLastCalledWith(
      expect.stringContaining("Migration checksum mismatch"),
    );
    expect(() =>
      validateMigrationPlan([released], [
        { ...exact, filename: "0065_wrong_filename.sql" },
      ]),
    ).toThrow();
    expect(errorLog).toHaveBeenLastCalledWith(
      expect.stringContaining("Applied migration is missing from repository"),
    );
    errorLog.mockRestore();
  });
});
