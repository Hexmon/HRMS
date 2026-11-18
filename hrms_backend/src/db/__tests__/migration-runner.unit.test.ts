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

  it("rejects transaction ownership in any new or modified migration", () => {
    const unsafe = migration("0068", "0068_unsafe.sql", "BEGIN;\nSELECT 1;\nCOMMIT;\n");
    expect(() => migrationExecutionSql(unsafe)).toThrow(
      "must leave transaction ownership to the migration runner",
    );
  });

  it("passes ordinary runner-owned migrations through byte-for-byte", () => {
    const safe = migration("0068", "0068_safe.sql", "SELECT 1;\n");
    expect(migrationExecutionSql(safe)).toBe(safe.sql);
  });
});
