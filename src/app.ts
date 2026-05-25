import "./platform/decorators.js";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { DataStore } from "./platform/data-store.js";
import { createMemoryDataStore } from "./platform/data-store.js";
import { createPostgresDataStore, type PostgresObjectStorageOptions } from "./platform/postgres-data-store.js";
import { createEmailDeliveryService } from "./platform/email/email-delivery-service.js";
import type { EmailProvider } from "./platform/email/types.js";
import { openApiComponents, openApiTags, swaggerTransform, swaggerTransformObject } from "./platform/openapi.js";
import { configPlugin } from "./plugins/config.js";
import { requestContextPlugin } from "./plugins/request-context.js";
import { errorsPlugin } from "./plugins/errors.js";
import { compressionPlugin } from "./plugins/compress.js";
import { cookiesPlugin } from "./plugins/cookies.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { securityHeadersPlugin } from "./plugins/security-headers.js";
import healthModule from "./modules/health/index.js";
import authModule from "./modules/auth/index.js";
import coreModule from "./modules/core/index.js";
import dashboardModule from "./modules/dashboard/index.js";
import platformModule from "./modules/platform/index.js";
import expensesModule from "./modules/expenses/index.js";
import documentsModule from "./modules/documents/index.js";
import reportsModule from "./modules/reports/index.js";
import assetsModule from "./modules/assets/index.js";
import timesheetsModule from "./modules/timesheets/index.js";
import attendanceModule from "./modules/attendance/index.js";
import leaveWfhModule from "./modules/leave-wfh/index.js";
import emsModule from "./modules/ems/index.js";
import projectsModule from "./modules/projects/index.js";
import helpdeskModule from "./modules/helpdesk/index.js";
import notificationsModule from "./modules/notifications/index.js";
import adminModule from "./modules/admin/index.js";
import webhooksModule from "./modules/webhooks/index.js";

export interface BuildAppOptions {
  logger?: boolean;
  dataStore?: DataStore;
  emailProvider?: EmailProvider;
  dataStoreMode?: "postgres" | "memory";
  seedIfEmpty?: boolean;
  rateLimit?: false | {
    authMax?: number;
    publicMax?: number;
    readMax?: number;
    writeMax?: number;
    windowSeconds?: number;
  };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(options.logger ?? false),
    genReqId: () => crypto.randomUUID()
  });

  await app.register(configPlugin);
  if (options.rateLimit && typeof options.rateLimit === "object") {
    app.config.RATE_LIMIT_AUTH_MAX = options.rateLimit.authMax ?? app.config.RATE_LIMIT_AUTH_MAX;
    app.config.RATE_LIMIT_PUBLIC_MAX = options.rateLimit.publicMax ?? app.config.RATE_LIMIT_PUBLIC_MAX;
    app.config.RATE_LIMIT_READ_MAX = options.rateLimit.readMax ?? app.config.RATE_LIMIT_READ_MAX;
    app.config.RATE_LIMIT_WRITE_MAX = options.rateLimit.writeMax ?? app.config.RATE_LIMIT_WRITE_MAX;
    app.config.RATE_LIMIT_WINDOW_SECONDS = options.rateLimit.windowSeconds ?? app.config.RATE_LIMIT_WINDOW_SECONDS;
  }
  const store = options.dataStore ?? await createRuntimeStore(app.config, options);
  app.decorate("store", store);
  app.decorate("emailDelivery", createEmailDeliveryService(store, {
    provider: app.config.EMAIL_DELIVERY_PROVIDER,
    mode: app.config.EMAIL_DELIVERY_MODE,
    resendApiKey: app.config.RESEND_API_KEY,
    resendFromEmail: app.config.RESEND_FROM_EMAIL,
    resendFromName: app.config.RESEND_FROM_NAME,
    resendReplyToEmail: app.config.RESEND_REPLY_TO_EMAIL,
    resendWebhookSecret: app.config.RESEND_WEBHOOK_SECRET,
    frontendUrl: app.config.FRONTEND_URL,
    appUrl: app.config.APP_URL,
    verificationTokenTtlSeconds: app.config.EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    verificationResendCooldownSeconds: app.config.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    verificationResendHourlyLimit: app.config.EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT,
    verificationResendDailyLimit: app.config.EMAIL_VERIFICATION_RESEND_DAILY_LIMIT
  }, options.emailProvider));
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      app.store.persistence &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      reply.statusCode >= 200 &&
      reply.statusCode < 400
    ) {
      await app.store.persistence.flush();
    }
    return payload;
  });
  app.addHook("onClose", async () => {
    await app.store.persistence?.close();
  });
  await app.register(requestContextPlugin);
  await app.register(errorsPlugin);
  await app.register(securityHeadersPlugin);
  await app.register(cors, corsOptions(app.config));
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(compressionPlugin);
  await app.register(cookiesPlugin);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Hawkaii HRMS API",
        version: "0.1.0"
      },
      tags: openApiTags,
      components: openApiComponents as never
    },
    transform: swaggerTransform,
    transformObject: swaggerTransformObject
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(authPlugin);
  if (options.rateLimit !== false) {
    await app.register(rateLimitPlugin);
  }
  await app.register(webhooksModule);
  await app.register(healthModule);
  await app.register(authModule);
  await app.register(coreModule);
  await app.register(dashboardModule);
  await app.register(platformModule);
  await app.register(expensesModule);
  await app.register(documentsModule);
  await app.register(reportsModule);
  await app.register(assetsModule);
  await app.register(timesheetsModule);
  await app.register(attendanceModule);
  await app.register(leaveWfhModule);
  await app.register(emsModule);
  await app.register(projectsModule);
  await app.register(helpdeskModule);
  await app.register(notificationsModule);
  await app.register(adminModule);

  app.get("/api/v1/openapi.json", async () => app.swagger());

  return app;
}

