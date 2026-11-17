import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const [environment, state] = process.argv.slice(2);
if (!["dev", "qa", "production"].includes(environment) || !["inactive", "active"].includes(state)) {
  throw new Error("Usage: node scripts/prepare-cloudflare-config.mjs <dev|qa|production> <inactive|active>");
}

const hyperdriveId = process.env.HRMS_HYPERDRIVE_ID;
if (!hyperdriveId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(hyperdriveId) ||
    hyperdriveId === "00000000-0000-0000-0000-000000000000") {
  throw new Error("HRMS_HYPERDRIVE_ID must be the real cache-disabled Hyperdrive configuration ID.");
}

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(backendRoot, "wrangler.jsonc"), "utf8"));
const target = config.env[environment];
if (!target?.hyperdrive?.[0] || !target?.queues?.producers?.length) {
  throw new Error(`Missing Wrangler configuration for ${environment}.`);
}
target.hyperdrive[0].id = hyperdriveId;
target.vars.WORKER_ACTIVE = state === "active" ? "true" : "false";
// Generated configuration lives in an ignored directory; these paths are
// relative to that directory, not to the source wrangler.jsonc.
config.main = "../src/workers/cloudflare-worker.ts";
config.$schema = "../node_modules/wrangler/config-schema.json";
const output = join(backendRoot, ".wrangler", "deploy-config.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared ${environment} Worker deployment in ${state} state.`);
