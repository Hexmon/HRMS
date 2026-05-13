import fp from "fastify-plugin";
import { Redis as Valkey } from "iovalkey";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const memoryBuckets = new Map<string, RateLimitBucket>();

export const rateLimitPlugin = fp(async (fastify) => {
  if (!fastify.config.RATE_LIMIT_ENABLED) {
    return;
  }

  const valkey = fastify.store.kind === "postgres" && fastify.config.VALKEY_URL
    ? new Valkey(fastify.config.VALKEY_URL, { lazyConnect: true, maxRetriesPerRequest: 2 })
    : null;

  fastify.addHook("onClose", async () => {
    valkey?.disconnect();
    if (!valkey) {
      memoryBuckets.clear();
    }
  });

  fastify.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (shouldSkipRateLimit(path)) {
      return;
    }

    const policy = policyFor(path, request.method, fastify.config);
    if (!policy) {
      return;
    }

    const subject = request.actor?.id ? `user:${request.actor.id}` : `ip:${request.ip}`;
    const routeBucket = request.routeOptions.url ?? normalizePath(path);
    const key = `hrms:rate-limit:${policy.name}:${subject}:${request.method}:${routeBucket}`;
    const result = await hitRateLimitBucket({
      key,
      limit: policy.limit,
      windowSeconds: fastify.config.RATE_LIMIT_WINDOW_SECONDS,
      valkey
    });

    reply.header("X-RateLimit-Limit", String(result.limit));
    reply.header("X-RateLimit-Remaining", String(result.remaining));
    reply.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (result.count <= result.limit) {
      return;
    }

    reply.header("Retry-After", String(result.retryAfterSeconds));
    return reply.status(429).send({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please wait and try again.",
      details: { retry_after_seconds: result.retryAfterSeconds },
      request_id: request.requestId
    });
  });
});

function shouldSkipRateLimit(path: string): boolean {
  return (
    path === "/docs" ||
    path.startsWith("/docs/") ||
    path === "/api/v1/openapi.json" ||
    path === "/health/live" ||
    path === "/health/ready" ||
    path === "/api/v1/health/live" ||
    path === "/api/v1/health/ready" ||
    !path.startsWith("/api/v1/")
  );
}

function policyFor(path: string, method: string, config: {
  RATE_LIMIT_AUTH_MAX: number;
  RATE_LIMIT_PUBLIC_MAX: number;
  RATE_LIMIT_READ_MAX: number;
  RATE_LIMIT_WRITE_MAX: number;
}): { name: string; limit: number } | null {
  if (path === "/api/v1/auth/login") {
    return { name: "auth", limit: config.RATE_LIMIT_AUTH_MAX };
  }
  if (path.startsWith("/api/v1/assets/scan/")) {
    return { name: "public", limit: config.RATE_LIMIT_PUBLIC_MAX };
  }
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { name: "read", limit: config.RATE_LIMIT_READ_MAX };
  }
  return { name: "write", limit: config.RATE_LIMIT_WRITE_MAX };
}

async function hitRateLimitBucket({
  key,
  limit,
  valkey,
  windowSeconds
}: {
  key: string;
  limit: number;
  valkey: Valkey | null;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  if (valkey) {
    return hitValkeyBucket(valkey, key, limit, windowSeconds);
  }
  return hitMemoryBucket(key, limit, windowSeconds);
}

async function hitValkeyBucket(valkey: Valkey, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  await valkey.connect().catch((error: unknown) => {
    if (error instanceof Error && /already connecting|already connected/iu.test(error.message)) {
      return;
    }
    throw error;
  });
  const count = await valkey.incr(key);
  let ttl = await valkey.ttl(key);
  if (count === 1 || ttl < 0) {
    await valkey.expire(key, windowSeconds);
    ttl = windowSeconds;
  }
  const retryAfterSeconds = Math.max(1, ttl);
  const resetAt = Date.now() + retryAfterSeconds * 1000;
  return {
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds
  };
}

function hitMemoryBucket(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? { count: existing.count + 1, resetAt: existing.resetAt }
    : { count: 1, resetAt: now + windowSeconds * 1000 };
  memoryBuckets.set(key, bucket);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    count: bucket.count,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds
  };
}

function normalizePath(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, "{id}");
}
