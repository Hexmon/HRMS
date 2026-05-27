import compress from "@fastify/compress";
import fp from "fastify-plugin";

export const compressionPlugin = fp(async (fastify) => {
  await fastify.register(compress, {
    global: true,
    encodings: ["br", "gzip", "deflate"]
  });
});
