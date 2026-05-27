let accessToken: string | null = null;

export const API_UNAUTHORIZED_EVENT = "hawkaii:api-unauthorized";

export function setApiAccessToken(token: string | null | undefined): void {
  accessToken = token || null;
}

export function getApiAccessToken(): string | null {
  return accessToken;
}

export function clearApiAccessToken(): void {
  accessToken = null;
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
