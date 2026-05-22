import type { ApiRecord, PaginatedResponse } from "./types";

export function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): ApiRecord {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function pageItems<T = ApiRecord>(value: unknown): T[] {
  if (!isRecord(value)) return [];
  const page = value as unknown as Partial<PaginatedResponse<T>>;
  return Array.isArray(page.items) ? page.items : [];
}

export function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}

export function dateText(value: unknown, fallback = new Date().toISOString()): string {
  const raw = text(value);
  return raw || fallback;
}

export function isUuid(value: string | undefined): boolean {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}
