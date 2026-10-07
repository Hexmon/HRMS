import type {
  AttendancePrivacyAction,
  AttendancePrivacyMode,
  EmployeeAttendancePrivacySummary,
} from "./api";

export function attendanceModeLabel(mode: AttendancePrivacyMode): string {
  switch (mode) {
    case "manual_only":
      return "Manual only";
    case "geo_optional":
      return "Geo optional";
    case "geo_preferred":
      return "Geo preferred";
    case "geo_required":
      return "Geo required";
  }
}

export function locationCollectionText(summary: EmployeeAttendancePrivacySummary): string {
  const mode = summary.effective_policy.attendance_mode;
  switch (mode) {
    case "manual_only":
      return "Your current policy does not require location for normal web attendance actions.";
    case "geo_optional":
      return "Location may be attached when available, but basic failure to provide location does not automatically block attendance.";
    case "geo_preferred":
      return "Location is preferred under your policy. If evidence is missing or does not meet policy requirements, the configured action determines whether attendance is allowed, denied, or offered through manual fallback.";
    case "geo_required":
      return "Location is required under your policy. If location evidence is unavailable or does not meet the policy, HRMS follows the configured fallback or denial rules.";
  }
}

export function actionLabel(action: AttendancePrivacyAction): string {
  switch (action) {
    case "allow":
      return "Allowed";
    case "deny":
      return "Denied";
    case "manual_fallback":
      return "Manual fallback";
  }
}

export function actionDescription(action: AttendancePrivacyAction): string {
  switch (action) {
    case "allow":
      return "This condition may be allowed under your current policy.";
    case "deny":
      return "This condition may cause the attendance action to be denied.";
    case "manual_fallback":
      return "This condition may offer an explicit manual fallback for review.";
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Unavailable";
  if (seconds < 60) return unit(seconds, "second");
  if (seconds % 86_400 === 0) return unit(seconds / 86_400, "day");
  if (seconds % 3_600 === 0) return unit(seconds / 3_600, "hour");
  if (seconds % 60 === 0) return unit(seconds / 60, "minute");
  return unit(seconds, "second");
}

export function formatMilliseconds(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Not configured";
  return formatDuration(Math.round(value / 1000));
}

function unit(value: number, label: string): string {
  const rounded = Math.round(value);
  return `${rounded} ${label}${rounded === 1 ? "" : "s"}`;
}
