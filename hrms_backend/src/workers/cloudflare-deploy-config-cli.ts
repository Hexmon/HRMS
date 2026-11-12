import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPrepareCloudflareConfig } from "./cloudflare-deploy-config.js";

const [environment, state] = process.argv.slice(2);
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
runPrepareCloudflareConfig(process.argv.slice(2), process.env, backendRoot);
console.log(`Prepared ${environment} Worker deployment in ${state} state.`);
