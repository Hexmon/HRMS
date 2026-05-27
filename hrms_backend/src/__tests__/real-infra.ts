import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetPostgresDatabase } from "../platform/postgres-data-store.js";

export async function buildRealApp(options: { reset?: boolean } = {}): Promise<FastifyInstance> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for real integration tests.");
  }
  if (options.reset ?? true) {
    await resetPostgresDatabase(databaseUrl);
  }
  process.env.DATABASE_URL = databaseUrl;
  return buildApp({ dataStoreMode: "postgres", seedIfEmpty: true, rateLimit: false });
}
