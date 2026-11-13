import { getApiAccessToken } from "@/shared/api";

function currentActorId(): string {
  const payload = getApiAccessToken()?.split(".")[1];
  if (!payload) throw new Error("Sign in again before changing an expense.");
  try {
    const parsed = JSON.parse(atob(payload.replace(/-/gu, "+").replace(/_/gu, "/"))) as {
      sub?: unknown;
    };
    if (typeof parsed.sub === "string" && parsed.sub.length > 0) return parsed.sub;
  } catch {
    // Backend verifies the token; this local ID is only a storage namespace.
  }
  throw new Error("Sign in again before changing an expense.");
}

export async function withExpenseCommandKey<T>(
  ticketId: string,
  action: string,
  input: unknown,
  send: (key: string) => Promise<T>,
): Promise<T> {
  if (
    typeof window === "undefined" ||
    !globalThis.crypto?.subtle ||
    !globalThis.crypto.randomUUID
  ) {
    throw new Error("Secure retry tracking is unavailable in this browser.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ ticketId, action, input })),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `hawkaii:expense-command:${currentActorId()}:${fingerprint}`;
  let key: string;
  try {
    key = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
  } catch {
    throw new Error("Secure retry tracking is unavailable in this browser.");
  }
  // Keep the key on any uncertain failure, including a lost response, so a
  // refresh and retry resolve the committed result instead of applying again.
  const result = await send(key);
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // A confirmed server success must not turn into a false failure.
  }
  return result;
}
