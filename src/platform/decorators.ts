import type { AuthUser } from "#shared";
import type { DataStore } from "./data-store.js";

declare module "fastify" {
  interface FastifyInstance {
    store: DataStore;
    config: {
      NODE_ENV: string;
      PORT: number;
      JWT_SECRET: string;
      JWT_ACCESS_SECRET: string;
      JWT_REFRESH_SECRET: string;
      SESSION_COOKIE_NAME: string;
      COOKIE_SECURE: boolean;
      DATABASE_URL?: string;
      TEST_DATABASE_URL?: string;
      VALKEY_URL?: string;
      OBJECT_STORAGE_ENDPOINT: string;
      OBJECT_STORAGE_ACCESS_KEY: string;
      OBJECT_STORAGE_SECRET_KEY: string;
      OBJECT_STORAGE_BUCKET: string;
      OBJECT_STORAGE_REGION: string;
      API_BASE_URL: string;
      RATE_LIMIT_ENABLED: boolean;
      RATE_LIMIT_WINDOW_SECONDS: number;
      RATE_LIMIT_READ_MAX: number;
      RATE_LIMIT_WRITE_MAX: number;
      RATE_LIMIT_AUTH_MAX: number;
      RATE_LIMIT_PUBLIC_MAX: number;
    };
  }

  interface FastifyRequest {
    requestId: string;
    actor?: AuthUser;
  }
}
