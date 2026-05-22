import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "../app.js";
import { createMemoryDataStore } from "../platform/data-store.js";
import { buildRealApp } from "./real-infra.js";

type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, unknown>;
};

type OpenApiDocument = {
  openapi?: string;
  tags?: Array<{ name?: string }>;
  paths?: Record<string, Record<string, Operation | undefined>>;
};

const protectedExceptions = new Set([
  "GET /health/live",
  "GET /health/ready",
  "GET /api/v1/health/live",
  "GET /api/v1/health/ready",
  "GET /api/v1/openapi.json",
  "POST /api/v1/auth/signup",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/onboarding/company-bootstrap",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/assets/scan/{qr_hash}"
]);

const expectedOperations = [
  "DELETE /api/v1/manager-backups/{id}",
  "GET /api/v1/assets/",
  "GET /api/v1/assets/{id}",
  "GET /api/v1/auth/me",
  "GET /api/v1/core/users",
  "GET /api/v1/core/users/{id}",
  "GET /api/v1/core/users/{id}/subtree",
  "GET /api/v1/documents",
  "GET /api/v1/documents/{id}",
  "GET /api/v1/documents/{id}/access-log",
  "GET /api/v1/expenses/my",
  "GET /api/v1/expenses/queue/finance",
  "GET /api/v1/expenses/queue/manager",
  "GET /api/v1/expenses/{id}",
  "GET /api/v1/expenses/{id}/audit",
  "GET /api/v1/expenses/{id}/finance-detail",
  "GET /api/v1/expenses/{id}/timeline",
  "GET /api/v1/health/live",
  "GET /api/v1/health/ready",
  "GET /api/v1/manager-backups",
  "GET /api/v1/openapi.json",
  "GET /api/v1/platform/finance-governance",
  "GET /api/v1/reports/expenses/advance-aging",
  "GET /api/v1/reports/expenses/audit",
  "GET /api/v1/reports/expenses/finance-analytics",
  "GET /api/v1/reports/expenses/finance-dashboard",
  "GET /api/v1/reports/expenses/finance-history",
  "GET /api/v1/reports/expenses/manager-history",
  "GET /api/v1/reports/expenses/manager-queue",
  "GET /api/v1/reports/expenses/my",
  "GET /api/v1/reports/expenses/payments",
  "GET /api/v1/reports/expenses/register",
  "GET /api/v1/timesheets/queue/approver",
  "GET /api/v1/timesheets/submissions/my",
  "GET /api/v1/timesheets/work-segments",
  "GET /api/v1/timesheets/workflow-definitions",
  "GET /health/live",
  "GET /health/ready",
  "PATCH /api/v1/auth/session/preference",
  "PATCH /api/v1/expenses/{id}",
  "POST /api/v1/assets/",
  "POST /api/v1/assets/events/employee-terminated",
  "POST /api/v1/assets/licenses/activate",
  "POST /api/v1/assets/licenses/revoke",
  "POST /api/v1/assets/licenses/validate",
  "POST /api/v1/assets/scan/{qr_hash}",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/signup",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/documents",
  "POST /api/v1/documents/{id}/download-url",
  "POST /api/v1/documents/{id}/verify",
  "POST /api/v1/expenses",
  "POST /api/v1/expenses/{id}/bills",
  "POST /api/v1/expenses/{id}/documents",
  "POST /api/v1/expenses/{id}/documents/{documentId}/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/manager-backups",
  "POST /api/v1/onboarding/company-bootstrap",
  "POST /api/v1/reports/exports",
  "POST /api/v1/timesheets/submissions",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "POST /api/v1/timesheets/work-segments",
  "POST /api/v1/timesheets/workflow-definitions",
  "PUT /api/v1/platform/finance-governance"
] as const;

const bodyRequiredOperations = [
  "POST /api/v1/onboarding/company-bootstrap",
  "POST /api/v1/auth/password-reset/confirm",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/set-password",
  "POST /api/v1/auth/email-verifications/resend",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/signup",
  "PATCH /api/v1/auth/session/preference",
  "POST /api/v1/auth/login",
  "POST /api/v1/expenses",
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/bills",
  "POST /api/v1/expenses/{id}/documents",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/documents",
  "POST /api/v1/assets/",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/assets/events/employee-terminated",
  "POST /api/v1/assets/licenses/activate",
  "POST /api/v1/assets/licenses/revoke",
  "POST /api/v1/assets/licenses/validate",
  "POST /api/v1/timesheets/work-segments",
  "POST /api/v1/timesheets/submissions",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "POST /api/v1/timesheets/workflow-definitions",
  "POST /api/v1/manager-backups",
  "POST /api/v1/reports/exports",
  "PUT /api/v1/platform/finance-governance"
];

