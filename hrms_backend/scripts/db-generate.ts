import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./lib.js";
import { loadRuntimeEnv } from "./env.js";

loadRuntimeEnv();

const schemaPath = join(process.cwd(), "src/db/schema.ts");
const migrationPath = join(process.cwd(), "src/db/migrations/0001_initial.sql");

if (!existsSync(schemaPath)) {
  fail("Drizzle schema is missing");
}

if (!existsSync(migrationPath)) {
  fail("Initial migration is missing");
}

console.log("Drizzle schema and baseline migration are present.");
