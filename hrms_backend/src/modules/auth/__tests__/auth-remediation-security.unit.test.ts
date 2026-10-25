import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmploymentStatuses, Roles, type AuthUser, type DocumentMetadata } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore, type DataStore } from "../../../platform/data-store.js";
import { canAccessDocument } from "../../documents/policy.js";

describe("auth remediation security invariants", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let app: FastifyInstance | undefined;
  let store: DataStore;

  beforeEach(() => {
    originalEnv = { ...process.env };
    configureLocalEnvironment();
    store = createMemoryDataStore();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = originalEnv;
  });

  it("T22 rejects employee-code login in hosted QA", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "qa";
    process.env.COOKIE_SECURE = "true";
    process.env.CLOUDINARY_MOCK_UPLOADS = "false";
    app = await buildApp({ dataStore: store, rateLimit: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { employee_code: "ADM" },
    });

    expect(response.statusCode).toBe(401);

    const passwordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "admin@example.test",
        password: "UnitTest@123",
      },
    });
    expect(passwordLogin.statusCode).toBe(200);
  });

  it("T06 rejects employee-code login for an inactive account", async () => {
    const employee = store.users.find((user) => user.employee_code === "E1")!;
    employee.employment_status = EmploymentStatuses.Suspended;
    app = await localApp(store);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { employee_code: "E1" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("T06 rejects a previously issued session after employment suspension", async () => {
    app = await localApp(store);
    const employee = await loginAs(app, "E1");
    const record = store.users.find((user) => user.id === employee.user.id)!;
    record.employment_status = EmploymentStatuses.Suspended;

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(employee.token),
    });

    expect(response.statusCode).toBe(401);
  });

  it("T07 blocks protected operations when the assigned company is suspended", async () => {
    app = await localApp(store);
    const employee = await loginAs(app, "E1");
    const preference = store.userSessionPreferences.find(
      (candidate) => candidate.user_id === employee.user.id,
    )!;
    const company = store.companyProfiles.find(
      (candidate) => candidate.id === preference.company_id,
    )!;
    company.status = "inactive";

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/documents/upload-policy",
      headers: authHeader(employee.token),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("COMPANY_CONTEXT_REQUIRED");
  });

  it("T15 prevents a different email from claiming an existing pending company slug", async () => {
    app = await localApp(store);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: signupPayload("founder@example.test", "reserved-workspace"),
    });
    expect(first.statusCode).toBe(200);

    const takeover = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: signupPayload("attacker@example.test", "reserved-workspace"),
    });

    expect(takeover.statusCode).toBe(409);
  });

  it("T09 revokes existing sessions when an administrator replaces roles", async () => {
    app = await localApp(store);
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const target = store.users.find((user) => user.id === employee.user.id)!;

    const changed = await app.inject({
      method: "PUT",
      url: `/api/v1/core/users/${target.id}/roles`,
      headers: authHeader(admin.token),
      payload: {
        roles: [Roles.Employee, Roles.Reviewer],
        expected_version: target.version,
        remarks: "Security regression test",
      },
    });
    expect(changed.statusCode).toBe(200);

    const staleSession = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(employee.token),
    });
    expect(staleSession.statusCode).toBe(401);
  });

  it("T06 revokes existing sessions when an administrator deactivates a user", async () => {
    app = await localApp(store);
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const target = store.users.find((user) => user.id === employee.user.id)!;

    const deactivated = await app.inject({
      method: "POST",
      url: `/api/v1/core/users/${target.id}/deactivate`,
      headers: authHeader(admin.token),
      payload: {
        status: EmploymentStatuses.Suspended,
        expected_version: target.version,
        reason: "Security regression test",
      },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().sessions_revoked).toBeGreaterThanOrEqual(1);

    const staleSession = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(employee.token),
    });
    expect(staleSession.statusCode).toBe(401);
  });

  it("T04 prevents an HR user from changing their own role assignment", async () => {
    const hrUser = store.users.find((user) => user.employee_code === "E2")!;
    hrUser.roles = [Roles.Employee, Roles.HRManager];
    app = await localApp(store);
    const hr = await loginAs(app, "E2");

    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/core/users/${hr.user.id}/roles`,
      headers: authHeader(hr.token),
      payload: {
        roles: [Roles.Employee, Roles.HRManager, Roles.FinanceManager],
        expected_version: hrUser.version,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("T31 prevents direct replacement of a verified privileged account email", async () => {
    const hrUser = store.users.find((user) => user.employee_code === "E2")!;
    hrUser.roles = [Roles.Employee, Roles.HRManager];
    const adminUser = store.users.find((user) => user.employee_code === "ADM")!;
    app = await localApp(store);
    const hr = await loginAs(app, "E2");

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/core/users/${adminUser.id}`,
      headers: authHeader(hr.token),
      payload: {
        email: "attacker-controlled@example.test",
        expected_version: adminUser.version,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(adminUser.email).toBe("admin@example.test");
  });

  it("allows correction of an unverified employee email before credentials or tokens exist", async () => {
    app = await localApp(store);
    const admin = await loginAs(app, "ADM");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/core/users",
      headers: authHeader(admin.token),
      payload: {
        employee_code: "NEWEMAIL1",
        email: "typo@example.test",
        full_name: "Email Correction User",
        department_id: admin.user.department_id,
        designation_id: admin.user.designation_id,
        employment_status: EmploymentStatuses.Inactive,
        login_enabled: false,
      },
    });
    expect(created.statusCode).toBe(200);

    const corrected = await app.inject({
      method: "PATCH",
      url: `/api/v1/core/users/${created.json().id}`,
      headers: authHeader(admin.token),
      payload: {
        email: "corrected@example.test",
        expected_version: created.json().version,
      },
    });

    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().email).toBe("corrected@example.test");
  });

  it("T21 keeps Auditor document access read-only", () => {
    const auditor = store.users.find((user) => user.employee_code === "AUD")!;
    const document = sampleDocument(store.users[0]!.id);

    expect(canAccessDocument(auditor, document, "read")).toBe(true);
    expect(canAccessDocument(auditor, document, "audit")).toBe(true);
    expect(canAccessDocument(auditor, document, "write")).toBe(false);
    expect(canAccessDocument(auditor, document, "verify")).toBe(false);
  });

  it("T24 rejects an untrusted Origin on cookie-authenticated mutations", async () => {
    app = await localApp(store);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { employee_code: "E1" },
    });
    const cookie = sessionCookie(login.headers["set-cookie"]);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/session/preference",
      headers: {
        cookie,
        origin: "https://attacker.example",
      },
      payload: { locale: "en-IN" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("T24 rejects a missing Origin on cookie-authenticated mutations", async () => {
    app = await localApp(store);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { employee_code: "E1" },
    });
    const cookie = sessionCookie(login.headers["set-cookie"]);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/session/preference",
      headers: { cookie },
      payload: { locale: "en-IN" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows a trusted Origin on cookie-authenticated mutations", async () => {
    app = await localApp(store);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { employee_code: "E1" },
    });
    const cookie = sessionCookie(login.headers["set-cookie"]);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/session/preference",
      headers: {
        cookie,
        origin: "https://hrms.example.test",
      },
      payload: { locale: "en-IN" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("allows Bearer-authenticated API mutations without a browser Origin", async () => {
    app = await localApp(store);
    const employee = await loginAs(app, "E1");

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/session/preference",
      headers: authHeader(employee.token),
      payload: { locale: "en-IN" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("marks authentication responses as non-cacheable", async () => {
    app = await localApp(store);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { employee_code: "E1" },
    });

    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers.pragma).toBe("no-cache");
  });
});

