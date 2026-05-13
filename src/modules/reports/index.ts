import type { FastifyPluginAsync } from "fastify";
import { reportRoutes } from "./routes.js";

const reportsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(reportRoutes, { prefix: "/api/v1/reports" });
};

export default reportsModule;
