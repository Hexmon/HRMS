export const ReportExportTypeValues = [
  "expense",
  "expenses",
  "expenses/register",
  "expenses/my",
  "expenses/manager-queue",
  "expenses/manager-history",
  "expenses/finance-dashboard",
  "expenses/finance-history",
  "hr",
  "hr/employees",
  "attendance",
  "attendance/summary",
  "leave",
  "leave-wfh",
  "leave-wfh/summary",
  "projects",
  "projects/summary",
  "timesheets",
  "timesheets/summary",
  "assets",
  "assets/summary",
  "helpdesk",
  "helpdesk/summary",
  "audit",
] as const;

export type ReportExportType = (typeof ReportExportTypeValues)[number];

const reportExportTypes = new Set<string>(ReportExportTypeValues);

export function normalizeReportExportType(value: string): ReportExportType | null {
  const normalized = value.trim().toLowerCase();
  return reportExportTypes.has(normalized) ? normalized as ReportExportType : null;
}
