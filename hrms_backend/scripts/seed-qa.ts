import { loadRuntimeEnv } from "./env.js";
import { runGuardedQaSeed } from "./qa-seed-safety.js";

loadRuntimeEnv();

await runGuardedQaSeed(process.env, {
  releaseSeed: async () => import("./seed-release-data.js"),
  extrasSeed: async () => import("./seed-qa-data.js"),
});
