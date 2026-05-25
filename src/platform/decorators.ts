import type { AuthUser } from "#shared";
import type { DataStore } from "./data-store.js";
import type { EmailDeliveryService } from "./email/email-delivery-service.js";

declare module "fastify" {
  interface FastifyInstance {
    store: DataStore;
    emailDelivery: EmailDeliveryService;
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
      OBJECT_STORAGE_PROVIDER: "cloudinary" | "minio";
      CLOUDINARY_CLOUD_NAME: string;
      CLOUDINARY_API_KEY: string;
      CLOUDINARY_API_SECRET: string;
      CLOUDINARY_FOLDER: string;
      CLOUDINARY_RESOURCE_TYPE: "auto" | "image" | "raw" | "video";
      CLOUDINARY_UPLOAD_TRANSFORMATION: string;
      CLOUDINARY_MOCK_UPLOADS: boolean;
      MINIO_ENDPOINT: string;
      MINIO_PUBLIC_ENDPOINT?: string;
      MINIO_ACCESS_KEY: string;
      MINIO_SECRET_KEY: string;
      MINIO_BUCKET: string;
      MINIO_REGION: string;
      PDF_COMPRESSION_ENABLED: boolean;
      PDF_COMPRESSION_BINARY: string;
      PDF_COMPRESSION_QUALITY: "screen" | "ebook" | "printer" | "prepress" | "default";
      PDF_COMPRESSION_MIN_BYTES: number;
      PDF_COMPRESSION_TIMEOUT_MS: number;
      PDF_COMPRESSION_FAIL_OPEN: boolean;
      API_BASE_URL: string;
      APP_URL: string;
      FRONTEND_URL: string;
      EMAIL_DELIVERY_PROVIDER: "resend";
      EMAIL_DELIVERY_MODE: "send" | "log" | "disabled";
      RESEND_API_KEY?: string;
      RESEND_FROM_EMAIL: string;
      RESEND_FROM_NAME?: string;
      RESEND_REPLY_TO_EMAIL?: string;
      RESEND_WEBHOOK_SECRET?: string;
      RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: number;
      EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: number;
      EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: number;
      EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT: number;
      EMAIL_VERIFICATION_RESEND_DAILY_LIMIT: number;
      CORS_ALLOWED_ORIGINS: string;
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
