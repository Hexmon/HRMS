export type AttendanceReportingEvidenceCategory =
  | "verified"
  | "warning"
  | "provisional"
  | "review_required"
  | "rejected";

export const ATTENDANCE_REPORTING_EVIDENCE_OPTIONS: Array<{
  value: AttendanceReportingEvidenceCategory;
  label: string;
}> = [
  { value: "verified", label: "Verified" },
  { value: "warning", label: "Warning" },
  { value: "provisional", label: "Provisional" },
  { value: "review_required", label: "Review required" },
  { value: "rejected", label: "Rejected" },
];

export function attendanceReportingEvidenceLabel(value: unknown): string {
  const match = ATTENDANCE_REPORTING_EVIDENCE_OPTIONS.find((option) => option.value === value);
  return match?.label ?? "—";
}
