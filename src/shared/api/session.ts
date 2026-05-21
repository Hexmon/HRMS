let accessToken: string | null = null;

export function setApiAccessToken(token: string | null | undefined): void {
  accessToken = token || null;
}

export function getApiAccessToken(): string | null {
  return accessToken;
}

export function clearApiAccessToken(): void {
  accessToken = null;
}
