import type { FastifyPluginAsync } from "fastify";
import { projectsRoutes } from "./routes.js";

const projectsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(projectsRoutes, { prefix: "/api/v1" });
};

export default projectsModule;
