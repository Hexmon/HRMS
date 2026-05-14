import type { FastifyPluginAsync } from "fastify";
import { authRoutes, onboardingRoutes } from "./routes.js";

const authModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
  await fastify.register(onboardingRoutes, { prefix: "/api/v1/onboarding" });
};

export default authModule;
