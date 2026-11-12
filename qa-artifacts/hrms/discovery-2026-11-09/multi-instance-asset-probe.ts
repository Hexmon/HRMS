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
import { requireLocalTestEnvironment, runProbeCli } from "./disposable-probe-guard.ts";

type ProbeApp = Awaited<ReturnType<typeof buildApp>>;
export type MultiInstanceProbeDependencies = {
  requireEnvironment: (environment: NodeJS.ProcessEnv) => void;
  buildPrimary: () => Promise<ProbeApp>;
  buildSecondary: () => Promise<ProbeApp>;
  login: typeof loginAs;
  header: typeof authHeader;
  employeeId: string;
};

export async function runMultiInstanceAssetProbe(
  environment: NodeJS.ProcessEnv,
  dependencies: MultiInstanceProbeDependencies,
): Promise<Record<string, string | number | boolean | undefined>> {
  dependencies.requireEnvironment(environment);
  const appA = await dependencies.buildPrimary();
  let appB: ProbeApp | undefined;
  try {
    await appA.ready();
    appB = await dependencies.buildSecondary();
    await appB.ready();
    const assetA = appA.store.assets[0];
    const assetB = appB.store.assets[0];
    if (!assetA || !assetB || assetA.id !== assetB.id || assetA.version !== assetB.version) {
      throw new Error("Two instances did not start from the same synthetic asset version");
    }
    const actorA = await dependencies.login(appA, "AST");
    const actorB = await dependencies.login(appB, "AST");
    const assign = await appA.inject({
      method: "POST",
      url: `/api/v1/assets/${assetA.id}/assign`,
      headers: dependencies.header(actorA.token),
      payload: { assigned_to_user_id: dependencies.employeeId, expected_version: assetA.version }
    });
    if (assign.statusCode !== 200) throw new Error(`First mutation failed: HTTP ${assign.statusCode}`);
    const afterAssign = await appA.store.pgPool!.query<{ status: string; version: number; current_assigned_user_id: string | null }>(
      "SELECT status, version, current_assigned_user_id FROM assets.assets WHERE id = $1", [assetA.id]
    );
    const create = await appB.inject({
      method: "POST",
      url: "/api/v1/assets",
      headers: dependencies.header(actorB.token),
      payload: { asset_code: "LOCAL-MULTI-INSTANCE-2", asset_type: "Laptop", name: "Synthetic second asset" }
    });
    if (create.statusCode !== 200) throw new Error(`Second mutation failed: HTTP ${create.statusCode}`);
    const afterSecond = await appA.store.pgPool!.query<{ status: string; version: number; current_assigned_user_id: string | null }>(
      "SELECT status, version, current_assigned_user_id FROM assets.assets WHERE id = $1", [assetA.id]
    );
    const assignmentCountQuery = "SELECT count(*)::text AS count FROM assets.asset_assignments WHERE asset_id = $1";
    const count = await appA.store.pgPool!.query<{ count: string }>(assignmentCountQuery, [assetA.id]);
    return {
      environment: "two Fastify instances; disposable local PostgreSQL and Valkey",
      first_http_status: assign.statusCode,
      after_first_status: afterAssign.rows[0]?.status,
      after_first_version: afterAssign.rows[0]?.version,
      after_first_assignee_matches: afterAssign.rows[0]?.current_assigned_user_id === dependencies.employeeId,
      second_http_status: create.statusCode,
      after_second_status: afterSecond.rows[0]?.status,
      after_second_version: afterSecond.rows[0]?.version,
      after_second_assignee_matches: afterSecond.rows[0]?.current_assigned_user_id === dependencies.employeeId,
      assignment_rows_after_second: Number.parseInt(count.rows[0]?.count ?? "0", 10)
    };
  } finally {
    await appB?.close();
    await appA.close();
  }
}

const runtimeDependencies: MultiInstanceProbeDependencies = {
    requireEnvironment: requireLocalTestEnvironment,
    buildPrimary: buildRealApp.bind(null, { reset: true }) as () => Promise<ProbeApp>,
    buildSecondary: buildApp.bind(null, { dataStoreMode: "postgres", seedIfEmpty: true, rateLimit: false }),
    login: loginAs,
    header: authHeader,
    employeeId: seedIds.employee1,
};

export async function main(
  environment: NodeJS.ProcessEnv,
  dependencies: MultiInstanceProbeDependencies,
  output: Pick<NodeJS.WriteStream, "write">,
): Promise<void> {
  output.write(`${JSON.stringify(await runMultiInstanceAssetProbe(environment, dependencies), null, 2)}\n`);
}

void runProbeCli(import.meta.url, process.argv[1], main.bind(null, process.env, runtimeDependencies, process.stdout));
