import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail, walkFiles, read } from "./lib.js";

type OpenApiDocument = {
  paths?: Record<string, Record<string, unknown>>;
};

const moduleManifest = [
  { dir: "health", variable: "healthModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts"] },
  { dir: "auth", variable: "authModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "core", variable: "coreModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "dashboard", variable: "dashboardModule", files: ["index.ts", "routes.ts", "service.ts"] },
  { dir: "platform", variable: "platformModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "expenses", variable: "expensesModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "documents", variable: "documentsModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "reports", variable: "reportsModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "assets", variable: "assetsModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "timesheets", variable: "timesheetsModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "attendance", variable: "attendanceModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "leave-wfh", variable: "leaveWfhModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "ems", variable: "emsModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "projects", variable: "projectsModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts", "events.ts"] },
  { dir: "helpdesk", variable: "helpdeskModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts", "policy.ts"] },
  { dir: "notifications", variable: "notificationsModule", files: ["index.ts", "routes.ts", "repository.ts", "service.ts"] },
  { dir: "admin", variable: "adminModule", files: ["index.ts", "routes.ts", "repository.ts", "schemas.ts", "service.ts", "policy.ts"] }
];

const dataSchemas = ["core", "expenses", "documents", "assets", "timesheets", "platform", "attendance", "leave_wfh", "ems", "projects", "helpdesk"];
const violations: string[] = [];

verifyModuleFiles();
verifyModuleRegistration();
verifyMigrationSchemas();
verifyMutatingRoutesAreGuarded();
verifyContractCompletion();

if (violations.length > 0) {
  fail(`Implementation verification failed:\n${violations.join("\n")}`);
}

console.log("Implementation verification passed.");

function verifyModuleFiles(): void {
  for (const module of moduleManifest) {
    for (const file of module.files) {
      const path = join("src/modules", module.dir, file);
      if (!existsSync(path)) {
        violations.push(`${path} missing`);
      }
    }
  }
}

function verifyModuleRegistration(): void {
  const app = read("src/app.ts");
  for (const module of moduleManifest) {
    const importPath = `./modules/${module.dir}/index.js`;
    if (!app.includes(importPath)) {
      violations.push(`src/app.ts missing import for ${module.dir} module`);
    }
    if (!app.includes(`app.register(${module.variable})`)) {
      violations.push(`src/app.ts missing registration for ${module.dir} module`);
    }
  }
}

function verifyMigrationSchemas(): void {
  const migrations = walkFiles("src/db/migrations", (path) => path.endsWith(".sql"))
    .map((path) => read(path))
    .join("\n");
  for (const schema of dataSchemas) {
    if (!migrations.includes(`CREATE SCHEMA IF NOT EXISTS ${schema}`)) {
      violations.push(`Migrations missing ${schema} schema`);
    }
  }
}

function verifyMutatingRoutesAreGuarded(): void {
  const publicRouteFiles = new Set(["src/modules/auth/routes.ts"]);
  for (const route of walkFiles("src/modules", (path) => path.endsWith("routes.ts"))) {
    if (publicRouteFiles.has(route)) {
      continue;
    }
    const content = read(route);
    if (/fastify\.(post|patch|put|delete)\(/u.test(content) && !content.includes("request.actor")) {
      violations.push(`${route}: mutating route lacks auth guard`);
    }
  }
}

function verifyContractCompletion(): void {
  const openApi = JSON.parse(read("docs/api/openapi.json")) as OpenApiDocument;
  const operations = collectOperations(openApi);
  if (operations.length < 221) {
    violations.push(`OpenAPI operation count regressed below 221; found ${operations.length}`);
  }

  const sourceOpenApi = read("docs/api/openapi.json");
  const frontendContractOpenApi = read("docs/api/frontend-contract/openapi.json");
  if (sourceOpenApi !== frontendContractOpenApi) {
    violations.push("docs/api/frontend-contract/openapi.json must match docs/api/openapi.json");
  }

  const completionReport = read("docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md");
  if (!completionReport.includes("| Planned new APIs | 0 |")) {
    violations.push("Backend API completion report must show zero planned new APIs");
  }
  if (!completionReport.includes("Total remaining planned new operations: **0**.")) {
    violations.push("Backend API completion report must show zero remaining planned operations");
  }
}

function collectOperations(spec: OpenApiDocument): string[] {
  const operations: string[] = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (methods[method]) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return operations;
}
