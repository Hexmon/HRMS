import type { ApiErrorBody, ApiRecord } from "./types";

interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: ApiRecord;
  requestId?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiRecord;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    if (options.cause) this.cause = options.cause;
  }
}

export class ApiUnavailableError extends Error {
  constructor(message = "Backend API is unavailable.", cause?: unknown) {
    super(message);
    this.name = "ApiUnavailableError";
    if (cause) this.cause = cause;
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  return undefined;
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  let parsed: Partial<ApiErrorBody> | undefined;

  try {
    parsed = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    parsed = undefined;
  }

  return new ApiError({
    status: response.status,
    code: parsed?.code || `HTTP_${response.status}`,
    message: parsed?.message || response.statusText || "Request failed.",
    details: parsed?.details,
    requestId: parsed?.request_id || response.headers.get("x-request-id") || undefined,
    retryAfterSeconds,
  });
}

export function isApiBusinessError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status >= 400 && error.status < 500;
}

export function isApiUnavailableError(error: unknown): boolean {
  if (error instanceof ApiUnavailableError) return true;
  if (error instanceof ApiError) return error.status >= 500;
  return error instanceof TypeError;
}

export function shouldUseMockFallback(error: unknown): boolean {
  return isApiUnavailableError(error) && !isApiBusinessError(error);
}
