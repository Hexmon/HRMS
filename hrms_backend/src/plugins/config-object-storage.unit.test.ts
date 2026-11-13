import { describe, expect, it } from "vitest";
import { configSchema } from "./config.js";

const production = {
  NODE_ENV: "production",
  APP_ENV: "production",
  JWT_ACCESS_SECRET: "production-access-secret-value",
  JWT_REFRESH_SECRET: "production-refresh-secret-value",
  EMAIL_DELIVERY_MODE: "disabled",
  FRONTEND_URL: "https://hrms.example.test",
  OBJECT_STORAGE_DRIVER: "r2",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "environment-r2-access-key",
  R2_SECRET_ACCESS_KEY: "environment-r2-secret-key",
  R2_BUCKET_NAME: "hrms-private-production",
};

describe("private object storage configuration", () => {
  it("allows memory only in local and development environments", () => {
    expect(configSchema.safeParse({ APP_ENV: "local", OBJECT_STORAGE_DRIVER: "memory" }).success).toBe(true);
    expect(configSchema.safeParse({ APP_ENV: "development", NODE_ENV: "production", OBJECT_STORAGE_DRIVER: "memory" }).success).toBe(false);
    const hosted = configSchema.safeParse({ ...production, OBJECT_STORAGE_DRIVER: "memory" });
    expect(hosted.success).toBe(false);
    expect(hosted.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["OBJECT_STORAGE_DRIVER"] }),
    ]));
  });

  it("validates hosted account and bucket identifiers before startup", () => {
    const account = configSchema.safeParse({ ...production, R2_ACCOUNT_ID: "not-an-account" });
    expect(account.success).toBe(false);
    expect(account.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["R2_ACCOUNT_ID"] }),
    ]));

    const bucket = configSchema.safeParse({ ...production, R2_BUCKET_NAME: "Invalid_Bucket" });
    expect(bucket.success).toBe(false);
    expect(bucket.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["R2_BUCKET_NAME"] }),
    ]));
  });

  it("requires environment-owned R2 values whenever the R2 driver is selected", () => {
    const result = configSchema.safeParse({ APP_ENV: "development", OBJECT_STORAGE_DRIVER: "r2" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining([
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ]));
  });

  it("accepts a complete production R2 configuration", () => {
    const result = configSchema.safeParse(production);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.OBJECT_STORAGE_DRIVER).toBe("r2");
      expect(result.data.R2_ENDPOINT).toBeUndefined();
    }
  });

  it("rejects a hosted endpoint override and ignores obsolete provider variables", () => {
    const endpoint = configSchema.safeParse({ ...production, R2_ENDPOINT: "https://storage.example.test" });
    expect(endpoint.success).toBe(false);
    expect(endpoint.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["R2_ENDPOINT"] }),
    ]));

    const obsoleteOnly = configSchema.safeParse({
      NODE_ENV: "production",
      APP_ENV: "production",
      JWT_ACCESS_SECRET: production.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: production.JWT_REFRESH_SECRET,
      CLOUDINARY_CLOUD_NAME: "obsolete",
      CLOUDINARY_API_KEY: "obsolete",
      CLOUDINARY_API_SECRET: "obsolete",
    });
    expect(obsoleteOnly.success).toBe(false);
    expect(obsoleteOnly.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["OBJECT_STORAGE_DRIVER"] }),
    ]));
  });
});
