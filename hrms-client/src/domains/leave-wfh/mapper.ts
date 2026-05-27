import { asArray, asRecord, numberValue, text, type ApiRecord } from "@/shared/api";
import type { Holiday, LeaveRequest } from "@/lib/leave-store";

export interface LeaveBalanceView {
  leaveType: string;
  label: string;
  total: number;
  used: number;
  pending: number;
  available: number;
}

export function mapBalance(record: ApiRecord): LeaveBalanceView {
  return {
    leaveType: text(record.leave_type),
    label: text(record.label, text(record.leave_type).replaceAll("_", " ")),
    total: numberValue(record.total),
    used: numberValue(record.used),
    pending: numberValue(record.pending),
    available: numberValue(record.available),
  };
}

export function balancesFromResponse(value: unknown): LeaveBalanceView[] {
  return asArray(asRecord(value).balances).map((item) => mapBalance(asRecord(item)));
}

export function mapLeaveWfhRequest(record: ApiRecord): LeaveRequest {
  const employee = asRecord(record.employee);
  const approver = asRecord(record.approver);
  const kind = text(record.kind) === "wfh" ? "wfh" : "leave";
  const status = text(record.status) as LeaveRequest["status"];
  return {
    id: text(record.id, text(record.request_id)),
    kind,
    employee: text(employee.full_name, "You"),
    department: text(employee.department_name, text(employee.department_code, "Team")),
    manager: text(approver.full_name, "Manager"),
    leaveType:
      kind === "leave" ? (text(record.leave_type) as LeaveRequest["leaveType"]) : undefined,
    fromDate: text(record.date_from),
    toDate: text(record.date_to),
    halfDay: Boolean(record.half_day),
    duration: numberValue(record.duration),
    reason: text(record.reason),
    projectRef: text(record.project_ref) || undefined,
    status,
    remarks: text(record.decision_remarks) || undefined,
    createdAt: text(record.created_at),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function requestsFromPage(value: unknown): LeaveRequest[] {
  return asArray(asRecord(value).items).map((item) => mapLeaveWfhRequest(asRecord(item)));
}

export function mapHoliday(record: ApiRecord): Holiday & { expectedVersion: number } {
  return {
    id: text(record.id),
    name: text(record.name),
    date: text(record.date, text(record.holiday_date)),
    region: text(record.region, "All"),
    optional: Boolean(record.optional),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function holidaysFromResponse(value: unknown): Array<Holiday & { expectedVersion: number }> {
  return asArray(asRecord(value).holidays).map((item) => mapHoliday(asRecord(item)));
}
