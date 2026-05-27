import type { FastifyPluginAsync } from "fastify";
import { dashboardRoutes } from "./routes.js";

const dashboardModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
};

export default dashboardModule;
