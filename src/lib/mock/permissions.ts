export interface Permission {
  key: string;
  label: string;
  scope: "global" | "team" | "self";
  description: string;
}

export const PERMISSIONS: Permission[] = [
  { key: "employees.read", label: "View employees", scope: "global", description: "View the org-wide employee directory." },
  { key: "employees.write", label: "Manage employees", scope: "global", description: "Invite, edit and deactivate employees." },
  { key: "leave.approve", label: "Approve leave", scope: "team", description: "Approve or reject leave requests for your team." },
  { key: "timesheet.approve", label: "Approve timesheets", scope: "team", description: "Approve weekly timesheets for direct reports." },
  { key: "expense.approve", label: "Approve expenses", scope: "team", description: "Approve expense claims up to your limit." },
  { key: "expense.pay", label: "Process expense payments", scope: "global", description: "Mark approved expenses as paid." },
  { key: "asset.assign", label: "Assign assets", scope: "global", description: "Assign or reclaim hardware and IT inventory." },
  { key: "ticket.resolve", label: "Resolve tickets", scope: "global", description: "Triage, work on and close helpdesk tickets." },
  { key: "reports.view", label: "View reports", scope: "global", description: "Access operational and finance reports." },
  { key: "settings.manage", label: "Manage settings", scope: "global", description: "Configure company, roles and workflows." },
  { key: "audit.view", label: "View audit log", scope: "global", description: "Read the immutable audit log of critical actions." },
];
