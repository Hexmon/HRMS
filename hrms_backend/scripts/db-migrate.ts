import { Client } from "pg";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import {
  acquireMigrationLock,
  applyPendingMigrations,
  discoverMigrations,
  ensureMigrationLedger,
  loadAppliedMigrations,
  releaseMigrationLock,
  stagePendingMigrations,
  validateMigrationPlan,
} from "./db-migration-lib.js";

loadRuntimeEnv();

const client = new Client({ connectionString: requireEnv("DATABASE_URL") });

await client.connect();

let lockAcquired = false;

try {
  await acquireMigrationLock(client);
  lockAcquired = true;

  await ensureMigrationLedger(client);

  const migrationFiles = discoverMigrations();
  const appliedMigrations = await loadAppliedMigrations(client);
  const plan = validateMigrationPlan(migrationFiles, appliedMigrations);
  const staged = stagePendingMigrations(plan.pending, process.env.HRMS_MIGRATION_APPROVAL);

  const appliedCount = await applyPendingMigrations(client, staged.runnable);
  if (staged.blocked.length > 0) {
    throw new Error(
      `Migration paused after recovery evidence preparation. Populate and independently verify ` +
      `assets.asset_recovery_identity_evidence, then rerun with HRMS_MIGRATION_APPROVAL=` +
      `${staged.blocked[0]!.filename}.`,
    );
  }

  console.log(
    `Migration completed successfully. ` +
      `${appliedCount} applied, ${plan.applied.length} already applied.`,
  );
} finally {
  if (lockAcquired) {
    await releaseMigrationLock(client).catch(() => undefined);
  }

  await client.end();
}
