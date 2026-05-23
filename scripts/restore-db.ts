import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadRuntimeEnv, requireEnv } from "./env.js";

loadRuntimeEnv();

const restoreFile = process.env.HRMS_RESTORE_FILE;
if (!restoreFile) {
  throw new Error("HRMS_RESTORE_FILE is required and must point to a pg_dump custom-format backup.");
}

if (process.env.HRMS_RESTORE_CONFIRM !== "restore") {
  throw new Error("Refusing to restore without HRMS_RESTORE_CONFIRM=restore.");
}

const filePath = resolve(process.cwd(), restoreFile);
if (!existsSync(filePath)) {
  throw new Error(`Restore file not found: ${filePath}`);
}

const databaseUrl = process.env.RESTORE_DATABASE_URL ?? requireEnv("DATABASE_URL");
const result = spawnSync("pg_restore", [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-privileges",
  "--dbname",
  databaseUrl,
  filePath
], { encoding: "utf8" });

if (result.error) {
  throw new Error(`pg_restore failed to start: ${result.error.message}. Install PostgreSQL client tools on the host running restores.`);
}

if (result.status !== 0) {
  throw new Error(`pg_restore failed with exit code ${result.status ?? "unknown"}: ${redact(result.stderr || result.stdout)}`);
}

console.log(`Database restore completed from: ${filePath}`);

function redact(value: string): string {
  return value.replace(/:\/\/([^:@/]+):([^@/]+)@/gu, "://$1:[REDACTED]@");
}
