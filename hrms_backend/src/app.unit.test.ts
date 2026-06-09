import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createMemoryDataStore, type DataStorePersistence } from "./platform/data-store.js";

describe("app persistence flushing", () => {
  const originalAppEnv = process.env.APP_ENV;

  afterEach(() => {
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
  });

  it("uses auth-only persistence for signup, email verification, and password setup mutations", async () => {
    process.env.APP_ENV = "local";
    const store = createMemoryDataStore();
    let fullFlushCount = 0;
    let authFlushCount = 0;
    const authFlushOptions: Parameters<NonNullable<DataStorePersistence["flushAuth"]>>[0][] = [];
    const persistence: DataStorePersistence = {
      async flush() {
        fullFlushCount += 1;
      },
      async flushAuth(options) {
        authFlushCount += 1;
        authFlushOptions.push(options);
      },
      async reload() {},
      async close() {}
    };
    store.persistence = persistence;

    const app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
    try {
      const signup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          company_name: "Persistence Test",
          full_name: "Persistence User",
          email: "persistence.user@example.test",
          timezone: "Asia/Kolkata"
        }
      });
      expect(signup.statusCode).toBe(200);
      expect(authFlushCount).toBe(1);
      expect(fullFlushCount).toBe(0);
      expect(authFlushOptions[0]?.userIds).toContain(signup.json().signup_id);

      const verificationToken = signup.json().dev_only.email_verification_token;
      expect(typeof verificationToken).toBe("string");

      const verifyEmail = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        payload: { token: verificationToken }
      });
      expect(verifyEmail.statusCode).toBe(200);
      expect(authFlushCount).toBe(2);
      expect(fullFlushCount).toBe(0);
      expect(authFlushOptions[1]?.userIds).toContain(verifyEmail.json().user_id);

      const passwordSetupToken = verifyEmail.json().dev_only.password_setup_token;
      expect(typeof passwordSetupToken).toBe("string");

      const setPassword = await app.inject({
        method: "POST",
        url: "/api/v1/auth/set-password",
        payload: {
          token: passwordSetupToken,
          password: "Asdf@12345",
          confirm_password: "Asdf@12345"
        }
      });
      expect(setPassword.statusCode).toBe(200);
      expect(authFlushCount).toBe(3);
      expect(fullFlushCount).toBe(0);
      expect(authFlushOptions[2]?.userIds).toContain(setPassword.json().user_id);
    } finally {
      await app.close();
    }
  });
});
