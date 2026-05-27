import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadRuntimeEnv, requireEnv } from "./env.js";

loadRuntimeEnv();

const databaseUrl = requireEnv("DATABASE_URL");
const backupDir = resolve(process.cwd(), process.env.HRMS_BACKUP_DIR ?? "backups");
const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
const fileName = `hawkaii-hrms-${timestamp}.dump`;
const filePath = join(backupDir, fileName);

mkdirSync(backupDir, { recursive: true });

const result = spawnSync("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  filePath,
  databaseUrl
], { encoding: "utf8" });

if (result.error) {
  throw new Error(`pg_dump failed to start: ${result.error.message}. Install PostgreSQL client tools on the host running backups.`);
}

if (result.status !== 0) {
  throw new Error(`pg_dump failed with exit code ${result.status ?? "unknown"}: ${redact(result.stderr || result.stdout)}`);
}

const fileBuffer = readFileSync(filePath);
const manifest = {
  created_at: new Date().toISOString(),
  file_name: basename(filePath),
  size_bytes: statSync(filePath).size,
  sha256: createHash("sha256").update(fileBuffer).digest("hex"),
  database_url: redact(databaseUrl),
  format: "pg_dump-custom"
};
writeFileSync(`${filePath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Database backup created: ${filePath}`);
console.log(`Manifest created: ${filePath}.manifest.json`);

function redact(value: string): string {
  return value.replace(/:\/\/([^:@/]+):([^@/]+)@/gu, "://$1:[REDACTED]@");
}
