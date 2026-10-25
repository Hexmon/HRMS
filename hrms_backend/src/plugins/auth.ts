import fp from "fastify-plugin";
import { verifyJwt } from "#auth";
import { EmploymentStatuses } from "#shared";
import { forbidden, unauthorized } from "../platform/errors.js";
import { resolveActiveCompanyMembershipContext } from "../platform/company-membership-context.js";

export interface SelectedAuthToken {
  token: string | undefined;
  source: "bearer" | "cookie" | "none";
}

export function selectAuthToken(input: {
  authorization?: string;
  cookieToken?: string;
}): SelectedAuthToken {
  const bearerToken = parseBearerToken(input.authorization);
  if (bearerToken !== undefined) {
    return { token: bearerToken, source: "bearer" };
  }
  const cookieToken = input.cookieToken?.trim();
  if (cookieToken) {
    return { token: cookieToken, source: "cookie" };
  }
  return { token: undefined, source: "none" };
}

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
      "/api/v1/onboarding/company-logo",
      "/api/v1/onboarding/company-bootstrap",
      "/api/v1/webhooks/resend"
    ]);
    if (fastify.config.OPENAPI_PUBLIC) {
      publicPaths.add("/api/v1/openapi.json");
    }
    const path = request.url.split("?")[0] ?? request.url;
    const cookieToken = request.cookies?.[fastify.config.SESSION_COOKIE_NAME];
    const selected = selectAuthToken({
      authorization: request.headers.authorization,
      cookieToken
    });
    if (selected.source === "cookie" && isStateChangingMethod(request.method)) {
      assertTrustedOrigin(request.headers.origin, {
        frontendUrl: fastify.config.FRONTEND_URL,
        allowedOrigins: fastify.config.CORS_ALLOWED_ORIGINS,
      });
    }
    if (publicPaths.has(path)) {
      return;
    }
    if (fastify.config.OPENAPI_PUBLIC && (path === "/docs" || path.startsWith("/docs/"))) {
      return;
    }
    if (request.url.startsWith("/api/v1/assets/scan/")) {
      return;
    }

    if (!selected.token) {
      throw selected.source === "bearer" ? unauthorized("Invalid or expired session") : unauthorized();
    }

    let claims: ReturnType<typeof verifyJwt>;
    try {
      claims = verifyJwt(selected.token, fastify.config.JWT_SECRET);
    } catch {
      throw unauthorized("Invalid or expired session");
    }
    const session = await fastify.store.sessionStore.get(claims.jti);
    if (!session || session.revoked_at || session.user_id !== claims.sub) {
      throw unauthorized("Session has been revoked");
    }
    const actor = fastify.store.users.find((user) => user.id === claims.sub && !user.deleted_at);
    if (!actor) {
      throw unauthorized("User no longer exists");
    }
    if (actor.employment_status !== EmploymentStatuses.Active) {
      throw unauthorized("User account is inactive or blocked");
    }
    if (path !== "/api/v1/auth/me") {
      resolveActiveCompanyMembershipContext(fastify.store, {
        userId: actor.id,
        operation: `${request.method} ${path}`,
        requireActiveEmployment: true,
      });
    }
    request.actor = actor;
  });
});

function isStateChangingMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function assertTrustedOrigin(
  origin: string | undefined,
  input: { frontendUrl: string; allowedOrigins: string },
): void {
  const trustedOrigins = new Set(
    [input.frontendUrl, ...input.allowedOrigins.split(",")]
      .map((value) => normalizedOrigin(value))
      .filter((value): value is string => Boolean(value)),
  );
  const requestOrigin = normalizedOrigin(origin);
  if (!requestOrigin || !trustedOrigins.has(requestOrigin)) {
    throw forbidden("Request origin is not allowed for cookie-authenticated mutations");
  }
}

function normalizedOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer(?:\s+(.+))?$/iu.exec(authorization.trim());
  return match ? (match[1]?.trim() ?? "") : undefined;
}
