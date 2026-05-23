import fp from "fastify-plugin";

export const securityHeadersPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");

    if (fastify.config.COOKIE_SECURE || fastify.config.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
  });
});
