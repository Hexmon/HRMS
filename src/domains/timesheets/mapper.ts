import { asRecord, boolValue, dateText, numberValue, text, type ApiRecord } from "@/shared/api";
import type { TimesheetEntry, TimesheetWeek, TimesheetEntryStatus } from "@/lib/mock/timesheets";

function mapStatus(value: unknown, fallback: TimesheetEntryStatus = "draft"): TimesheetEntryStatus {
  const normalized = text(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  switch (normalized) {
    case "draft":
      return "draft";
    case "submitted":
    case "pending":
    case "pending_approval":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "returned":
      return "returned";
    default:
      return fallback;
  }
}

function nestedRecord(row: ApiRecord, key: string): ApiRecord {
  return asRecord(row[key]);
}

function nestedValue(row: ApiRecord, key: string, childKey: string): unknown {
  const value = row[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as ApiRecord)[childKey];
}

function firstAction(row: ApiRecord, decision: string): ApiRecord {
  const actions = Array.isArray(row.decision_history) ? row.decision_history : [];
  return asRecord(actions.find((action) => asRecord(action).decision === decision));
}

function lastAction(row: ApiRecord): ApiRecord {
  if (row.audit_event) return asRecord(row.audit_event);
  if (row.last_decision) return asRecord(row.last_decision);
  const actions = Array.isArray(row.decision_history) ? row.decision_history : [];
  return asRecord(actions.at(-1));
}

function weekStartForDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
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
  const employeeId = text(
    row.employee_code ??
      nestedValue(row, "employee", "employee_code") ??
      row.employee_id ??
      row.user_id ??
      fallback?.employeeId ??
      row.employee_user_id,
    "self",
  );
  const projectCode = text(row.project_code, fallback?.projectCode ?? "PROJECT");
  return {
    id: text(row.id, fallback?.id ?? `te_${employeeId}_${date}`),
    employeeId,
    employeeName: text(
      row.employee_name ?? row.user_name ?? nestedValue(row, "employee", "full_name"),
      fallback?.employeeName ?? "Employee",
    ),
    weekStart: dateText(row.week_start, fallback?.weekStart ?? weekStartForDate(date)).slice(0, 10),
    date,
    projectId: text(row.project_id ?? fallback?.projectId ?? row.project_code, projectCode),
    projectCode,
    projectName: text(row.project_name, fallback?.projectName ?? "Project"),
    task: text(row.task_name ?? row.task_code, fallback?.task ?? "General"),
    billable: boolValue(row.billable, fallback?.billable ?? false),
    hours: numberValue(row.hours, fallback?.hours ?? 0),
    description: text(row.description, fallback?.description ?? ""),
  };
}

export function mapApiSubmission(value: unknown, fallback?: Partial<TimesheetWeek>): TimesheetWeek {
  const row = asRecord(value);
  const employee = nestedRecord(row, "employee");
  const member = nestedRecord(row, "member");
  const department = asRecord(employee.department ?? member.department);
  const hours = asRecord(row.hours_summary);
  const submittedAction = firstAction(row, "submitted");
  const decisionAction = lastAction(row);
  const employeeId = text(
    employee.employee_code ??
      member.employee_code ??
      row.employee_code ??
      row.employee_id ??
      row.user_id ??
      fallback?.employeeId ??
      row.employee_user_id,
    "self",
  );
  const weekStart = dateText(
    row.week_start ?? row.cycle_start,
    fallback?.weekStart ?? new Date().toISOString(),
  ).slice(0, 10);
  const status = mapStatus(row.status, fallback?.status);
  const decidedAt =
    status === "approved" || status === "rejected" || status === "returned"
      ? text(decisionAction.created_at, fallback?.decidedAt)
      : fallback?.decidedAt;
  return {
    id: text(row.id, fallback?.id ?? `tw_${employeeId}_${weekStart}`),
    employeeId,
    employeeName: text(
      employee.full_name ?? member.full_name ?? row.employee_name ?? row.user_name,
      fallback?.employeeName ?? "Employee",
    ),
    department: text(
      department.name ?? row.department_name ?? row.department,
      fallback?.department ?? "General",
    ),
    weekStart,
    status,
    version: numberValue(
      asRecord(row.workflow_metadata).expected_version ?? row.version,
      fallback?.version ?? 1,
    ),
    totalHours: numberValue(hours.submitted_hours ?? row.total_hours, fallback?.totalHours),
    billableHours: numberValue(hours.billable_hours, fallback?.billableHours),
    nonBillableHours: numberValue(hours.non_billable_hours, fallback?.nonBillableHours),
    expectedHours: numberValue(hours.expected_hours, fallback?.expectedHours),
    missingHours: numberValue(hours.missing_hours, fallback?.missingHours),
    submittedAt: text(
      row.submitted_at ?? submittedAction.created_at ?? row.created_at,
      fallback?.submittedAt,
    ),
    decidedAt,
    decidedBy: text(
      row.decided_by_name ?? row.decided_by ?? decisionAction.actor_label,
      fallback?.decidedBy,
    ),
    remarks: text(row.remarks ?? decisionAction.remarks, fallback?.remarks),
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
