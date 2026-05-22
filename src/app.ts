import "./platform/decorators.js";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { DataStore } from "./platform/data-store.js";
import { createMemoryDataStore } from "./platform/data-store.js";
import { createPostgresDataStore } from "./platform/postgres-data-store.js";
import { openApiComponents, openApiTags, swaggerTransform, swaggerTransformObject } from "./platform/openapi.js";
import { configPlugin } from "./plugins/config.js";
import { requestContextPlugin } from "./plugins/request-context.js";
import { errorsPlugin } from "./plugins/errors.js";
import { compressionPlugin } from "./plugins/compress.js";
import { cookiesPlugin } from "./plugins/cookies.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import healthModule from "./modules/health/index.js";
import authModule from "./modules/auth/index.js";
import coreModule from "./modules/core/index.js";
import platformModule from "./modules/platform/index.js";
import expensesModule from "./modules/expenses/index.js";
import documentsModule from "./modules/documents/index.js";
import reportsModule from "./modules/reports/index.js";
import assetsModule from "./modules/assets/index.js";
import timesheetsModule from "./modules/timesheets/index.js";

export interface BuildAppOptions {
  logger?: boolean;
  dataStore?: DataStore;
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
    logger: options.logger ?? false,
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
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      app.store.persistence &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      reply.statusCode < 500
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
  await app.register(cors, { origin: true, credentials: true });
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
  await app.register(healthModule);
  await app.register(authModule);
  await app.register(coreModule);
  await app.register(platformModule);
  await app.register(expensesModule);
  await app.register(documentsModule);
  await app.register(reportsModule);
  await app.register(assetsModule);
  await app.register(timesheetsModule);

  app.get("/api/v1/openapi.json", async () => app.swagger());

  return app;
}

async function createRuntimeStore(config: FastifyInstance["config"], options: BuildAppOptions): Promise<DataStore> {
  const mode = options.dataStoreMode ?? process.env.HRMS_DATA_STORE ?? "postgres";
  if (mode === "memory") {
    if (process.env.HRMS_ALLOW_MEMORY_STORE !== "true") {
      throw new Error("MemoryDataStore is allowed only when HRMS_ALLOW_MEMORY_STORE=true is set explicitly.");
    }
    return createMemoryDataStore();
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
    objectStorage: {
      endpoint: config.OBJECT_STORAGE_ENDPOINT,
      accessKey: config.OBJECT_STORAGE_ACCESS_KEY,
      secretKey: config.OBJECT_STORAGE_SECRET_KEY,
      bucket: config.OBJECT_STORAGE_BUCKET,
      region: config.OBJECT_STORAGE_REGION
    },
    seedIfEmpty: options.seedIfEmpty ?? true
  });
}
