import fp from "fastify-plugin";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  JWT_ACCESS_SECRET: z.string().min(16).default("local-dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("local-dev-refresh-secret-change-me"),
  SESSION_COOKIE_NAME: z.string().default("hrms_session"),
  JWT_SECRET: z.string().min(16).optional(),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  VALKEY_URL: z.string().optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().default("http://localhost:9000"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().default("minioadmin"),
  OBJECT_STORAGE_SECRET_KEY: z.string().default("minioadmin"),
  OBJECT_STORAGE_BUCKET: z.string().default("hrms-documents"),
  OBJECT_STORAGE_REGION: z.string().default("us-east-1"),
  API_BASE_URL: z.string().default("http://localhost:3001"),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_READ_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WRITE_MAX: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().min(1).default(60)
}).transform((config) => ({
  ...config,
  JWT_SECRET: config.JWT_SECRET ?? config.JWT_ACCESS_SECRET
}));

export const configPlugin = fp(async (fastify) => {
  const config = configSchema.parse(process.env);
  fastify.decorate("config", config);
});
