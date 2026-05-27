import type { FastifyPluginAsync } from "fastify";
import { notificationsRoutes } from "./routes.js";

const notificationsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(notificationsRoutes, { prefix: "/api/v1" });
};

export default notificationsModule;
