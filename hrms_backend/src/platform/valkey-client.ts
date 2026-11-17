import { Redis as Valkey, type RedisOptions } from "iovalkey";

const supportedProtocols = new Set(["redis:", "rediss:"]);

export function validateValkeyUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("VALKEY_URL must be a valid redis:// or rediss:// URL.");
  }

  if (!supportedProtocols.has(parsed.protocol)) {
    throw new Error(
      "VALKEY_URL must use redis:// or rediss://. Upstash REST URLs are not compatible with the TCP Valkey client.",
    );
  }
  if (!parsed.hostname) {
    throw new Error("VALKEY_URL must include a hostname.");
  }
  return value;
}

export function createValkeyClient(
  valkeyUrl: string,
  options: RedisOptions = {},
): Valkey {
  const client = new Valkey(validateValkeyUrl(valkeyUrl), {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    keepAlive: 10_000,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
    ...options,
  });

  let lastErrorLogAt = 0;
  client.on("error", (error: Error) => {
    const now = Date.now();
    if (now - lastErrorLogAt < 30_000) {
      return;
    }
    lastErrorLogAt = now;
    console.error(JSON.stringify({
      component: "valkey",
      event: "connection_error",
      message: safeValkeyError(error),
    }));
  });
  return client;
}

function safeValkeyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/rediss?:\/\/[^\s]+/giu, "redis://[redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/gu, "[redacted]")
    .slice(0, 180);
}
