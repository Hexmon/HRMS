import type { FastifyPluginAsync } from "fastify";
import { verifyJwt } from "#auth";
import { unauthorized } from "../../platform/errors.js";
import { AuthService } from "./service.js";
import {
  companyBootstrapSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  resendEmailVerificationSchema,
  sessionPreferenceSchema,
  setPasswordSchema,
  signupSchema,
  verifyEmailSchema
} from "./schemas.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/signup", async (request) => {
    const body = signupSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).signup(body);
  });

  fastify.post("/verify-email", async (request) => {
    const body = verifyEmailSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).verifyEmail(body);
  });

  fastify.post("/email-verifications/resend", async (request) => {
    const body = resendEmailVerificationSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).resendEmailVerification(body);
  });

  fastify.post("/set-password", async (request) => {
    const body = setPasswordSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).setPassword(body);
  });

  fastify.post("/password-reset/request", async (request) => {
    const body = passwordResetRequestSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).requestPasswordReset(body);
  });

  fastify.post("/password-reset/confirm", async (request) => {
    const body = passwordResetConfirmSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).confirmPasswordReset(body);
  });

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

  fastify.patch("/session/preference", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = sessionPreferenceSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).updateSessionPreference(request.actor, body);
  });
};

export const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/company-bootstrap", async (request) => {
    const body = companyBootstrapSchema.parse(request.body);
    return new AuthService(fastify.store, fastify.config.JWT_SECRET).bootstrapCompany(body);
  });
};
