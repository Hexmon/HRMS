import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  applyPendingMigrations,
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
  it("preserves the released 0065 identity while executing only its body", () => {
    const filename = "0065_holiday_company_unique_constraint.sql";
    const sql = readFileSync(
      resolve(process.cwd(), "src/db/migrations", filename),
      "utf8",
    );
    const released = migration("0065", filename, sql);

    expect(released.checksumSha256).toBe(
      "231b5a18f0d0eab8b94c8b7aec8c55fdf92fccdf97f4160c648a36a4f0cf5408",
    );
    const executable = migrationExecutionSql(released);
    expect(executable).not.toMatch(/(?:^|;)\s*(?:BEGIN|COMMIT)\s*;/imu);
    expect(executable).toContain(
      "CREATE UNIQUE INDEX holidays_company_region_date_name_uq",
    );
  });

  it.each([
    "BEGIN;",
    "BEGIN TRANSACTION; -- trailing comment",
    "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE;",
    "BEGIN ISOLATION LEVEL SERIALIZABLE, READ WRITE;",
    "BEGIN READ WRITE ISOLATION LEVEL SERIALIZABLE;",
    "BEGIN READ WRITE, DEFERRABLE;",
    "BEGIN /* bypass attempt */;",
    "START TRANSACTION ISOLATION LEVEL REPEATABLE READ;",
    "START TRANSACTION READ ONLY, NOT DEFERRABLE;",
    "COMMIT WORK AND NO CHAIN;",
    "END;",
    "ROLLBACK TRANSACTION;",
    "ROLLBACK TO SAVEPOINT unsafe_savepoint;",
    "ABORT;",
    "SAVEPOINT unsafe_savepoint;",
    "RELEASE SAVEPOINT unsafe_savepoint;",
    "PREPARE TRANSACTION 'unsafe-id';",
    "COMMIT PREPARED 'unsafe-id';",
    "ROLLBACK PREPARED 'unsafe-id';",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
  ])("rejects top-level transaction control: %s", (statement) => {
    const unsafe = migration(
      "0068",
      "0068_unsafe.sql",
      `SELECT 1; ${statement}\nSELECT 2;\n`,
    );
    expect(() => migrationExecutionSql(unsafe)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it.each([
    "BEGIN",
    "START TRANSACTION READ ONLY, DEFERRABLE",
    "COMMIT",
    "COMMIT AND CHAIN",
    "END",
    "ROLLBACK",
    "ABORT",
    "SAVEPOINT unsafe_savepoint",
    "RELEASE SAVEPOINT unsafe_savepoint",
    "PREPARE TRANSACTION 'unsafe-id'",
    "COMMIT PREPARED 'unsafe-id'",
    "ROLLBACK PREPARED 'unsafe-id'",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
  ])("rejects transaction control terminated by end-of-input: %s", (statement) => {
    const unsafe = migration("0068", "0068_unsafe.sql", `SELECT 1; ${statement}`);
    expect(() => migrationExecutionSql(unsafe)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it("ignores transaction words inside comments, values, identifiers and PL/pgSQL bodies", () => {
    const procedure = migration(
      "0068",
      "0068_procedure.sql",
      [
        "-- COMMIT;",
        "/* outer /* nested BEGIN; */ ROLLBACK; */",
        "SELECT 'BEGIN;';",
        "SELECT 'it''s still not COMMIT;';",
        "SELECT '$$';",
        "SELECT E'ROLLBACK\\' COMMIT';",
        'CREATE TABLE "END;""COMMIT" (value text);',
        "DO $body$",
        "BEGIN",
        "  RAISE NOTICE 'COMMIT;';",
        "END;",
        "$body$;",
        "",
      ].join("\n"),
    );
    expect(migrationExecutionSql(procedure)).toBe(procedure.sql);
  });

  it("does not let quote-like text conceal later top-level control", () => {
    const candidate = migration(
      "0068",
      "0068_quote_boundary.sql",
      "SELECT '$$'; COMMIT; SELECT '$$';",
    );
    expect(() => migrationExecutionSql(candidate)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it("rejects an unterminated dollar-quoted body before database execution", () => {
    const candidate = migration(
      "0068",
      "0068_unterminated_dollar_quote.sql",
      "SELECT 1; $hidden$ COMMIT;",
    );
    expect(() => migrationExecutionSql(candidate)).toThrow(
      "unterminated dollar-quoted body",
    );
  });

  it("does not mistake a multiline SQL CASE END for transaction control", () => {
    const sql = "UPDATE probe SET value = CASE WHEN value = 1 THEN 2\nELSE 3\nEND\nWHERE id = 1;\n";
    const candidate = migration("0068", "0068_case.sql", sql);
    expect(migrationExecutionSql(candidate)).toBe(sql);
  });

  it.each([
    "SELECT 1; -- COMMIT;",
    "SELECT 1; /* ROLLBACK;",
    "SELECT E'escaped\\",
    "SELECT $1;",
  ])("leaves other incomplete or parameter SQL for PostgreSQL validation: %s", (sql) => {
    const candidate = migration("0068", "0068_incomplete.sql", sql);
    expect(migrationExecutionSql(candidate)).toBe(candidate.sql);
  });

  it("removes the legacy exception when 0065 content, filename or checksum changes", () => {
    const filename = "0065_holiday_company_unique_constraint.sql";
    const releasedSql = readFileSync(
      resolve(process.cwd(), "src/db/migrations", filename),
      "utf8",
    );
    const modified = migration("0065", filename, `${releasedSql}-- modified\n`);
    const renamed = migration("0065", "0065_renamed.sql", releasedSql);

    expect(() => migrationExecutionSql(modified)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
    expect(() => migrationExecutionSql(renamed)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it("recomputes checksums instead of trusting forged migration metadata", () => {
    const checksumSha256 =
      "231b5a18f0d0eab8b94c8b7aec8c55fdf92fccdf97f4160c648a36a4f0cf5408";
    const base = {
      id: "0065",
      filename: "0065_holiday_company_unique_constraint.sql",
      absolutePath: "0065_holiday_company_unique_constraint.sql",
      checksumSha256,
    };

    expect(() => migrationExecutionSql({ ...base, sql: "SELECT 1;\n" })).toThrow(
      "checksum does not match its SQL content",
    );
    expect(() =>
      migrationExecutionSql({
        ...base,
        sql: "BEGIN;\nSELECT 1;\nCOMMIT;\nROLLBACK;\n",
      }),
    ).toThrow("checksum does not match its SQL content");
  });

  it("passes ordinary runner-owned migrations through byte-for-byte", () => {
    const safe = migration("0068", "0068_safe.sql", "SELECT 1;\n");
    expect(migrationExecutionSql(safe)).toBe(safe.sql);
  });

  it("validates every pending file before sending database SQL", async () => {
    const query = vi.fn();
    const client = { query } as unknown as Client;
    const safe = migration("0068", "0068_safe.sql", "SELECT 1;\n");
    const unsafe = migration("0069", "0069_unsafe.sql", "COMMIT");

    await expect(applyPendingMigrations(client, [safe, unsafe])).rejects.toThrow(
      "must leave transaction ownership to the migration runner",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
