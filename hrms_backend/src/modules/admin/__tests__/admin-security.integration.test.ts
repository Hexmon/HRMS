import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../app.js";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin security settings", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("persists admin security settings with OCC and enforces password and session basics", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const read = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(admin.token)
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      settings_key: "default",
      password_min_length: 10,
      password_require_number: true,
      password_require_special: false,
      session_timeout_minutes: 60,
      login_attempt_limit: 10,
      mfa_enabled: false,
      version: 1
    });

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(admin.token),
      payload: {
        password_min_length: 12,
        password_require_special: true,
        session_timeout_minutes: 5,
        login_attempt_limit: 5,
        audit_role_changes: true,
        ip_device_audit_enabled: true,
        expected_version: 1
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().settings).toMatchObject({
      password_min_length: 12,
      password_require_special: true,
      session_timeout_minutes: 5,
      login_attempt_limit: 5,
      mfa_enabled: false,
      version: 2
    });
    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.security_settings.updated");

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(admin.token),
      payload: { password_min_length: 14, expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);

    const resetRequest = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "e1@example.test" }
    });
    expect(resetRequest.statusCode).toBe(200);
    const token = resetRequest.json().dev_only.password_reset_token;
    expect(typeof token).toBe("string");

    const weakPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, password: "NoSpecial123", confirm_password: "NoSpecial123" }
    });
    expect(weakPassword.statusCode).toBe(400);
    expect(weakPassword.json().message).toContain("security policy");

    const strongPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token, password: "With@Special123", confirm_password: "With@Special123" }
    });
    expect(strongPassword.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "e1@example.test", password: "With@Special123" }
    });
    expect(login.statusCode).toBe(200);
    const expiresAt = Date.parse(login.json().expires_at);
    expect(expiresAt - Date.now()).toBeGreaterThan(4 * 60 * 1000);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 5_000);
  });

  it("uses the configured auth attempt limit for login rate limiting", async () => {
    const rateLimitedApp = await buildApp({ rateLimit: { authMax: 10 } });
    await rateLimitedApp.ready();
    try {
      rateLimitedApp.store.adminSecuritySettings.login_attempt_limit = 1;

      const first = await rateLimitedApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "missing@example.test", password: "WrongPass123" }
      });
      expect(first.statusCode).toBe(401);

      const second = await rateLimitedApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "missing@example.test", password: "WrongPass123" }
      });
      expect(second.statusCode).toBe(429);
      expect(second.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    } finally {
      await rateLimitedApp.close();
    }
  });
});
