import type { FastifyPluginAsync } from "fastify";
import { healthRoutes } from "./routes.js";

const healthModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoutes);
};

export default healthModule;
