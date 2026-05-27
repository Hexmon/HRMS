import type { FastifyPluginAsync } from "fastify";
import { ResendWebhookService } from "../../platform/email/resend-webhook-service.js";

export const resendWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  fastify.post("/resend", async (request) => {
    const body = typeof request.body === "string" ? request.body : "";
    const service = new ResendWebhookService(fastify.store, fastify.config.RESEND_WEBHOOK_SECRET ?? "", {
      timestampToleranceSeconds: fastify.config.RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
    });
    return service.process(body, {
      id: headerValue(request.headers["svix-id"]),
      timestamp: headerValue(request.headers["svix-timestamp"]),
      signature: headerValue(request.headers["svix-signature"])
    });
  });
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
