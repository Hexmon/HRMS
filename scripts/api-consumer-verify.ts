import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type OpenApiDocument = {
  openapi?: string;
  tags?: Array<{ name?: string }>;
  paths?: Record<string, Record<string, unknown>>;
};

const requiredDocs = [
  "docs/api/API_CONSUMER_GUIDE.md",
  "docs/api/API_CORE_GUIDE.md",
  "docs/api/API_ROLE_ENDPOINT_MATRIX.md",
  "docs/api/API_AUTH_SESSION_GUIDE.md",
  "docs/api/API_ERROR_RESPONSE_GUIDE.md",
  "docs/api/API_FINANCE_GUIDE.md",
  "docs/api/API_DOCUMENTS_GUIDE.md",
  "docs/api/API_EXPENSE_WORKFLOW_GUIDE.md",
  "docs/api/API_ASSETS_GUIDE.md",
  "docs/api/API_TIMESHEETS_GUIDE.md",
  "docs/api/API_REPORTS_GUIDE.md",
  "docs/api/API_SWAGGER_QA_CHECKLIST.md"
];


const requiredTags = [
  "Platform / Health",
  "Auth & Sessions",
  "Core / Employees & Hierarchy",
  "Expenses / Requester",
  "Expenses / Manager",
  "Finance Management",
  "Documents",
  "Assets",
  "Timesheets",
  "Reports & Analytics"
];

const failures: string[] = [];

verifyOpenApi();
verifyFiles(requiredDocs, "consumer guide");
verifyCollectionArtifacts();
verifyNoSecrets();

if (failures.length > 0) {
  console.error(`API consumer handoff verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("API consumer handoff verification passed.");

function verifyOpenApi(): void {
  const path = "docs/api/openapi.json";
  if (!existsSync(path)) {
    failures.push(`${path} is missing.`);
    return;
  }
  const spec = JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument;
  if (!spec.openapi?.startsWith("3.")) {
    failures.push("OpenAPI artifact must be OpenAPI 3.x.");
  }
  const login = spec.paths?.["/api/v1/auth/login"]?.post as {
    requestBody?: { content?: Record<string, { schema?: { required?: unknown[]; properties?: Record<string, unknown> } }> };
  } | undefined;
  const loginSchema = login?.requestBody?.content?.["application/json"]?.schema;
  if (!loginSchema?.required?.includes("email") || !loginSchema.required.includes("password") || !loginSchema.properties?.email || !loginSchema.properties.password) {
    failures.push("Login OpenAPI request body must require email and password.");
  }
  if (!loginSchema?.properties?.employee_code) {
    failures.push("Login OpenAPI request body must document DEV-only employee_code fallback.");
  }
  if (!(login as { responses?: Record<string, unknown> } | undefined)?.responses?.["429"]) {
    failures.push("Login OpenAPI operation must document rate limit response 429.");
  }

  const tags = new Set(spec.tags?.map((tag) => tag.name));
  for (const tag of requiredTags) {
    if (!tags.has(tag)) {
      failures.push(`OpenAPI missing required tag: ${tag}`);
    }
  }
}

function verifyFiles(paths: string[], label: string): void {
  for (const path of paths) {
    if (!existsSync(path)) {
      failures.push(`Missing ${label}: ${path}`);
      continue;
    }
    if (statSync(path).size < 200) {
      failures.push(`${label} appears too small: ${path}`);
    }
  }
}

function verifyCollectionArtifacts(): void {
  const postman = "docs/api/collections/hrms-platform.postman_collection.json";
  const curlSuite = "docs/api/collections/curl-smoke-tests.sh";
  if (!existsSync(postman)) {
    failures.push(`${postman} is missing.`);
  } else {
    const collection = JSON.parse(readFileSync(postman, "utf8")) as { item?: unknown[] };
    if (!Array.isArray(collection.item) || collection.item.length < 6) {
      failures.push(`${postman} must contain grouped API consumer requests.`);
    }
  }
  if (!existsSync(curlSuite)) {
    failures.push(`${curlSuite} is missing.`);
  } else {
    const script = readFileSync(curlSuite, "utf8");
    for (const marker of ["auth_login", "finance_queue", "documents_list", "asset_qr_scan", "timesheet_submit_example"]) {
      if (!script.includes(marker)) {
        failures.push(`${curlSuite} missing marker ${marker}.`);
      }
    }
  }
}

function verifyNoSecrets(): void {
  const roots = ["docs/api"];
  const forbidden = [
    /JWT_(ACCESS|REFRESH)_SECRET\s*=/iu,
    /OBJECT_STORAGE_SECRET_KEY\s*=/iu,
    /MINIO_ROOT_PASSWORD\s*=/iu,
    /VALKEY_PASSWORD\s*=/iu,
    /postgres:\/\/postgres:postgres/iu
  ];
  for (const root of roots) {
    for (const file of walk(root)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(content)) {
          failures.push(`${file} contains forbidden secret-like content matching ${pattern}.`);
        }
      }
    }
  }
}

function walk(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  const stat = statSync(path);
  if (!stat.isDirectory()) {
    return [path];
  }
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
