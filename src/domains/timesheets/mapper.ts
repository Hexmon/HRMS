import { asRecord, boolValue, dateText, numberValue, text, type ApiRecord } from "@/shared/api";
import type { TimesheetEntry, TimesheetWeek, TimesheetEntryStatus } from "@/lib/mock/timesheets";

function mapStatus(value: unknown, fallback: TimesheetEntryStatus = "draft"): TimesheetEntryStatus {
  const normalized = text(value).toLowerCase();
  if (["draft", "submitted", "pending", "approved", "rejected", "returned"].includes(normalized)) {
    return normalized as TimesheetEntryStatus;
  }
  return fallback;
}

export function mapApiWorkSegment(
  value: unknown,
  fallback?: Partial<TimesheetEntry>,
): TimesheetEntry {
  const row = asRecord(value);
  const date = dateText(
    row.work_date ?? row.date,
    fallback?.date ?? new Date().toISOString(),
  ).slice(0, 10);
  const employeeId = text(row.employee_id ?? row.user_id, fallback?.employeeId ?? "self");
  return {
    id: text(row.id, fallback?.id ?? `te_${employeeId}_${date}`),
    employeeId,
    employeeName: text(row.employee_name ?? row.user_name, fallback?.employeeName ?? "Employee"),
    weekStart: dateText(row.week_start, fallback?.weekStart ?? date).slice(0, 10),
    date,
    projectId: text(row.project_id ?? row.project_code, fallback?.projectId ?? "project"),
    projectCode: text(row.project_code, fallback?.projectCode ?? "PROJECT"),
    projectName: text(row.project_name, fallback?.projectName ?? "Project"),
    task: text(row.task_name ?? row.task_code, fallback?.task ?? "General"),
    billable: boolValue(row.billable, fallback?.billable ?? false),
    hours: numberValue(row.hours, fallback?.hours ?? 0),
    description: text(row.description, fallback?.description ?? ""),
  };
}

export function mapApiSubmission(value: unknown, fallback?: Partial<TimesheetWeek>): TimesheetWeek {
  const row = asRecord(value);
  const employeeId = text(row.employee_id ?? row.user_id, fallback?.employeeId ?? "self");
  const weekStart = dateText(
    row.week_start ?? row.cycle_start,
    fallback?.weekStart ?? new Date().toISOString(),
  ).slice(0, 10);
  return {
    id: text(row.id, fallback?.id ?? `tw_${employeeId}_${weekStart}`),
    employeeId,
    employeeName: text(row.employee_name ?? row.user_name, fallback?.employeeName ?? "Employee"),
    department: text(row.department_name ?? row.department, fallback?.department ?? "General"),
    weekStart,
    status: mapStatus(row.status, fallback?.status),
    submittedAt: text(row.submitted_at, fallback?.submittedAt),
    decidedAt: text(row.decided_at, fallback?.decidedAt),
    decidedBy: text(row.decided_by_name ?? row.decided_by, fallback?.decidedBy),
    remarks: text(row.remarks, fallback?.remarks),
  };
}

export function mapApiWorkSegments(
  values: unknown[],
  fallbacks: TimesheetEntry[],
): TimesheetEntry[] {
  return values.map((value) => {
    const row = asRecord(value);
    const id = text(row.id);
    const fallback = fallbacks.find((entry) => entry.id === id);
    return mapApiWorkSegment(row as ApiRecord, fallback);
  });
}

export function mapApiSubmissions(values: unknown[], fallbacks: TimesheetWeek[]): TimesheetWeek[] {
  return values.map((value) => {
    const row = asRecord(value);
    const id = text(row.id);
    const fallback = fallbacks.find((week) => week.id === id);
    return mapApiSubmission(row as ApiRecord, fallback);
  });
}
