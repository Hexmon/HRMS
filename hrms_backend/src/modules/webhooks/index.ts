import type { FastifyPluginAsync } from "fastify";
import { resendWebhookRoutes } from "./resend-routes.js";

const webhooksModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(resendWebhookRoutes, { prefix: "/api/v1/webhooks" });
};

export default webhooksModule;
