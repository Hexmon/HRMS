import type { FastifyPluginAsync } from "fastify";
import { emsRoutes } from "./routes.js";

const emsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(emsRoutes, { prefix: "/api/v1" });
};

export default emsModule;
