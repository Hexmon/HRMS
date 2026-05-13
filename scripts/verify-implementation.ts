import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail, walkFiles, read } from "./lib.js";

const modules = ["health", "auth", "core", "expenses", "documents", "assets", "timesheets"];
const required = [
  "index.ts",
  "routes.ts",
  "schemas.ts",
  "service.ts",
  "repository.ts",
  "policy.ts",
  "state-machine.ts",
  "events.ts",
  "errors.ts"
];
const violations: string[] = [];

for (const module of modules) {
  for (const file of required) {
    const path = join("src/modules", module, file);
    if (!existsSync(path)) {
      violations.push(`${path} missing`);
    }
  }
}

const migrationSql = read("src/db/migrations/0001_initial.sql");
for (const schema of ["core", "expenses", "documents", "assets", "timesheets", "platform"]) {
  if (!migrationSql.includes(`CREATE SCHEMA IF NOT EXISTS ${schema}`)) {
    violations.push(`Migration missing ${schema} schema`);
  }
}

for (const route of walkFiles("src/modules", (path) => path.endsWith("routes.ts"))) {
  const content = read(route);
  if (/fastify\.(post|patch|delete)\(/u.test(content) && !content.includes("request.actor")) {
    violations.push(`${route}: mutating route lacks auth guard`);
  }
}

if (violations.length > 0) {
  fail(`Implementation verification failed:\n${violations.join("\n")}`);
}

console.log("Implementation verification passed.");
