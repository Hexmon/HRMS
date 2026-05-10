export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  module: string;
  at: string;
  ip: string;
}

export const AUDIT_LOGS: AuditLogEntry[] = [
  { id: "AL-1001", actor: "Aanya Mehta", action: "approved.leave", target: "LV-2202", module: "Leave & WFH", at: "2026-05-09 09:14", ip: "10.0.4.12" },
  { id: "AL-1002", actor: "Rahul Verma", action: "invited.employee", target: "EMP-1048", module: "Employees", at: "2026-05-08 17:42", ip: "10.0.4.18" },
  { id: "AL-1003", actor: "Priya Nair", action: "paid.expense", target: "EXP-5503", module: "Expenses", at: "2026-05-08 11:05", ip: "10.0.4.21" },
  { id: "AL-1004", actor: "Marco Rossi", action: "assigned.asset", target: "AST-7702", module: "Assets", at: "2026-05-07 15:33", ip: "10.0.4.27" },
  { id: "AL-1005", actor: "Sara Iqbal", action: "rejected.timesheet", target: "TS-9008", module: "Timesheet", at: "2026-05-07 10:28", ip: "10.0.4.34" },
];
