import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { assertDisposableResetTarget, resetPostgresDatabase } from "../platform/postgres-data-store.js";

export async function buildRealApp(options: { reset?: boolean } = {}): Promise<FastifyInstance> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for real integration tests.");
  }
  // Both the resetter and a second non-resetting API instance must use a
  // loopback disposable test database. The first instance temporarily sets
  // DATABASE_URL to TEST_DATABASE_URL, so equality alone is not a reason to
  // reject the second instance when it will not reset the database.
  assertDisposableResetTarget(databaseUrl);
  const reset = options.reset ?? true;
  if (reset && databaseUrl === process.env.DATABASE_URL && process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET !== "true") {
    throw new Error(
      "Refusing to reset DATABASE_URL for integration tests. Set TEST_DATABASE_URL to a separate test database."
    );
  }
  if (reset) {
    await resetPostgresDatabase(databaseUrl);
  }
  process.env.DATABASE_URL = databaseUrl;
  try {
    const app = await buildApp({ dataStoreMode: "postgres", seedIfEmpty: true, rateLimit: false });
    app.addHook("onClose", async () => {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    });
    return app;
  } catch (error) {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    throw error;
  }
}