const occOperations = [
  "POST /api/v1/expenses/{id}/submit",
  "POST /api/v1/expenses/{id}/manager/verify",
  "POST /api/v1/expenses/{id}/finance/approve",
  "POST /api/v1/expenses/{id}/finance/payment",
  "POST /api/v1/expenses/{id}/settlement",
  "POST /api/v1/assets/{id}/assign",
  "POST /api/v1/assets/{id}/return",
  "POST /api/v1/timesheets/submissions/{id}/approve",
  "DELETE /api/v1/manager-backups/{id}"
];

const listOperations = [
  "GET /api/v1/core/users",
  "GET /api/v1/expenses/my",
  "GET /api/v1/expenses/queue/manager",
  "GET /api/v1/expenses/queue/finance",
  "GET /api/v1/manager-backups",
  "GET /api/v1/documents",
  "GET /api/v1/documents/{id}/access-log",
  "GET /api/v1/reports/expenses/my",
  "GET /api/v1/reports/expenses/manager-queue",
  "GET /api/v1/reports/expenses/manager-history",
  "GET /api/v1/reports/expenses/finance-history",
  "GET /api/v1/reports/expenses/register",
  "GET /api/v1/reports/expenses/advance-aging",
  "GET /api/v1/reports/expenses/payments",
  "GET /api/v1/reports/expenses/audit",
  "GET /api/v1/assets/",
  "GET /api/v1/timesheets/work-segments",
  "GET /api/v1/timesheets/submissions/my",
  "GET /api/v1/timesheets/queue/approver",
  "GET /api/v1/timesheets/workflow-definitions"
];