async function createRuntimeStore(config: FastifyInstance["config"], options: BuildAppOptions): Promise<DataStore> {
  const mode = options.dataStoreMode ?? process.env.HRMS_DATA_STORE ?? "postgres";
  if (mode === "memory") {
    if (process.env.HRMS_ALLOW_MEMORY_STORE !== "true") {
      throw new Error("MemoryDataStore is allowed only when HRMS_ALLOW_MEMORY_STORE=true is set explicitly.");
    }
    const store = createMemoryDataStore();
    store.documentProcessing = {
      pdfCompression: {
        enabled: config.PDF_COMPRESSION_ENABLED,
        binary: config.PDF_COMPRESSION_BINARY,
        quality: config.PDF_COMPRESSION_QUALITY,
        minBytes: config.PDF_COMPRESSION_MIN_BYTES,
        timeoutMs: config.PDF_COMPRESSION_TIMEOUT_MS,
        failOpen: config.PDF_COMPRESSION_FAIL_OPEN
      }
    };
    return store;
  }

  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL-backed runtime state.");
  }
  if (!config.VALKEY_URL) {
    throw new Error("VALKEY_URL is required for Valkey-backed sessions and outbox publishing.");
  }

  return createPostgresDataStore({
    databaseUrl: config.DATABASE_URL,
    valkeyUrl: config.VALKEY_URL,
    objectStorage: objectStorageOptions(config),
    documentProcessing: {
      pdfCompression: {
        enabled: config.PDF_COMPRESSION_ENABLED,
        binary: config.PDF_COMPRESSION_BINARY,
        quality: config.PDF_COMPRESSION_QUALITY,
        minBytes: config.PDF_COMPRESSION_MIN_BYTES,
        timeoutMs: config.PDF_COMPRESSION_TIMEOUT_MS,
        failOpen: config.PDF_COMPRESSION_FAIL_OPEN
      }
    },
    seedIfEmpty: options.seedIfEmpty ?? true
  });
}

function objectStorageOptions(config: FastifyInstance["config"]): PostgresObjectStorageOptions {
  return {
    cloudName: config.CLOUDINARY_CLOUD_NAME,
    apiKey: config.CLOUDINARY_API_KEY,
    apiSecret: config.CLOUDINARY_API_SECRET,
    folder: config.CLOUDINARY_FOLDER,
    resourceType: config.CLOUDINARY_RESOURCE_TYPE,
    uploadTransformation: config.CLOUDINARY_UPLOAD_TRANSFORMATION,
    mockUploads: config.CLOUDINARY_MOCK_UPLOADS
  };
}

function corsOptions(config: FastifyInstance["config"]): Parameters<typeof cors>[1] {
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  if (allowedOrigins.length === 0 && config.NODE_ENV !== "production") {
    return { origin: true, credentials: true, methods };
  }

  const allowed = new Set(allowedOrigins);
  return {
    credentials: true,
    methods,
    origin(origin, callback) {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, allowed.has(origin));
    }
  };
}

function loggerOptions(enabled: boolean): false | {
  level: string;
  redact: { paths: string[]; censor: string };
} {
  if (!enabled) {
    return false;
  }

  return {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    redact: {
      censor: "[REDACTED]",
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "res.headers['set-cookie']",
        "*.password",
        "*.token",
        "*.access_token",
        "*.refresh_token",
        "*.JWT_ACCESS_SECRET",
        "*.JWT_REFRESH_SECRET",
        "*.RESEND_API_KEY",
        "*.RESEND_WEBHOOK_SECRET"
      ]
    }
  };
}
