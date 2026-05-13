import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";

export const requestContextPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const header = request.headers["x-request-id"];
    request.requestId = Array.isArray(header) ? header[0] ?? randomUUID() : header ?? randomUUID();
    reply.header("x-request-id", request.requestId);
  });
});
