import { describe, expect, it } from "vitest";
import { requireLocalTestEnvironment } from "../../../qa-artifacts/hrms/discovery-2026-11-09/disposable-probe-guard.js";

const local = {
  TEST_DATABASE_URL: "postgresql://local:sample@127.0.0.1:55432/hrms_platform_test",
  VALKEY_URL: "redis://127.0.0.1:56379",
  APP_ENV: "local",
  EMAIL_DELIVERY_MODE: "log",
  CLOUDINARY_MOCK_UPLOADS: "true"
};

describe("disposable asset probe guard", () => {
  it("accepts only the configured disposable local services", () => {
    expect(() => requireLocalTestEnvironment(local)).not.toThrow();
  });

  it.each([
    "?host=remote.example",
    "?port=5432",
    "#host=remote.example"
  ])("rejects database URL suffix %s before any reset", (suffix) => {
    expect(() => requireLocalTestEnvironment({
      ...local,
      TEST_DATABASE_URL: `${local.TEST_DATABASE_URL}${suffix}`
    })).toThrow(/Refusing non-disposable TEST_DATABASE_URL/);
  });

  it("rejects a Valkey URL override and unsafe delivery mode", () => {
    expect(() => requireLocalTestEnvironment({
      ...local,
      VALKEY_URL: `${local.VALKEY_URL}?host=remote.example`
    })).toThrow(/Refusing non-local VALKEY_URL/);
    expect(() => requireLocalTestEnvironment({
      ...local,
      EMAIL_DELIVERY_MODE: "send"
    })).toThrow(/Refusing non-local application delivery configuration/);
  });
});
