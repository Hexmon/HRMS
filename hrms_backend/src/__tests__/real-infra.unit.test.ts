import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  buildApp: vi.fn(),
  resetPostgresDatabase: vi.fn(),
}));

vi.mock("../app.js", () => ({ buildApp: mocks.buildApp }));
vi.mock("../platform/postgres-data-store.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../platform/postgres-data-store.js")>(),
  resetPostgresDatabase: mocks.resetPostgresDatabase,
}));

import { buildRealApp } from "./real-infra.js";

const disposableUrl = "postgresql://test@127.0.0.1:5432/hrms_ci_test";
const previousUrl = "postgresql://app@db.example/hrms_prod";
const savedEnvironment = {
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  databaseUrl: process.env.DATABASE_URL,
  resetOverride: process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET,
};

const apps: FastifyInstance[] = [];

function fakeApp(): FastifyInstance {
  let closeHook: (() => Promise<void>) | undefined;
  const app = {
    addHook(name: string, hook: () => Promise<void>) {
      expect(name).toBe("onClose");
      closeHook = hook;
    },
    async close() {
      await closeHook?.();
    },
  } as unknown as FastifyInstance;
  apps.push(app);
  return app;
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("real integration app database guard", () => {
  beforeEach(() => {
    process.env.TEST_DATABASE_URL = disposableUrl;
    process.env.DATABASE_URL = previousUrl;
    delete process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET;
    mocks.buildApp.mockReset().mockImplementation(async () => fakeApp());
    mocks.resetPostgresDatabase.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    for (const app of apps.splice(0).reverse()) await app.close();
    restore("TEST_DATABASE_URL", savedEnvironment.testDatabaseUrl);
    restore("DATABASE_URL", savedEnvironment.databaseUrl);
    restore("HRMS_ALLOW_DATABASE_URL_TEST_RESET", savedEnvironment.resetOverride);
  });

  it("opens a non-resetting second instance and restores the prior URL after reverse close", async () => {
    const first = await buildRealApp();
    const second = await buildRealApp({ reset: false });
    expect(mocks.resetPostgresDatabase).toHaveBeenCalledExactlyOnceWith(disposableUrl);
    expect(mocks.buildApp).toHaveBeenCalledTimes(2);
    await second.close();
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    await first.close();
    expect(process.env.DATABASE_URL).toBe(previousUrl);
  });

  it("restores the prior URL even when the first instance closes before the second", async () => {
    const first = await buildRealApp();
    const second = await buildRealApp({ reset: false });
    await first.close();
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    await second.close();
    expect(process.env.DATABASE_URL).toBe(previousUrl);
  });

  it("refuses an actual reset of the same local database despite different URL spelling", async () => {
    process.env.DATABASE_URL = "postgresql://other@localhost/hrms_ci_test";
    await expect(buildRealApp()).rejects.toThrow("Refusing to reset DATABASE_URL");
    expect(mocks.resetPostgresDatabase).not.toHaveBeenCalled();
    expect(mocks.buildApp).not.toHaveBeenCalled();
  });

  it("refuses remote and query-rerouted targets even without a reset", async () => {
    for (const unsafeUrl of [
      "postgresql://test@db.example/hrms_ci_test",
      "postgresql://test@127.0.0.1/hrms_ci_test?host=db.example",
    ]) {
      process.env.TEST_DATABASE_URL = unsafeUrl;
      await expect(buildRealApp({ reset: false })).rejects.toThrow("Refusing database reset outside a local disposable test database");
    }
    expect(mocks.resetPostgresDatabase).not.toHaveBeenCalled();
    expect(mocks.buildApp).not.toHaveBeenCalled();
  });

  it("allows an explicit same-URL reset override only for a disposable local target", async () => {
    process.env.DATABASE_URL = disposableUrl;
    process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = "true";
    const app = await buildRealApp();
    expect(mocks.resetPostgresDatabase).toHaveBeenCalledExactlyOnceWith(disposableUrl);
    await app.close();
    process.env.TEST_DATABASE_URL = "postgresql://test@db.example/hrms_ci_test";
    await expect(buildRealApp()).rejects.toThrow("Refusing database reset outside a local disposable test database");
    expect(mocks.resetPostgresDatabase).toHaveBeenCalledTimes(1);
  });

  it("rejects switching test databases while an app is open without losing the active URL", async () => {
    const first = await buildRealApp({ reset: false });
    process.env.TEST_DATABASE_URL = "postgresql://test@127.0.0.1:5432/hrms_other_test";
    await expect(buildRealApp()).rejects.toThrow("different test database");
    expect(mocks.resetPostgresDatabase).not.toHaveBeenCalled();
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    await first.close();
    expect(process.env.DATABASE_URL).toBe(previousUrl);
  });

  it("never resets the shared test database while another app is open", async () => {
    const first = await buildRealApp();
    process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET = "true";
    await expect(buildRealApp()).rejects.toThrow("another test app is open");
    expect(mocks.resetPostgresDatabase).toHaveBeenCalledTimes(1);
    await first.close();
  });

  it("restores an absent prior URL when app startup fails and permits a later app", async () => {
    delete process.env.DATABASE_URL;
    mocks.buildApp.mockRejectedValueOnce(new Error("synthetic app startup failure"));
    await expect(buildRealApp({ reset: false })).rejects.toThrow("synthetic app startup failure");
    expect(process.env.DATABASE_URL).toBeUndefined();
    const app = await buildRealApp({ reset: false });
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    await app.close();
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it("treats a malformed prior URL as distinct and restores it after a local reset", async () => {
    process.env.DATABASE_URL = "malformed-prior-url";
    const app = await buildRealApp();
    expect(mocks.resetPostgresDatabase).toHaveBeenCalledExactlyOnceWith(disposableUrl);
    await app.close();
    expect(process.env.DATABASE_URL).toBe("malformed-prior-url");
  });

  it("reserves the reset before awaiting SQL and rejects concurrent app startup", async () => {
    let finishReset: (() => void) | undefined;
    mocks.resetPostgresDatabase.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishReset = resolve;
    }));
    const firstPromise = buildRealApp();
    await expect(buildRealApp()).rejects.toThrow("test database is resetting");
    await expect(buildRealApp({ reset: false })).rejects.toThrow("test database is resetting");
    expect(mocks.resetPostgresDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.buildApp).not.toHaveBeenCalled();
    finishReset?.();
    const app = await firstPromise;
    expect(mocks.buildApp).toHaveBeenCalledTimes(1);
    await app.close();
    expect(process.env.DATABASE_URL).toBe(previousUrl);
  });

  it("releases the reservation after a failed reset without changing the app URL", async () => {
    mocks.resetPostgresDatabase.mockRejectedValueOnce(new Error("synthetic reset failure"));
    await expect(buildRealApp()).rejects.toThrow("synthetic reset failure");
    expect(process.env.DATABASE_URL).toBe(previousUrl);
    expect(mocks.buildApp).not.toHaveBeenCalled();
    const app = await buildRealApp({ reset: false });
    await app.close();
    expect(process.env.DATABASE_URL).toBe(previousUrl);
  });
});
