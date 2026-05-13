import type { FastifyPluginAsync } from "fastify";
import { documentRoutes } from "./routes.js";

const documentsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(documentRoutes, { prefix: "/api/v1" });
};

export default documentsModule;
