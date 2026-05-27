import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface LoadEnvOptions {
  override?: boolean;
  required?: boolean;
}

export function loadEnvFile(filePath: string, options: LoadEnvOptions = {}): Record<string, string> {
  const absolutePath = resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    if (options.required) {
      throw new Error(`Required env file not found: ${filePath}`);
    }
    return {};
  }

  const parsed: Record<string, string> = {};
  const content = readFileSync(absolutePath, "utf8");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals === -1) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    const rawValue = line.slice(equals + 1).trim();
    const value = rawValue.replace(/^["']|["']$/gu, "");
    parsed[key] = value;
    if (options.override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return parsed;
}

export function loadRuntimeEnv(defaultFile = ".env.local"): Record<string, string> {
  return loadEnvFile(process.env.HRMS_ENV_FILE ?? defaultFile, { required: !process.env.DATABASE_URL });
}

export function loadTestEnv(): Record<string, string> {
  return loadEnvFile(process.env.HRMS_ENV_FILE ?? ".env.test", {
    required: !process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL
  });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
