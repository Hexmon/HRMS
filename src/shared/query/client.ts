import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";
import { ApiError, ApiUnavailableError } from "@/shared/api";

export const queryTimings = {
  realtimeStaleMs: 15_000,
  listStaleMs: 45_000,
  detailStaleMs: 60_000,
  referenceStaleMs: 5 * 60_000,
  gcMs: 10 * 60_000,
} as const;

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if ([400, 401, 403, 409, 422, 429].includes(error.status)) return false;
    return failureCount < 2;
  }
  if (error instanceof ApiUnavailableError) return failureCount < 1;
  return failureCount < 2;
}

export function createAppQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      queries: {
        staleTime: queryTimings.listStaleMs,
        gcTime: queryTimings.gcMs,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        ...config.defaultOptions?.queries,
      },
      mutations: {
        retry: false,
        ...config.defaultOptions?.mutations,
      },
    },
  });
}