function configureLocalEnvironment(): void {
  process.env.NODE_ENV = "development";
  process.env.APP_ENV = "local";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-long-enough";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-long-enough";
  process.env.EMAIL_DELIVERY_MODE = "disabled";
  process.env.FRONTEND_URL = "https://hrms.example.test";
  process.env.API_BASE_URL = "http://localhost:3001";
  process.env.CORS_ALLOWED_ORIGINS = "https://hrms.example.test";
  process.env.CLOUDINARY_MOCK_UPLOADS = "true";
  process.env.COOKIE_SECURE = "false";
  process.env.LOCAL_DEMO_PASSWORD = "UnitTest@123";
}

async function localApp(store: DataStore): Promise<FastifyInstance> {
  const instance = await buildApp({ dataStore: store, rateLimit: false });
  await instance.ready();
  return instance;
}

function signupPayload(email: string, companySlug: string) {
  return {
    company_name: "Reserved Workspace",
    company_slug: companySlug,
    full_name: "Workspace Founder",
    email,
    password: "StrongPassword123!",
    timezone: "Asia/Kolkata",
  };
}

function sampleDocument(ownerUserId: string): DocumentMetadata {
  const now = "2026-10-25T00:00:00.000Z";
  return {
    id: "00000000-0000-4000-8000-000000000001",
    business_object_type: "employee",
    business_object_id: ownerUserId,
    owner_user_id: ownerUserId,
    classification: "normal",
    document_type: "identity_proof",
    current_version: 1,
    file_name: "identity.pdf",
    storage_key: "documents/identity.pdf",
    mime_type: "application/pdf",
    size_bytes: 128,
    checksum_sha256: null,
    metadata: {},
    created_by_user_id: ownerUserId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

function sessionCookie(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected login to set a session cookie");
  return value.split(";", 1)[0]!;
}
