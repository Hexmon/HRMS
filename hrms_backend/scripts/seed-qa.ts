import { Client } from "pg";
import { loadRuntimeEnv } from "./env.js";
import { seedIds } from "../src/platform/data-store.js";
import {
  deterministicQaCompanyId,
  preflightQaAdminCompanyContext,
  requireQaSeedTarget,
  runGuardedQaSeed,
} from "./qa-seed-safety.js";

loadRuntimeEnv();

await runGuardedQaSeed(process.env, {
  preflight: async () => {
    const target = requireQaSeedTarget(process.env);
    const client = new Client({ connectionString: target.toString() });
    await client.connect();
    try {
      await client.query("BEGIN");
      await preflightQaAdminCompanyContext(client, {
        adminUserId: seedIds.admin,
        companyId: deterministicQaCompanyId(),
        preferenceId: "unused-preflight-id",
      });
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  },
  releaseSeed: async () => import("./seed-release-data.js"),
  extrasSeed: async () => import("./seed-qa-data.js"),
});
