import type { FastifyPluginAsync } from "fastify";
import { authRoutes } from "./routes.js";

const authModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
};

export default authModule;