describe("API contracts", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("exposes OpenAPI and typed health responses", async () => {
    const health = await app.inject({ method: "GET", url: "/health/live" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok", service: "hawkaii-hrms-api" });

    const versionedHealth = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(versionedHealth.statusCode).toBe(200);
    expect(versionedHealth.json()).toEqual({ status: "ok", service: "hawkaii-hrms-api" });

    const openapi = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().info.title).toBe("Hawkaii HRMS API");

    const docs = await app.inject({ method: "GET", url: "/docs" });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
  });

  it("returns typed OCC errors", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/expenses/my"
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().request_id).toBeDefined();
    expect(response.json().code).toBe("UNAUTHORIZED");
  });

  it("documents the auth login request body and error responses for Swagger try-it-out", async () => {
    const spec = await openApiSpec(app);
    const login = operation(spec, "POST /api/v1/auth/login");
    const schema = login.requestBody?.content?.["application/json"]?.schema;

    expect(login.tags).toEqual(["Auth & Sessions"]);
    expect(login.security).toEqual([]);
    expect(schema?.required).toContain("email");
    expect(schema?.required).toContain("password");
    expect((schema?.properties as Record<string, unknown>).email).toBeDefined();
    expect((schema?.properties as Record<string, unknown>).password).toBeDefined();
    expect((schema?.properties as Record<string, unknown>).employee_code).toBeDefined();
    for (const statusCode of ["200", "400", "401", "403", "429", "500"]) {
      expect(login.responses?.[statusCode]).toBeDefined();
    }
  });

  it("rate limits API clients with typed 429 responses while leaving health checks open", async () => {
    const limitedApp = await buildApp({
      dataStore: createMemoryDataStore(),
      rateLimit: {
        authMax: 5,
        readMax: 2,
        writeMax: 2,
        windowSeconds: 60
      }
    });
    try {
      await limitedApp.ready();
      const login = await limitedApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "finance@example.test", password: "LocalDev@123" }
      });
      expect(login.statusCode).toBe(200);
      const token = login.json().access_token as string;

      const firstRead = await limitedApp.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
      const secondRead = await limitedApp.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
      const limitedRead = await limitedApp.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
      expect(firstRead.statusCode).toBe(200);
      expect(secondRead.statusCode).toBe(200);
      expect(limitedRead.statusCode).toBe(429);
      expect(limitedRead.json()).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please wait and try again."
      });
      expect(limitedRead.json().details.retry_after_seconds).toBeGreaterThan(0);
      expect(limitedRead.json().request_id).toBeDefined();
      expect(limitedRead.headers["retry-after"]).toBeDefined();
      expect(limitedRead.headers["x-ratelimit-limit"]).toBe("2");

      for (let index = 0; index < 4; index += 1) {
        const invalid = await limitedApp.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { email: "finance@example.test", password: "wrong-password" }
        });
        expect([401, 429]).toContain(invalid.statusCode);
      }
      const limitedLogin = await limitedApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "finance@example.test", password: "wrong-password" }
      });
      expect(limitedLogin.statusCode).toBe(429);
      expect(limitedLogin.json().code).toBe("TOO_MANY_REQUESTS");

      const health = await limitedApp.inject({ method: "GET", url: "/api/v1/health/live" });
      expect(health.statusCode).toBe(200);
    } finally {
      await limitedApp.close();
    }
  });

  it("returns the documented validation error for empty or invalid login bodies", async () => {
    const emptyBody = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: ""
    });
    expect(emptyBody.statusCode).toBe(400);
    expect(emptyBody.json().code).toBe("VALIDATION_FAILED");
    expect(emptyBody.json().request_id).toBeDefined();

    const invalidBody = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {}
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json().code).toBe("VALIDATION_FAILED");
    expect(invalidBody.json().details.fieldErrors.email).toBeDefined();
    expect(invalidBody.json().details.fieldErrors.password).toBeDefined();
  });

  it("authenticates email/password and keeps invalid credential errors generic", async () => {
    const success = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "finance@example.test", password: "LocalDev@123" }
    });
    expect(success.statusCode).toBe(200);
    expect(success.json().access_token).toBeTruthy();
    expect(success.json().user.email).toBe("finance@example.test");
    expect(JSON.stringify(success.json())).not.toContain("password_hash");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "finance@example.test", password: "wrong-password" }
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().message).toBe("Invalid email or password");
    expect(JSON.stringify(invalid.json())).not.toContain("LocalDev@123");
  });

  it("keeps logout idempotent for stale or missing local sessions", async () => {
    const noSession = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout"
    });
    expect(noSession.statusCode).toBe(200);
    expect(noSession.json()).toEqual({ status: "ok" });
    expect(noSession.headers["set-cookie"]).toBeDefined();

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "finance@example.test", password: "LocalDev@123" }
    });
    const cookie = login.headers["set-cookie"];
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? "" }
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ status: "ok" });
  });

  it("documents tags, success schemas, security, params, and list query contracts", async () => {
    const spec = await openApiSpec(app);
    const rows = operations(spec);

    expect(spec.openapi).toBe("3.0.3");
    expect(rows.map((row) => row.key).sort()).toEqual([...expectedOperations].sort());
    expect(rows.length).toBe(76);

    for (const row of rows) {
      expect(row.operation.tags?.length, `${row.key} tag`).toBeGreaterThan(0);
      expect(row.operation.summary || row.operation.description, `${row.key} summary`).toBeTruthy();
      expect(Object.keys(row.operation.responses ?? {}).some((status) => status.startsWith("2")), `${row.key} 2xx response`).toBe(true);
      if (!protectedExceptions.has(row.key)) {
        expect(row.operation.security?.length, `${row.key} security`).toBeGreaterThan(0);
      }
      for (const param of row.path.matchAll(/\{([^}]+)\}/gu)) {
        expect(
          row.operation.parameters?.some((documented) => documented.in === "path" && documented.name === param[1] && documented.required !== false),
          `${row.key} path parameter ${param[1]}`
        ).toBe(true);
      }
    }

    for (const key of listOperations) {
      const documented = operation(spec, key).parameters?.some((parameter) => parameter.in === "query" && parameter.name === "page");
      expect(documented, `${key} pagination query`).toBe(true);
    }
  });

  it("omits removed reviewer/director expense surfaces from OpenAPI", async () => {
    const spec = await openApiSpec(app);
    const serializedPaths = JSON.stringify(spec.paths ?? {});

    for (const removedPath of [
      "/api/v1/expenses/queue/reviewer",
      "/api/v1/expenses/queue/director",
      "/api/v1/expenses/{id}/review",
      "/api/v1/expenses/{id}/approve",
      "/api/v1/reports/expenses/director-dashboard"
    ]) {
      expect(serializedPaths).not.toContain(removedPath);
    }
  });

  it("documents finance bodies, grouping, and OCC 409 responses", async () => {
    const spec = await openApiSpec(app);

    for (const key of bodyRequiredOperations) {
      expect(hasJsonBody(operation(spec, key)), `${key} request body`).toBe(true);
    }

    for (const key of occOperations) {
      expect(operation(spec, key).responses?.["409"], `${key} OCC response`).toBeDefined();
    }

    const financeKeys = operations(spec)
      .filter(({ path }) =>
        path.includes("/queue/finance") ||
        path.includes("/finance-detail") ||
        path.includes("/finance/") ||
        path.includes("/settlement") ||
        path.includes("/finance-analytics") ||
        path.includes("/finance-dashboard") ||
        path.includes("/advance-aging") ||
        path.includes("/payments")
      )
      .map(({ key }) => key);
    expect(financeKeys.length).toBeGreaterThan(0);
    for (const key of financeKeys) {
      expect(operation(spec, key).tags).toContain("Finance Management");
    }
  });

  it("documents hierarchy subtree and expense timeline consumer shapes", async () => {
    const spec = await openApiSpec(app);
    const subtree = operation(spec, "GET /api/v1/core/users/{id}/subtree");
    const timeline = operation(spec, "GET /api/v1/expenses/{id}/timeline");
    const subtreeSerialized = JSON.stringify(subtree);
    const timelineSerialized = JSON.stringify(timeline);

    expect(subtree.summary).toBe("Hierarchy subordinate subtree");
    expect(subtreeSerialized).toContain("total_active_descendants");
    expect(subtreeSerialized).toContain("max_depth");
    expect(subtreeSerialized).toContain("depth");
    expect(subtreeSerialized).toContain("HR Manager");

    expect(timeline.summary).toBe("Expense workflow timeline");
    for (const field of ["event_type", "label", "stage", "actor_name", "status_from", "status_to"]) {
      expect(timelineSerialized).toContain(field);
    }
  });

  it("documents expanded auth/core session and employee detail contracts", async () => {
    const spec = await openApiSpec(app);
    const sessionSerialized = JSON.stringify(operation(spec, "GET /api/v1/auth/me"));
    const usersSerialized = JSON.stringify(operation(spec, "GET /api/v1/core/users"));
    const userDetailSerialized = JSON.stringify(operation(spec, "GET /api/v1/core/users/{id}"));

    for (const field of ["active_role", "available_roles", "permissions", "navigation", "company", "preferences", "session_metadata", "low_bandwidth_defaults"]) {
      expect(sessionSerialized).toContain(field);
    }
    for (const field of ["department_id", "designation_id", "manager_user_id", "login_state", "filters_applied", "total_visible"]) {
      expect(usersSerialized).toContain(field);
    }
    for (const field of ["reporting_line", "role_assignments", "documents_summary", "assets_summary", "attendance_summary", "leave_summary", "timesheet_summary", "expense_summary", "profile_tabs_available"]) {
      expect(userDetailSerialized).toContain(field);
    }
  });

  it("keeps OpenAPI examples secret-free and standalone backend-free of frontend imports", async () => {
    const spec = await openApiSpec(app);
    const serialized = JSON.stringify(spec);

    expect(serialized).not.toMatch(/JWT_(ACCESS|REFRESH)_SECRET/iu);
    expect(serialized).not.toMatch(/OBJECT_STORAGE_SECRET_KEY|MINIO_ROOT_PASSWORD|VALKEY_PASSWORD/iu);
    expect(serialized).not.toMatch(/minioadmin|postgres:\/\/postgres:postgres/iu);

    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(packageJson).not.toMatch(/"(?:next|react|react-dom)"\s*:/u);

    for (const file of walkTsFiles(join(process.cwd(), "src"))) {
      if (file.includes("/__tests__/") || /\.(test|unit|integration|contract|e2e)\.ts$/u.test(file)) {
        continue;
      }
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/\bfrom\s+["'](?:next|react|react-dom)(?:\/[^"']*)?["']/u);
      expect(content, file).not.toMatch(/apps\/(?:web|finance-web|documents-web|assets-web)|NEXT_PUBLIC_/u);
    }
  });
});

async function openApiSpec(app: FastifyInstance): Promise<OpenApiDocument> {
  const response = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
  expect(response.statusCode).toBe(200);
  return response.json() as OpenApiDocument;
}

function operations(spec: OpenApiDocument): Array<{ key: string; method: string; path: string; operation: Operation }> {
  const rows: Array<{ key: string; method: string; path: string; operation: Operation }> = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const endpoint = pathItem[method];
      if (endpoint) {
        const upperMethod = method.toUpperCase();
        rows.push({ key: `${upperMethod} ${path}`, method: upperMethod, path, operation: endpoint });
      }
    }
  }
  return rows;
}

function operation(spec: OpenApiDocument, key: string): Operation {
  const found = operations(spec).find((row) => row.key === key)?.operation;
  expect(found, key).toBeDefined();
  return found as Operation;
}

function hasJsonBody(operation: Operation): boolean {
  return Boolean(operation.requestBody?.content?.["application/json"]?.schema);
}

function walkTsFiles(dir: string): string[] {
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "dist"].includes(entry)) {
      continue;
    }
    const child = join(dir, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) {
      files.push(...walkTsFiles(child));
    } else if (/\.(ts|tsx)$/u.test(child)) {
      files.push(child);
    }
  }
  return files;
}
