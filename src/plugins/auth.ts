import fp from "fastify-plugin";
import { verifyJwt } from "#auth";
import { unauthorized } from "../platform/errors.js";

export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest("actor");

  fastify.addHook("preHandler", async (request) => {
    const publicPaths = new Set([
      "/health/live",
      "/health/ready",
      "/api/v1/health/live",
      "/api/v1/health/ready",
      "/api/v1/auth/signup",
      "/api/v1/auth/verify-email",
      "/api/v1/auth/email-verifications/resend",
      "/api/v1/auth/set-password",
      "/api/v1/auth/password-reset/request",
      "/api/v1/auth/password-reset/confirm",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/onboarding/company-bootstrap",
      "/api/v1/webhooks/resend",
      "/api/v1/openapi.json"
    ]);
    const path = request.url.split("?")[0] ?? request.url;
    if (publicPaths.has(path)) {
      return;
    }
    if (path === "/docs" || path.startsWith("/docs/")) {
      return;
    }
    if (request.url.startsWith("/api/v1/assets/scan/")) {
      return;
    }

    const cookieToken = request.cookies?.[fastify.config.SESSION_COOKIE_NAME];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
    const token = cookieToken ?? bearerToken;
    if (!token) {
      throw unauthorized();
    }

    let claims: ReturnType<typeof verifyJwt>;
    try {
      claims = verifyJwt(token, fastify.config.JWT_SECRET);
    } catch {
      throw unauthorized("Invalid or expired session");
    }
    const session = await fastify.store.sessionStore.get(claims.jti);
    if (!session || session.revoked_at) {
      throw unauthorized("Session has been revoked");
    }
    const actor = fastify.store.users.find((user) => user.id === claims.sub && !user.deleted_at);
    if (!actor) {
      throw unauthorized("User no longer exists");
    }
    request.actor = actor;
  });
});
