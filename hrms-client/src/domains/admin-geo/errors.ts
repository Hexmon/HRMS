import { ApiError, formatUserFacingError, type ApiRecord } from "@/shared/api";

function record(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApiRecord) : {};
}

function firstText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.trim());
    return typeof first === "string" ? first : null;
  }
  return null;
}

export function adminGeoFieldError(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = record(error.details);
  if (details.field === field) return error.message;
  const fieldErrors = record(details.fieldErrors);
  return firstText(fieldErrors[field]);
}

export function adminGeoFormError(error: unknown, fallback: string): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.details) {
    const details = record(error.details);
    if (details.code === "geofence_published_period_overlap") {
      return "Selected effective dates overlap an existing published geofence version.";
    }
  }
  const formatted = formatUserFacingError(error, fallback);
  return formatted.description ? `${formatted.title} ${formatted.description}` : formatted.title;
}
