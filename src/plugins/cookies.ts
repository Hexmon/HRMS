import cookie from "@fastify/cookie";
import fp from "fastify-plugin";

export const cookiesPlugin = fp(async (fastify) => {
  await fastify.register(cookie, {
    secret: fastify.config.JWT_SECRET
  });
});
