import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const live = async () => ({
    status: "ok",
    service: "hawkaii-hrms-api"
  });

  const ready = async () => ({
    status: "ok",
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
