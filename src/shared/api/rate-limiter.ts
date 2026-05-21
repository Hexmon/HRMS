import { apiConfig } from "./config";

const requestTimestamps: number[] = [];
let cooldownUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function prune(now: number): void {
  const oldestAllowed = now - apiConfig.rateLimitWindowMs;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oldestAllowed) {
    requestTimestamps.shift();
  }
}

export async function waitForClientRateLimit(): Promise<void> {
  if (!apiConfig.rateLimitEnabled || typeof window === "undefined") return;

  const now = Date.now();
  if (cooldownUntil > now) {
    await sleep(cooldownUntil - now);
  }

  const afterCooldown = Date.now();
  prune(afterCooldown);

  if (requestTimestamps.length >= apiConfig.rateLimitMaxRequests) {
    const waitMs = apiConfig.rateLimitWindowMs - (afterCooldown - requestTimestamps[0]);
    if (waitMs > 0) await sleep(waitMs);
    prune(Date.now());
  }

  requestTimestamps.push(Date.now());
}

export function registerRetryAfter(retryAfterSeconds: number | undefined): void {
  if (!apiConfig.rateLimitEnabled || retryAfterSeconds == null) return;
  cooldownUntil = Math.max(cooldownUntil, Date.now() + retryAfterSeconds * 1000);
}

export function registerDefaultCooldown(): void {
  if (!apiConfig.rateLimitEnabled) return;
  cooldownUntil = Math.max(cooldownUntil, Date.now() + apiConfig.rateLimitWindowMs);
}
