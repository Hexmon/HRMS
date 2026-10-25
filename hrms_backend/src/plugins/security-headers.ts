import fp from "fastify-plugin";

export const securityHeadersPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");

    const path = request.url.split("?")[0] ?? request.url;
    if (path.startsWith("/api/v1/auth/") || path.startsWith("/api/v1/onboarding/")) {
      reply.header("Cache-Control", "no-store, private, max-age=0");
      reply.header("Pragma", "no-cache");
    }

    if (fastify.config.COOKIE_SECURE || fastify.config.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
  });
});
