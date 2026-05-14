import type { FastifyPluginAsync } from "fastify";
import { verifyJwt } from "#auth";
import { unauthorized } from "../../platform/errors.js";
import { AuthService } from "./service.js";
import { loginSchema } from "./schemas.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const service = new AuthService(fastify.store, fastify.config.JWT_SECRET);
    const result = await service.login(body);
    reply.setCookie(fastify.config.SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: fastify.config.COOKIE_SECURE,
      path: "/",
      expires: new Date(result.expires_at)
    });
    return {
      user: result.user,
      access_token: result.token,
      expires_at: result.expires_at
    };
  });

  fastify.post("/logout", async (request, reply) => {
    const token = request.cookies?.[fastify.config.SESSION_COOKIE_NAME];
    if (token) {
      try {
        const claims = verifyJwt(token, fastify.config.JWT_SECRET);
        const service = new AuthService(fastify.store, fastify.config.JWT_SECRET);
        await service.logout(claims.jti);
      } catch {
        // Clear stale/invalid browser cookies without leaking token validity.
      }
    }
    reply.clearCookie(fastify.config.SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: fastify.config.COOKIE_SECURE,
      path: "/"
    });
    return { status: "ok" };
  });

  fastify.get("/me", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).sessionContext(request.actor);
  });
};
