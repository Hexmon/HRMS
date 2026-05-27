import type { FastifyPluginAsync } from "fastify";
import { leaveWfhRoutes } from "./routes.js";

const leaveWfhModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(leaveWfhRoutes, { prefix: "/api/v1" });
};

export default leaveWfhModule;
