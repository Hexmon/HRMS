import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { assertDisposableResetTarget, resetPostgresDatabase } from "../platform/postgres-data-store.js";

let openAppCount = 0;
let activeTestDatabaseUrl: string | undefined;
let previousDatabaseUrl: string | undefined;
let resetInProgress = false;

function sameDatabaseTarget(left: string, right: string | undefined): boolean {
  if (!right) return false;
  try {
    const a = new URL(left);
    const b = new URL(right);
    const host = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? "loopback"
      : url.hostname;
    return host(a) === host(b)
      && (a.port || "5432") === (b.port || "5432")
      && decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname);
  } catch {
    return left === right;
  }
}

function acquireTestDatabaseUrl(databaseUrl: string): () => void {
  if (openAppCount > 0 && activeTestDatabaseUrl !== databaseUrl) {
    throw new Error("Cannot use a different test database while another test app is open.");
  }
  if (openAppCount === 0) previousDatabaseUrl = process.env.DATABASE_URL;
  openAppCount += 1;
  activeTestDatabaseUrl = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openAppCount -= 1;
    if (openAppCount > 0) return;
    activeTestDatabaseUrl = undefined;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    previousDatabaseUrl = undefined;
  };
}

export async function buildRealApp(options: { reset?: boolean } = {}): Promise<FastifyInstance> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const reset = options.reset ?? true;
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for real integration tests.");
  }
  // Both the resetter and a second non-resetting API instance must use a
  // loopback disposable test database. The first instance temporarily sets
  // DATABASE_URL to TEST_DATABASE_URL, so equality alone is not a reason to
  // reject the second instance when it will not reset the database.
  assertDisposableResetTarget(databaseUrl);
  if (resetInProgress) {
    throw new Error("Cannot start another test app while the test database is resetting.");
  }
  if (openAppCount > 0 && activeTestDatabaseUrl !== databaseUrl) {
    throw new Error("Cannot use a different test database while another test app is open.");
  }
  if (openAppCount > 0 && reset) {
    throw new Error("Cannot reset the test database while another test app is open.");
  }
  if (reset && sameDatabaseTarget(databaseUrl, process.env.DATABASE_URL) && process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET !== "true") {
    throw new Error(
      "Refusing to reset DATABASE_URL for integration tests. Set TEST_DATABASE_URL to a separate test database."
    );
  }
  if (reset) {
    resetInProgress = true;
    try {
      await resetPostgresDatabase(databaseUrl);
    } finally {
      resetInProgress = false;
    }
  }
  const releaseDatabaseUrl = acquireTestDatabaseUrl(databaseUrl);
  try {
    const app = await buildApp({ dataStoreMode: "postgres", seedIfEmpty: true, rateLimit: false });
    app.addHook("onClose", async () => {
      releaseDatabaseUrl();
    });
    return app;
  } catch (error) {
    releaseDatabaseUrl();
    throw error;
  }
}
