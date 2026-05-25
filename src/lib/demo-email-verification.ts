const DEMO_EMAIL_VERIFICATION_PREFIX = "hawkaii_demo_email_verification:";

export function isDemoEmailVerificationEnabled(): boolean {
  return import.meta.env.DEV;
}

export function rememberDemoEmailVerificationToken(email: string, token?: string | null): void {
  if (!isDemoEmailVerificationEnabled() || !token) return;
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(demoEmailVerificationKey(email), token);
}

export function readDemoEmailVerificationToken(email?: string): string | null {
  if (!isDemoEmailVerificationEnabled() || !email) return null;
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(demoEmailVerificationKey(email));
}

export function forgetDemoEmailVerificationToken(email?: string): void {
  if (!email || typeof window === "undefined") return;
  window.sessionStorage.removeItem(demoEmailVerificationKey(email));
}

function demoEmailVerificationKey(email: string): string {
  return `${DEMO_EMAIL_VERIFICATION_PREFIX}${email.trim().toLowerCase()}`;
}
