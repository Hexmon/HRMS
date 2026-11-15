import { describe, expect, it } from "vitest";
import {
  ASSET_IDENTITY_FINALIZATION_MIGRATION,
  stagePendingMigrations,
  type MigrationFile,
} from "../../../scripts/db-migration-lib.js";

const migration = (id: string, filename: string): MigrationFile => ({
  id, filename, absolutePath: `/tmp/${filename}`, sql: "SELECT 1;", checksumSha256: id,
});

describe("manual migration staging", () => {
  const prep = migration("0071", "0071_asset_recovery_identity_evidence_prep.sql");
  const finalization = migration("0072", ASSET_IDENTITY_FINALIZATION_MIGRATION);
  const runtime = migration("0073", "0073_asset_termination_identity_snapshot.sql");

  it("applies preparation only and blocks finalization without exact approval", () => {
    expect(stagePendingMigrations([prep, finalization, runtime], undefined)).toEqual({
      runnable: [prep], blocked: [finalization, runtime],
    });
    expect(stagePendingMigrations([prep, finalization, runtime], ASSET_IDENTITY_FINALIZATION_MIGRATION)).toEqual({
      runnable: [prep], blocked: [finalization, runtime],
    });
    expect(stagePendingMigrations([finalization, runtime], "wrong-file.sql")).toEqual({
      runnable: [], blocked: [finalization, runtime],
    });
  });

  it("runs the reviewed finalization chain only with the exact migration approval", () => {
    expect(stagePendingMigrations([finalization, runtime], ASSET_IDENTITY_FINALIZATION_MIGRATION)).toEqual({
      runnable: [finalization, runtime], blocked: [],
    });
  });
});
