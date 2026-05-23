import { read, walkFiles, fail } from "./lib.js";
import { loadEnvFile, requireEnv } from "./env.js";
import { Client } from "pg";

const sqlFiles = walkFiles("src/db/migrations", (path) => path.endsWith(".sql"));
const violations: string[] = [];

for (const file of sqlFiles) {
  const sql = read(file);
  const references = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\.[a-z_]+[\s\S]*?REFERENCES\s+([a-z_]+)\./giu)];
  for (const match of references) {
    if (match[1] !== match[2]) {
      violations.push(`${file}: ${match[1]} references ${match[2]}`);
    }
  }
}

if (violations.length > 0) {
  fail(`Cross-schema foreign key violations found:\n${violations.join("\n")}`);
}

const verifierEnvFile = process.env.HRMS_DB_VERIFY_ENV_FILE ?? ".env.test";
loadEnvFile(verifierEnvFile, {
  override: true,
  required: !process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL
});

const client = new Client({
  connectionString: process.env.HRMS_DB_VERIFY_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? requireEnv("DATABASE_URL")
});
await client.connect();
try {
  const result = await client.query<{
    constraint_schema: string;
    table_name: string;
    foreign_table_schema: string;
    foreign_table_name: string;
  }>(`
    SELECT
      tc.constraint_schema,
      tc.table_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_schema <> ccu.table_schema
  `);
  if (result.rowCount && result.rows.length > 0) {
    fail(`Cross-schema foreign keys found in PostgreSQL: ${JSON.stringify(result.rows, null, 2)}`);
  }
} finally {
  await client.end();
}

console.log("No cross-schema SQL foreign keys found in migrations or PostgreSQL metadata.");
