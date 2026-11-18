import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { fail } from "./lib.js";

export interface MigrationFile {
  id: string;
  filename: string;
  absolutePath: string;
  sql: string;
  checksumSha256: string;
}

export interface AppliedMigration {
  migration_id: string;
  filename: string;
  checksum_sha256: string;
  applied_at: Date;
  execution_time_ms: number;
}

export interface MigrationPlan {
  applied: MigrationFile[];
  pending: MigrationFile[];
}

const MIGRATION_FILENAME_PATTERN = /^(?<id>\d{4})_[a-z0-9][a-z0-9_]*\.sql$/;

const MIGRATION_LEDGER_SQL = `
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  migration_id text PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  execution_time_ms integer NOT NULL,
  applied_by text,
  runner_version text
);
`;

const LOCK_NAMESPACE = 76001;
const LOCK_ID = 1002;
const LEGACY_RUNNER_TRANSACTION_MIGRATIONS = new Map([
  [
    "0065_holiday_company_unique_constraint.sql",
    "231b5a18f0d0eab8b94c8b7aec8c55fdf92fccdf97f4160c648a36a4f0cf5408",
  ],
]);

function maskSqlFragment(fragment: string): string {
  return fragment.replace(/[^\n]/gu, " ");
}

function sqlCodeOnly(sql: string): string {
  let code = "";
  let cursor = 0;

  while (cursor < sql.length) {
    if (sql.startsWith("--", cursor)) {
      const lineEnd = sql.indexOf("\n", cursor + 2);
      const end = lineEnd < 0 ? sql.length : lineEnd;
      code += maskSqlFragment(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    if (sql.startsWith("/*", cursor)) {
      let depth = 1;
      let end = cursor + 2;
      while (end < sql.length && depth > 0) {
        if (sql.startsWith("/*", end)) {
          depth += 1;
          end += 2;
        } else if (sql.startsWith("*/", end)) {
          depth -= 1;
          end += 2;
        } else {
          end += 1;
        }
      }
      code += maskSqlFragment(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    const dollarTag = sql.slice(cursor).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0];
    if (dollarTag) {
      const closingIndex = sql.indexOf(dollarTag, cursor + dollarTag.length);
      if (closingIndex < 0) {
        throw new Error("Migration SQL contains an unterminated dollar-quoted body");
      }
      const end = closingIndex + dollarTag.length;
      code += maskSqlFragment(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    const quotePrefix = sql.slice(cursor).match(/^(?:[Ee]|[Uu]&)?'/u)?.[0];
    if (quotePrefix) {
      let end = cursor + quotePrefix.length;
      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") {
          end += 2;
        } else if (sql[end] === "'") {
          end += 1;
          break;
        } else if (sql[end] === "\\" && quotePrefix.toLowerCase() === "e'") {
          end += 2;
        } else {
          end += 1;
        }
      }
      code += maskSqlFragment(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    if (sql[cursor] === '"') {
      let end = cursor + 1;
      while (end < sql.length) {
        if (sql[end] === '"' && sql[end + 1] === '"') {
          end += 2;
        } else if (sql[end] === '"') {
          end += 1;
          break;
        } else {
          end += 1;
        }
      }
      code += maskSqlFragment(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    code += sql[cursor];
    cursor += 1;
  }

  return code;
}

function containsTopLevelTransactionControl(sql: string): boolean {
  const code = sqlCodeOnly(sql);
  return /(?:^|;)\s*(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|END\b|ROLLBACK\b|ABORT\b|SAVEPOINT\b|RELEASE(?:\s+SAVEPOINT)?\b|PREPARE\s+TRANSACTION\b|SET\s+TRANSACTION\b)/imu.test(code);
}

export function migrationExecutionSql(migration: MigrationFile): string {
  const standaloneTransaction = /^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu;
  const expectedLegacyChecksum = LEGACY_RUNNER_TRANSACTION_MIGRATIONS.get(migration.filename);
  if (expectedLegacyChecksum === migration.checksumSha256) {
    const transactionStatements = migration.sql.match(standaloneTransaction) ?? [];
    if (transactionStatements.length !== 2 || !/^\s*BEGIN/im.test(transactionStatements[0] ?? "") || !/^\s*COMMIT/im.test(transactionStatements[1] ?? "")) {
      throw new Error(`Legacy migration ${migration.filename} no longer has its reviewed transaction wrapper`);
    }
    return migration.sql.replace(standaloneTransaction, "").trimStart();
  }
  if (containsTopLevelTransactionControl(migration.sql)) {
    throw new Error(
      `Migration ${migration.filename} must leave transaction ownership to the migration runner`,
    );
  }
  return migration.sql;
}

export function canonicalizeSql(sql: string): string {
  return sql.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function checksumSql(sql: string): string {
  return createHash("sha256")
    .update(canonicalizeSql(sql), "utf8")
    .digest("hex");
}

export function resolveMigrationDirectory(): string {
  const candidates = [
    join(process.cwd(), "src/db/migrations"),
    join(process.cwd(), "dist/src/db/migrations"),
  ];

  for (const directory of candidates) {
    if (!existsSync(directory)) {
      continue;
    }

    const files = readdirSync(directory).filter((file) =>
      file.endsWith(".sql"),
    );

    if (files.length > 0) {
      return directory;
    }
  }

  fail(
    "SQL migrations are missing from src/db/migrations or dist/src/db/migrations",
  );
}

export function discoverMigrations(): MigrationFile[] {
  const directory = resolveMigrationDirectory();

  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    fail(`No SQL migrations found in ${directory}`);
  }

  const seenIds = new Set<string>();
  const seenFilenames = new Set<string>();

  return files.map((filename) => {
    const match = filename.match(MIGRATION_FILENAME_PATTERN);

    if (!match?.groups?.id) {
      fail(
        `Invalid migration filename "${filename}". Expected format like 0001_initial.sql`,
      );
    }

    const id = match.groups.id;

    if (seenIds.has(id)) {
      fail(`Duplicate migration id detected: ${id}`);
    }

    if (seenFilenames.has(filename)) {
      fail(`Duplicate migration filename detected: ${filename}`);
    }

    seenIds.add(id);
    seenFilenames.add(filename);

    const absolutePath = join(directory, filename);
    const sql = canonicalizeSql(readFileSync(absolutePath, "utf8"));

    if (!sql.trim()) {
      fail(`Migration file is empty: ${filename}`);
    }

    return {
      id,
      filename,
      absolutePath,
      sql,
      checksumSha256: checksumSql(sql),
    };
  });
}

export async function acquireMigrationLock(client: Client): Promise<void> {
  await client.query("SELECT pg_advisory_lock($1, $2)", [
    LOCK_NAMESPACE,
    LOCK_ID,
  ]);
}

export async function releaseMigrationLock(client: Client): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1, $2)", [
    LOCK_NAMESPACE,
    LOCK_ID,
  ]);
}

export async function ensureMigrationLedger(client: Client): Promise<void> {
  await client.query(MIGRATION_LEDGER_SQL);
}

export async function loadAppliedMigrations(
  client: Client,
): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(`
    SELECT
      migration_id,
      filename,
      checksum_sha256,
      applied_at,
      execution_time_ms
    FROM platform.schema_migrations
    ORDER BY migration_id ASC
  `);

  return result.rows;
}

export function validateMigrationPlan(
  migrationFiles: MigrationFile[],
  appliedMigrations: AppliedMigration[],
): MigrationPlan {
  const filesById = new Map(
    migrationFiles.map((migration) => [migration.id, migration]),
  );
  const filesByName = new Map(
    migrationFiles.map((migration) => [migration.filename, migration]),
  );

  for (const applied of appliedMigrations) {
    const migrationById = filesById.get(applied.migration_id);
    const migrationByName = filesByName.get(applied.filename);

    if (!migrationById || !migrationByName) {
      fail(
        `Applied migration is missing from repository: ${applied.migration_id} ${applied.filename}`,
      );
    }

    if (migrationById.filename !== applied.filename) {
      fail(
        `Migration id/filename mismatch for ${applied.migration_id}. ` +
          `Ledger has ${applied.filename}, repository has ${migrationById.filename}`,
      );
    }

    if (migrationById.checksumSha256 !== applied.checksum_sha256) {
      fail(
        `Migration checksum mismatch for ${applied.filename}.\n` +
          `Recorded: ${applied.checksum_sha256}\n` +
          `Current:  ${migrationById.checksumSha256}\n` +
          `Applied migrations are immutable. Create a new forward migration.`,
      );
    }
  }

  const appliedIds = new Set(
    appliedMigrations.map((migration) => migration.migration_id),
  );

  const applied = migrationFiles.filter((migration) =>
    appliedIds.has(migration.id),
  );
  const pending = migrationFiles.filter(
    (migration) => !appliedIds.has(migration.id),
  );

  if (pending.length > 0 && applied.length > 0) {
    const maxAppliedId = Math.max(
      ...applied.map((migration) => Number(migration.id)),
    );

    for (const migration of pending) {
      if (Number(migration.id) < maxAppliedId) {
        fail(
          `Out-of-order pending migration detected: ${migration.filename}. ` +
            `Create a new forward migration instead of inserting older history.`,
        );
      }
    }
  }

  return { applied, pending };
}

export async function applyPendingMigrations(
  client: Client,
  migrations: MigrationFile[],
): Promise<number> {
  let appliedCount = 0;

  for (const migration of migrations) {
    const startedAt = Date.now();

    console.log(`Applying migration ${migration.filename}`);

    await client.query("BEGIN");

    try {
      await client.query(migrationExecutionSql(migration));

      const executionTimeMs = Date.now() - startedAt;

      await client.query(
        `
          INSERT INTO platform.schema_migrations (
            migration_id,
            filename,
            checksum_sha256,
            execution_time_ms,
            applied_by,
            runner_version
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          migration.id,
          migration.filename,
          migration.checksumSha256,
          executionTimeMs,
          process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
          "GEO-S10-002",
        ],
      );

      await client.query("COMMIT");
      appliedCount += 1;

      console.log(
        `Applied migration ${migration.filename} in ${executionTimeMs}ms`,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return appliedCount;
}
