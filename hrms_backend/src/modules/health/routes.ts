import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const live = async () => ({
    status: "ok",
    service: "hawkaii-hrms-api",
    app_env: fastify.config.APP_ENV,
    version: fastify.config.APP_VERSION,
    build_sha: fastify.config.BUILD_SHA ?? null,
    uptime_seconds: Math.round(process.uptime())
  });

  const ready = async () => ({
    status: "ok",
    app_env: fastify.config.APP_ENV,
    node_env: fastify.config.NODE_ENV,
    version: fastify.config.APP_VERSION,
    build_sha: fastify.config.BUILD_SHA ?? null,
    uptime_seconds: Math.round(process.uptime()),
    data_store: fastify.store.kind,
    database: fastify.config.DATABASE_URL ? "configured" : "missing",
    valkey: fastify.config.VALKEY_URL ? "configured" : "missing",
    object_storage: fastify.store.objectStorage?.kind ?? "missing"
  });

  fastify.get("/health/live", live);
  fastify.get("/health/ready", ready);
  fastify.get("/api/v1/health/live", live);
  fastify.get("/api/v1/health/ready", ready);
};
