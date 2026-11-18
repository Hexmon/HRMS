import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checksumSql,
  migrationExecutionSql,
  type MigrationFile,
} from "../../../scripts/db-migration-lib.js";

function migration(id: string, filename: string, sql: string): MigrationFile {
  return {
    id,
    filename,
    absolutePath: filename,
    sql,
    checksumSha256: checksumSql(sql),
  };
}

describe("migration runner transaction ownership", () => {
  it("keeps the released 0065 checksum while executing its body inside the runner transaction", () => {
    const filename = "0065_holiday_company_unique_constraint.sql";
    const sql = readFileSync(resolve(process.cwd(), "src/db/migrations", filename), "utf8");
    const released = migration("0065", filename, sql);

    expect(released.checksumSha256).toBe(
      "231b5a18f0d0eab8b94c8b7aec8c55fdf92fccdf97f4160c648a36a4f0cf5408",
    );
    const executable = migrationExecutionSql(released);
    expect(executable).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu);
    expect(executable).toContain("CREATE UNIQUE INDEX holidays_company_region_date_name_uq");
  });

  it.each([
    "BEGIN;",
    "BEGIN TRANSACTION; -- trailing comment",
    "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE;",
    "START TRANSACTION ISOLATION LEVEL REPEATABLE READ;",
    "START TRANSACTION; -- trailing comment",
    "COMMIT WORK AND NO CHAIN;",
    "END;",
    "ROLLBACK TRANSACTION;",
    "ROLLBACK TO SAVEPOINT unsafe_savepoint;",
    "ROLLBACK PREPARED 'unsafe-id';",
    "ABORT;",
    "SAVEPOINT unsafe_savepoint;",
    "RELEASE SAVEPOINT unsafe_savepoint;",
    "PREPARE TRANSACTION 'unsafe-id';",
    "COMMIT PREPARED 'unsafe-id';",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
    "SELECT 1; BEGIN;",
    "BEGIN /* bypass attempt */;",
    "BEGIN ISOLATION LEVEL SERIALIZABLE, READ WRITE;",
    "BEGIN READ WRITE ISOLATION LEVEL SERIALIZABLE;",
  ])("rejects top-level transaction control in a new migration: %s", (statement) => {
    const unsafe = migration("0068", "0068_unsafe.sql", `${statement}\nSELECT 1;\n`);
    expect(() => migrationExecutionSql(unsafe)).toThrow("must leave transaction ownership to the migration runner");
  });

  it("does not mistake PL/pgSQL block control inside a dollar-quoted body for migration transaction ownership", () => {
    const procedure = migration(
      "0068",
      "0068_procedure.sql",
      "DO $$\nBEGIN\n  RAISE NOTICE 'safe';\nEND;\n$$;\n",
    );
    expect(migrationExecutionSql(procedure)).toBe(procedure.sql);
  });

  it("does not mistake tagged PL/pgSQL block control for migration transaction ownership", () => {
    const procedure = migration(
      "0068",
      "0068_tagged_procedure.sql",
      "DO $procedure$\nBEGIN\n  RAISE NOTICE 'safe';\nEND;\n$procedure$;\n",
    );
    expect(migrationExecutionSql(procedure)).toBe(procedure.sql);
  });

  it.each([
    ["SELECT 'BEGIN; COMMIT;';", false],
    ["SELECT 'it''s not COMMIT;';", false],
    ["SELECT '$$'; COMMIT; SELECT '$$';", true],
    ["SELECT E'ROLLBACK\\nCOMMIT';", false],
    ['SELECT "BEGIN" FROM example;', false],
    ['SELECT "BEGIN""COMMIT" FROM example;', false],
    ["-- BEGIN;\nSELECT 1;", false],
    ["/* outer /* nested BEGIN; */ COMMIT; */\nSELECT 1;", false],
    ["-- $$\nCOMMIT;\n-- $$", true],
  ])("handles quoted and commented transaction text correctly: %s", (sql, unsafe) => {
    const candidate = migration("0068", "0068_candidate.sql", sql);
    if (unsafe) {
      expect(() => migrationExecutionSql(candidate)).toThrow("must leave transaction ownership to the migration runner");
    } else {
      expect(migrationExecutionSql(candidate)).toBe(sql);
    }
  });

  it("does not let an unterminated dollar quote hide top-level transaction control", () => {
    const unsafe = migration(
      "0068",
      "0068_unterminated_dollar_quote.sql",
      "SELECT 1; $hidden$ COMMIT;",
    );
    expect(() => migrationExecutionSql(unsafe)).toThrow("unterminated dollar-quoted body");
  });

  it("removes the legacy exception when 0065 content or checksum changes", () => {
    const filename = "0065_holiday_company_unique_constraint.sql";
    const releasedSql = readFileSync(resolve(process.cwd(), "src/db/migrations", filename), "utf8");
    const modified = migration("0065", filename, `${releasedSql}-- modified\n`);
    expect(() => migrationExecutionSql(modified)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it("removes the legacy exception when the reviewed 0065 filename changes", () => {
    const releasedSql = readFileSync(
      resolve(process.cwd(), "src/db/migrations/0065_holiday_company_unique_constraint.sql"),
      "utf8",
    );
    const renamed = migration("0065", "0065_renamed.sql", releasedSql);
    expect(() => migrationExecutionSql(renamed)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it("passes ordinary runner-owned migrations through byte-for-byte", () => {
    const safe = migration("0068", "0068_safe.sql", "SELECT 1;\n");
    expect(migrationExecutionSql(safe)).toBe(safe.sql);
  });
});
