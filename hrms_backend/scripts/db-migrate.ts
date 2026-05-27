import { existsSync, readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { fail } from "./lib.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";

function migrationSql(): string {
  for (const directory of ["src/db/migrations", "dist/src/db/migrations"]) {
    if (!existsSync(directory)) {
      continue;
    }
    const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
    if (files.length > 0) {
      return files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    }
  }
  fail("SQL migrations are missing from src/db/migrations or dist/src/db/migrations");
}

loadRuntimeEnv();

const migration = migrationSql();
const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();
try {
  await client.query(migration);
  console.log("Migration applied successfully.");
} finally {
  await client.end();
}
