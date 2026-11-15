import { afterEach, describe, expect, it, vi } from "vitest";

type StubMigration = { filename: string };

const runner = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  end: vi.fn(async () => undefined),
  acquire: vi.fn(async () => undefined),
  ensureLedger: vi.fn(async () => undefined),
  discover: vi.fn(() => [{ filename: "0072_asset_tenant_ownership_finalization.sql" }]),
  loadApplied: vi.fn(() => []),
  validate: vi.fn<() => { applied: StubMigration[]; pending: StubMigration[] }>(() => ({ applied: [], pending: [] })),
  stage: vi.fn<() => { runnable: StubMigration[]; blocked: StubMigration[] }>(() => ({ runnable: [], blocked: [] })),
  apply: vi.fn(async () => 0),
  release: vi.fn(async () => undefined),
  log: vi.fn(),
}));

vi.mock("pg", () => ({
  Client: class {
    connect = runner.connect;
    end = runner.end;
  },
}));

vi.mock("../../../scripts/env.js", () => ({
  loadRuntimeEnv: vi.fn(),
  requireEnv: vi.fn(() => "postgresql://local-test"),
}));

vi.mock("../../../scripts/db-migration-lib.js", () => ({
  acquireMigrationLock: runner.acquire,
  applyPendingMigrations: runner.apply,
  discoverMigrations: runner.discover,
  ensureMigrationLedger: runner.ensureLedger,
  loadAppliedMigrations: runner.loadApplied,
  releaseMigrationLock: runner.release,
  stagePendingMigrations: runner.stage,
  validateMigrationPlan: runner.validate,
}));

describe("database migration CLI", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.HRMS_MIGRATION_APPROVAL;
  });

  it("runs an approved plan and reports its applied counts", async () => {
    runner.validate.mockReturnValueOnce({ applied: [{ filename: "0001_existing.sql" }], pending: [] });
    runner.stage.mockReturnValueOnce({ runnable: [{ filename: "0002_next.sql" }], blocked: [] });
    runner.apply.mockResolvedValueOnce(1);
    vi.stubGlobal("console", { ...console, log: runner.log });

    // @ts-expect-error Vitest supports static query IDs for isolated module evaluation.
    await import("../../../scripts/db-migrate.js?success");

    expect(runner.apply).toHaveBeenCalledWith(expect.anything(), [{ filename: "0002_next.sql" }]);
    expect(runner.log).toHaveBeenCalledWith("Migration completed successfully. 1 applied, 1 already applied.");
    expect(runner.release).toHaveBeenCalledOnce();
    expect(runner.end).toHaveBeenCalledOnce();
  });

  it("applies preparation, pauses at finalization, and still releases resources", async () => {
    runner.stage.mockReturnValueOnce({
      runnable: [{ filename: "0071_asset_recovery_identity_evidence_prep.sql" }],
      blocked: [{ filename: "0072_asset_tenant_ownership_finalization.sql" }],
    });
    runner.apply.mockResolvedValueOnce(1);
    runner.release.mockRejectedValueOnce(new Error("release failed"));

    // @ts-expect-error Vitest supports static query IDs for isolated module evaluation.
    await expect(import("../../../scripts/db-migrate.js?blocked"))
      .rejects.toThrow(/HRMS_MIGRATION_APPROVAL=0072_asset_tenant_ownership_finalization\.sql/u);
    expect(runner.apply).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
    expect(runner.end).toHaveBeenCalledOnce();
  });

  it("does not release an unacquired lock when acquisition fails", async () => {
    runner.acquire.mockRejectedValueOnce(new Error("lock unavailable"));

    // @ts-expect-error Vitest supports static query IDs for isolated module evaluation.
    await expect(import("../../../scripts/db-migrate.js?lock"))
      .rejects.toThrow("lock unavailable");
    expect(runner.release).not.toHaveBeenCalled();
    expect(runner.end).toHaveBeenCalledOnce();
  });
});
