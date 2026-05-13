import type { FastifyPluginAsync } from "fastify";
import { coreRoutes } from "./routes.js";

const coreModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(coreRoutes, { prefix: "/api/v1/core" });
};

export default coreModule;
