/**
 * Synthetic disposable PostgreSQL/Valkey current-behavior probe.
 * Run from hrms_backend only after pnpm test:infra:up; always run test:infra:down afterward.
 * This resets TEST_DATABASE_URL. It refuses non-local targets and URL overrides.
 */
import "../../../hrms_backend/scripts/test-setup.ts";
import { buildApp } from "../../../hrms_backend/src/app.ts";
import { buildRealApp } from "../../../hrms_backend/src/__tests__/real-infra.ts";
import { seedIds } from "../../../hrms_backend/src/platform/data-store.ts";
import { authHeader, loginAs } from "../../../hrms_backend/src/testing/index.ts";
import { requireLocalTestEnvironment } from "./disposable-probe-guard.ts";

async function main(): Promise<void> {
  requireLocalTestEnvironment(process.env);
  const appA = await buildRealApp({ reset: true });
  let appB: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await appA.ready();
    appB = await buildApp({ dataStoreMode: "postgres", seedIfEmpty: true, rateLimit: false });
    await appB.ready();
    const assetA = appA.store.assets[0];
    const assetB = appB.store.assets[0];
    if (!assetA || !assetB || assetA.id !== assetB.id || assetA.version !== assetB.version) {
      throw new Error("Two instances did not start from the same synthetic asset version");
    }
    const actorA = await loginAs(appA, "AST");
    const actorB = await loginAs(appB, "AST");
    const assign = await appA.inject({
      method: "POST",
      url: `/api/v1/assets/${assetA.id}/assign`,
      headers: authHeader(actorA.token),
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: assetA.version }
    });
    if (assign.statusCode !== 200) throw new Error(`First mutation failed: HTTP ${assign.statusCode}`);
    const afterAssign = await appA.store.pgPool!.query<{ status: string; version: number; current_assigned_user_id: string | null }>(
      "SELECT status, version, current_assigned_user_id FROM assets.assets WHERE id = $1", [assetA.id]
    );
    const create = await appB.inject({
      method: "POST",
      url: "/api/v1/assets",
      headers: authHeader(actorB.token),
      payload: { asset_code: "LOCAL-MULTI-INSTANCE-2", asset_type: "Laptop", name: "Synthetic second asset" }
    });
    if (create.statusCode !== 200) throw new Error(`Second mutation failed: HTTP ${create.statusCode}`);
    const afterSecond = await appA.store.pgPool!.query<{ status: string; version: number; current_assigned_user_id: string | null }>(
      "SELECT status, version, current_assigned_user_id FROM assets.assets WHERE id = $1", [assetA.id]
    );
    const count = await appA.store.pgPool!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.asset_assignments WHERE asset_id = $1", [assetA.id]
    );
    process.stdout.write(`${JSON.stringify({
      environment: "two Fastify instances; disposable local PostgreSQL and Valkey",
      first_http_status: assign.statusCode,
      after_first_status: afterAssign.rows[0]?.status,
      after_first_version: afterAssign.rows[0]?.version,
      after_first_assignee_matches: afterAssign.rows[0]?.current_assigned_user_id === seedIds.employee1,
      second_http_status: create.statusCode,
      after_second_status: afterSecond.rows[0]?.status,
      after_second_version: afterSecond.rows[0]?.version,
      after_second_assignee_matches: afterSecond.rows[0]?.current_assigned_user_id === seedIds.employee1,
      assignment_rows_after_second: Number(count.rows[0]?.count ?? 0)
    }, null, 2)}\n`);
  } finally {
    await appB?.close();
    await appA.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
