import type { FastifyPluginAsync } from "fastify";
import { helpdeskRoutes } from "./routes.js";

const helpdeskModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(helpdeskRoutes, { prefix: "/api/v1" });
};

export default helpdeskModule;
