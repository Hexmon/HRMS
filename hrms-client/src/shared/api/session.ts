const ACCESS_TOKEN_STORAGE_KEY = "hawkaii_api_access_token";
const ACTOR_SCOPE_STORAGE_KEY = "hawkaii_api_actor_scope";

export interface ApiActorScope {
  userId: string;
  companyId: string;
}

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    else window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    // Session restore should never break the app if browser storage is unavailable.
  }
}

let accessToken: string | null = readStoredAccessToken();
let actorScope: ApiActorScope | null = readStoredActorScope();

function readStoredActorScope(): ApiActorScope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTOR_SCOPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApiActorScope>;
    return typeof parsed.userId === "string" &&
      parsed.userId.length > 0 &&
      typeof parsed.companyId === "string" &&
      parsed.companyId.length > 0
      ? { userId: parsed.userId, companyId: parsed.companyId }
      : null;
  } catch {
    return null;
  }
}

function writeStoredActorScope(scope: ApiActorScope | null): void {
  if (typeof window === "undefined") return;
  try {
    if (scope) window.sessionStorage.setItem(ACTOR_SCOPE_STORAGE_KEY, JSON.stringify(scope));
    else window.sessionStorage.removeItem(ACTOR_SCOPE_STORAGE_KEY);
  } catch {
    // Session restore should never break the app if browser storage is unavailable.
  }
}

export const API_UNAUTHORIZED_EVENT = "hawkaii:api-unauthorized";

export function setApiAccessToken(token: string | null | undefined): void {
  accessToken = token || null;
  writeStoredAccessToken(accessToken);
}

export function getApiAccessToken(): string | null {
  return accessToken;
}

export function clearApiAccessToken(): void {
  accessToken = null;
  writeStoredAccessToken(null);
}

export function setApiActorScope(userId: string, companyId: string): void {
  actorScope = userId && companyId ? { userId, companyId } : null;
  writeStoredActorScope(actorScope);
}

export function getApiActorScope(): ApiActorScope | null {
  return actorScope;
}

export function clearApiActorScope(): void {
  actorScope = null;
  writeStoredActorScope(null);
}

export function notifyApiUnauthorized(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(API_UNAUTHORIZED_EVENT));
}

export function onApiUnauthorized(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(API_UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handler);
}
