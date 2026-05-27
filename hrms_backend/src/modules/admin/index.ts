import type { FastifyPluginAsync } from "fastify";
import { adminRoutes } from "./routes.js";

const adminModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(adminRoutes, { prefix: "/api/v1/admin" });
};

export default adminModule;
