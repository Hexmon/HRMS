import type { FastifyPluginAsync } from "fastify";
import { platformRoutes } from "./routes.js";

const platformModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(platformRoutes, { prefix: "/api/v1/platform" });
};

export default platformModule;
