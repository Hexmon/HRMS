import type { FastifyPluginAsync } from "fastify";
import { assetRoutes } from "./routes.js";

const assetsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(assetRoutes, { prefix: "/api/v1/assets" });
};

export default assetsModule;
