import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { fail } from "./lib.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";

function migrationPath(): string {
  for (const candidate of ["src/db/migrations/0001_initial.sql", "dist/src/db/migrations/0001_initial.sql"]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  fail("Initial migration is missing from src/db/migrations or dist/src/db/migrations");
}

loadRuntimeEnv();

const migration = readFileSync(migrationPath(), "utf8");
const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();
try {
  await client.query(migration);
  console.log("Migration applied successfully.");
} finally {
  await client.end();
}
