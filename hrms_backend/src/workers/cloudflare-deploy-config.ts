import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Environment = "dev" | "qa" | "production";
type WorkerState = "inactive" | "active";

interface R2Binding {
  binding: string;
  bucket_name: string;
}

interface EnvironmentConfig {
  vars?: Record<string, string>;
  hyperdrive?: Array<{ binding: string; id: string }>;
  r2_buckets?: R2Binding[];
  queues?: { producers?: unknown[] };
}

interface WranglerConfig {
  $schema?: string;
  main?: string;
  env?: Partial<Record<Environment, EnvironmentConfig>>;
}

interface PrepareOptions {
  environment: Environment;
  state: WorkerState;
  hyperdriveId: string | undefined;
  bucketName: string | undefined;
}

const environments = new Set<Environment>(["dev", "qa", "production"]);
const states = new Set<WorkerState>(["inactive", "active"]);
const bucketNamePattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export function prepareCloudflareConfig(config: WranglerConfig, options: PrepareOptions): WranglerConfig {
  const { environment, state, hyperdriveId, bucketName } = options;
  if (!environments.has(environment) || !states.has(state)) {
    throw new Error("Environment and state must be dev|qa|production and inactive|active.");
  }
  if (!hyperdriveId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(hyperdriveId) ||
      hyperdriveId === "00000000-0000-0000-0000-000000000000") {
    throw new Error("HRMS_HYPERDRIVE_ID must be the real cache-disabled Hyperdrive configuration ID.");
  }
  if (!bucketName || bucketName.length < 3 || bucketName.length > 63 ||
      !bucketNamePattern.test(bucketName) || bucketName.startsWith("replace-with-")) {
    throw new Error("R2_BUCKET_NAME must be the real 3-63 character lowercase environment bucket name.");
  }

  const target = config.env?.[environment];
  if (!target?.queues?.producers?.length || !target.vars) {
    throw new Error(`Missing Wrangler configuration for ${environment}.`);
  }
  const hyperdriveBindings = target.hyperdrive?.filter((binding) => binding.binding === "HYPERDRIVE") ?? [];
  if (hyperdriveBindings.length !== 1) {
    throw new Error(`Wrangler ${environment} must declare exactly one HYPERDRIVE binding.`);
  }
  const mediaBindings = target.r2_buckets?.filter((binding) => binding.binding === "MEDIA_BUCKET") ?? [];
  if (mediaBindings.length !== 1) {
    throw new Error(`Wrangler ${environment} must declare exactly one MEDIA_BUCKET binding.`);
  }
  hyperdriveBindings[0]!.id = hyperdriveId;
  mediaBindings[0]!.bucket_name = bucketName;
  target.vars.WORKER_ACTIVE = state === "active" ? "true" : "false";
  return config;
}

export function writeCloudflareDeploymentConfig(
  backendRoot: string,
  options: PrepareOptions,
): string {
  const config = prepareCloudflareConfig(
    JSON.parse(readFileSync(join(backendRoot, "wrangler.jsonc"), "utf8")) as WranglerConfig,
    options,
  );
  config.main = "../src/workers/cloudflare-worker.ts";
  config.$schema = "../node_modules/wrangler/config-schema.json";
  const output = join(backendRoot, ".wrangler", "deploy-config.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
  return output;
}

export function runPrepareCloudflareConfig(
  args = process.argv.slice(2),
  environmentVariables: NodeJS.ProcessEnv = process.env,
  backendRoot: string,
): string {
  const [environment, state] = args;
  if (!environments.has(environment as Environment) || !states.has(state as WorkerState)) {
    throw new Error("Usage: tsx src/workers/cloudflare-deploy-config-cli.ts <dev|qa|production> <inactive|active>");
  }
  return writeCloudflareDeploymentConfig(backendRoot, {
    environment: environment as Environment,
    state: state as WorkerState,
    hyperdriveId: environmentVariables.HRMS_HYPERDRIVE_ID,
    bucketName: environmentVariables.R2_BUCKET_NAME,
  });
}
