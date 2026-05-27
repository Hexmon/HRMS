const DEFAULT_API_BASE_URL = "http://localhost:3001";

function envValue(key: string): string | undefined {
  return import.meta.env[key] as string | undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

const isProductionMode = import.meta.env.PROD || import.meta.env.MODE === "production";
const requestedMockFallback = parseBoolean(envValue("VITE_API_MOCK_FALLBACK"), !isProductionMode);

export const apiConfig = {
  baseUrl: normalizeBaseUrl(envValue("VITE_API_BASE_URL")),
  enabled: parseBoolean(envValue("VITE_API_ENABLED"), true),
  mockFallback: isProductionMode ? false : requestedMockFallback,
  rateLimitEnabled: parseBoolean(envValue("VITE_API_RATE_LIMIT_ENABLED"), true),
  rateLimitMaxRequests: parseNumber(envValue("VITE_API_RATE_LIMIT_MAX_REQUESTS"), 50),
  rateLimitWindowMs: parseNumber(envValue("VITE_API_RATE_LIMIT_WINDOW_MS"), 10_000),
  searchDebounceMs: parseNumber(envValue("VITE_API_SEARCH_DEBOUNCE_MS"), 350),
} as const;

export function isApiEnabled(): boolean {
  return apiConfig.enabled;
}

export function isMockFallbackEnabled(): boolean {
  return apiConfig.mockFallback;
}
