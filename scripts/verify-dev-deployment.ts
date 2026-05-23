import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getLocalDemoPassword } from "#auth";
import { loadRuntimeEnv } from "./env.js";

loadRuntimeEnv();
const localDemoPassword = getLocalDemoPassword();

const envFile = process.env.HRMS_ENV_FILE ?? ".env.local";
const reportDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/dev-standalone";
const composeProject = process.env.HRMS_COMPOSE_PROJECT ?? "hawkaii_hrms_backend_dev";
const composeFiles = (process.env.HRMS_COMPOSE_FILES ?? "infra/docker/docker-compose.dev.yml")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const apiService = process.env.HRMS_COMPOSE_API_SERVICE ?? "hawkaii-hrms-api";
const migrateService = process.env.HRMS_COMPOSE_MIGRATE_SERVICE ?? "hawkaii-hrms-migrate";
const outboxWorkerService = process.env.HRMS_COMPOSE_OUTBOX_WORKER_SERVICE ?? "hawkaii-hrms-outbox-worker";
mkdirSync(reportDir, { recursive: true });

type Status = "pass" | "fail";

interface Check {
  name: string;
  status: Status;
  evidence: string;
}

const checks: Check[] = [];

function record(name: string, status: Status, evidence: string): void {
  checks.push({ name, status, evidence });
}

function redactText(text: string): string {
  return text
    .replace(/minioadmin(?::minioadmin)?/giu, "[REDACTED]")
    .replace(/postgres:\/\/postgres:postgres/giu, "postgres://[REDACTED]")
    .replace(/(JWT_(?:ACCESS|REFRESH)_SECRET=)[^\s]+/giu, "$1[REDACTED]")
    .replace(/(OBJECT_STORAGE_SECRET_KEY=)[^\s]+/giu, "$1[REDACTED]")
    .replace(/(MINIO_ROOT_PASSWORD=)[^\s]+/giu, "$1[REDACTED]")
    .replace(/MINIO_ROOT_(?:USER|PASSWORD)/giu, "[REDACTED_ENV]");
}

function command(args: string[]): { status: number | null; output: string } {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  return {
    status: result.status,
    output: redactText(`${result.stdout}${result.stderr}`.trim())
  };
}

function composeArgs(args: string[]): string[] {
  return [
    "compose",
    "--env-file",
    envFile,
    ...composeFiles.flatMap((file) => ["-f", file]),
    "-p",
    composeProject,
    ...args
  ];
}

async function request(path: string, init?: RequestInit): Promise<{ status: number; text: string; json?: unknown }> {
  const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3001").replace(/\/$/u, "");
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, text, json };
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        /(token|secret|password|authorization|cookie)/iu.test(key) ? "[REDACTED]" : redact(nestedValue)
      ])
    );
  }
  return value;
}

function summarize(value: unknown): string {
  const text = typeof value === "string" ? redactText(value) : JSON.stringify(redact(value));
  return text.length > 800 ? `${text.slice(0, 800)}... [truncated]` : text;
}

const ps = command(composeArgs(["ps", "--all", "--format", "json"]));
writeFileSync(join(reportDir, "compose-ps.json"), `${ps.output}\n`);
if (ps.status !== 0) {
  record("docker compose ps", "fail", ps.output);
} else {
  const requiredRunning = ["postgres", "valkey", "minio", apiService, outboxWorkerService];
  const missing = requiredRunning.filter((service) => !ps.output.includes(`"Service":"${service}"`));
  const notRunning = requiredRunning.filter((service) => {
    const match = new RegExp(`"Service":"${service}"[\\s\\S]*?"State":"([^"]+)"`, "u").exec(ps.output);
    return match ? match[1] !== "running" : true;
  });
  const migrateOk = new RegExp(`"Service":"${migrateService}"[\\s\\S]*?"ExitCode":0`, "u").test(ps.output);
  record(
    "docker compose backend services",
    missing.length === 0 && notRunning.length === 0 && migrateOk ? "pass" : "fail",
    `missing=${missing.join(",") || "none"} not_running=${notRunning.join(",") || "none"} migrate_exit_0=${migrateOk}`
  );
}

const logs = command(composeArgs(["logs", "--tail=120"]));
writeFileSync(join(reportDir, "compose-logs-tail.txt"), `${logs.output}\n`);
record("docker compose logs readable", logs.status === 0 ? "pass" : "fail", logs.status === 0 ? "tail captured" : logs.output);

const live = await request("/health/live");
record("api liveness", live.status === 200 ? "pass" : "fail", summarize(live.json ?? live.text));

const ready = await request("/health/ready");
record(
  "api readiness real adapters",
  ready.status === 200 && summarize(ready.json).includes('"data_store":"postgres"') ? "pass" : "fail",
  summarize(ready.json ?? ready.text)
);

const openapi = await request("/api/v1/openapi.json");
record("openapi available", openapi.status === 200 && openapi.text.includes("Hawkaii HRMS API") ? "pass" : "fail", `status=${openapi.status}`);

const login = await request("/api/v1/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "e1@example.test", password: localDemoPassword })
});
const loginBody = login.json as { access_token?: string } | undefined;
record("auth login", login.status === 200 && Boolean(loginBody?.access_token) ? "pass" : "fail", summarize(login.json ?? login.text));

const token = loginBody?.access_token;
if (token) {
  const users = await request("/api/v1/core/users?page=1&page_size=5", {
    headers: { authorization: `Bearer ${token}` }
  });
  record("core users endpoint", users.status === 200 ? "pass" : "fail", summarize(users.json ?? users.text));

  const timesheets = await request("/api/v1/timesheets/work-segments?page=1&page_size=5", {
    headers: { authorization: `Bearer ${token}` }
  });
  record("timesheet endpoint", timesheets.status === 200 ? "pass" : "fail", summarize(timesheets.json ?? timesheets.text));
}

const assetScan = await request("/api/v1/assets/scan/release-qr-hash-lap-available", { method: "POST" });
record(
  "asset QR endpoint safe payload",
  assetScan.status === 200 && !(assetScan.text.includes('"id"') || assetScan.text.includes("procurement_cost")) ? "pass" : "fail",
  summarize(assetScan.json ?? assetScan.text)
);

const result = {
  timestamp: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  checks,
  artifacts: {
    compose_ps: existsSync(join(reportDir, "compose-ps.json")),
    compose_logs_tail: existsSync(join(reportDir, "compose-logs-tail.txt"))
  }
};

writeFileSync(join(reportDir, "standalone-backend-smoke-results.json"), `${JSON.stringify(result, null, 2)}\n`);

if (result.status === "fail") {
  console.error(`Standalone backend deployment verification failed. See ${join(reportDir, "standalone-backend-smoke-results.json")}`);
  process.exit(1);
}

console.log("Standalone backend deployment smoke verification passed.");
