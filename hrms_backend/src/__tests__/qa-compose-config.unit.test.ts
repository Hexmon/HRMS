import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { configPlugin } from "../plugins/config.js";

const backendRoot = fileURLToPath(new URL("../..", import.meta.url));
const managedEnvironment = [
  "APP_ENV",
  "NODE_ENV",
  "CLOUDINARY_MOCK_UPLOADS",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "EMAIL_DELIVERY_MODE",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
] as const;
const originalEnvironment = Object.fromEntries(
  managedEnvironment.map((key) => [key, process.env[key]]),
) as Record<(typeof managedEnvironment)[number], string | undefined>;

type ComposeService = {
  command?: string[];
  environment?: Record<string, string>;
};

function restoreEnvironment(): void {
  for (const key of managedEnvironment) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function effectiveCompose(envFile: string): Record<string, ComposeService> {
  const env = { ...process.env };
  delete env.APP_ENV;
  delete env.NODE_ENV;
  delete env.CLOUDINARY_MOCK_UPLOADS;
  const output = execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      envFile,
      "-f",
      "infra/docker/docker-compose.qa.yml",
      "-p",
      "hrms_qa_compose_config_test",
      "config",
      "--format",
      "json",
    ],
    { cwd: backendRoot, encoding: "utf8", env },
  );
  return (JSON.parse(output) as { services: Record<string, ComposeService> }).services;
}

async function loadConfig(environment: Record<string, string>) {
  Object.assign(process.env, {
    EMAIL_DELIVERY_MODE: "disabled",
    JWT_ACCESS_SECRET: "qa-config-access-secret",
    JWT_REFRESH_SECRET: "qa-config-refresh-secret",
    CLOUDINARY_CLOUD_NAME: "qa-config-cloud",
    CLOUDINARY_API_KEY: "qa-config-api-key",
    CLOUDINARY_API_SECRET: "qa-config-api-secret",
    ...environment,
  });
  const app = Fastify();
  try {
    await app.register(configPlugin);
    await app.ready();
    return app.config;
  } finally {
    await app.close().catch(() => undefined);
    restoreEnvironment();
  }
}

afterEach(restoreEnvironment);

describe("QA Compose effective runtime configuration", () => {
  it("resolves mock-safe local defaults without exposing the seed opt-in to long-running services", () => {
    const services = effectiveCompose("/dev/null");
    for (const name of ["hawkaii-hrms-api", "hawkaii-hrms-migrate", "hawkaii-hrms-outbox-worker"]) {
      expect(services[name]?.environment).toMatchObject({
        APP_ENV: "local",
        NODE_ENV: "development",
        CLOUDINARY_MOCK_UPLOADS: "true",
      });
    }
    expect(services["hawkaii-hrms-migrate"]?.command).toEqual([
      "sh",
      "-lc",
      "pnpm db:migrate && pnpm qa:seed",
    ]);
    expect(services["hawkaii-hrms-migrate"]?.environment).toMatchObject({
      HRMS_QA_SEED_ALLOW: "true",
      HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_platform_qa",
    });
    expect(services["hawkaii-hrms-api"]?.environment?.HRMS_QA_SEED_ALLOW).toBeUndefined();
    expect(services["hawkaii-hrms-outbox-worker"]?.environment?.HRMS_QA_SEED_ALLOW).toBeUndefined();
  });

  it("resolves the hosted QA template to production Node mode with real uploads required", () => {
    const services = effectiveCompose(".env.qa.example");
    for (const name of ["hawkaii-hrms-api", "hawkaii-hrms-migrate", "hawkaii-hrms-outbox-worker"]) {
      expect(services[name]?.environment).toMatchObject({
        APP_ENV: "qa",
        NODE_ENV: "production",
        CLOUDINARY_MOCK_UPLOADS: "false",
      });
    }
  });
});

describe("QA runtime configuration floor", () => {
  it("accepts local development with mock object storage", async () => {
    await expect(loadConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      CLOUDINARY_MOCK_UPLOADS: "true",
    })).resolves.toMatchObject({
      APP_ENV: "local",
      NODE_ENV: "development",
      CLOUDINARY_MOCK_UPLOADS: true,
    });
  });

  it("accepts hosted QA only with production Node mode and mock storage disabled", async () => {
    await expect(loadConfig({
      APP_ENV: "qa",
      NODE_ENV: "production",
      CLOUDINARY_MOCK_UPLOADS: "false",
    })).resolves.toMatchObject({
      APP_ENV: "qa",
      NODE_ENV: "production",
      CLOUDINARY_MOCK_UPLOADS: false,
    });
  });

  it("rejects hosted QA in development Node mode", async () => {
    await expect(loadConfig({
      APP_ENV: "qa",
      NODE_ENV: "development",
      CLOUDINARY_MOCK_UPLOADS: "false",
    })).rejects.toThrow(/Hosted QA and production must run with NODE_ENV=production/);
  });

  it("rejects mock object storage in hosted QA", async () => {
    await expect(loadConfig({
      APP_ENV: "qa",
      NODE_ENV: "production",
      CLOUDINARY_MOCK_UPLOADS: "true",
    })).rejects.toThrow(/CLOUDINARY_MOCK_UPLOADS can only be true/);
  });
});
