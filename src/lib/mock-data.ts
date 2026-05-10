export type Role =
  | "main_admin"
  | "hr_admin"
  | "admin"
  | "employee"
  | "manager"
  | "team_lead"
  | "module_lead"
  | "project_manager"
  | "finance_manager"
  | "asset_admin"
  | "helpdesk_agent"
  | "auditor";

export const ROLE_LABELS: Record<Role, string> = {
  main_admin: "Main Admin",
  hr_admin: "HR Admin",
  admin: "Admin",
  employee: "Employee",
  manager: "Manager",
  team_lead: "Team Lead",
  module_lead: "Module Lead",
  project_manager: "Project Manager",
  finance_manager: "Finance Manager",
  asset_admin: "Asset / IT Admin",
  helpdesk_agent: "Helpdesk Agent",
  auditor: "Auditor",
};

export interface MockUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  roles: Role[];
  department: string;
  designation: string;
}

export const MOCK_USERS: MockUser[] = [
  { id: "u1", name: "Aanya Mehta", email: "aanya@hawkaii.com", roles: ["main_admin"], department: "Executive", designation: "Founder & CEO" },
  { id: "u2", name: "Rahul Verma", email: "rahul@hawkaii.com", roles: ["hr_admin"], department: "People Ops", designation: "HR Director" },
  { id: "u3", name: "Sara Iqbal", email: "sara@hawkaii.com", roles: ["manager", "project_manager"], department: "Engineering", designation: "Engineering Manager" },
  { id: "u4", name: "Daniel Park", email: "daniel@hawkaii.com", roles: ["employee"], department: "Engineering", designation: "Senior Software Engineer" },
  { id: "u5", name: "Priya Nair", email: "priya@hawkaii.com", roles: ["finance_manager"], department: "Finance", designation: "Finance Manager" },
  { id: "u6", name: "Marco Rossi", email: "marco@hawkaii.com", roles: ["asset_admin"], department: "IT Operations", designation: "IT Operations Lead" },
  { id: "u7", name: "Linh Tran", email: "linh@hawkaii.com", roles: ["helpdesk_agent"], department: "Support", designation: "Helpdesk Specialist" },
];

export type Status = "approved" | "pending" | "rejected" | "active" | "inactive" | "draft" | "in_progress" | "completed" | "on_hold" | "open" | "closed" | "paid" | "overdue";

export interface Employee {
  id: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  manager: string;
  location: string;
  status: "active" | "inactive";
  joinedAt: string;
}

export const EMPLOYEES: Employee[] = [
  { id: "EMP-1042", name: "Daniel Park", email: "daniel@hawkaii.com", designation: "Senior Software Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Bangalore", status: "active", joinedAt: "2022-03-14" },
  { id: "EMP-1043", name: "Mei Lin", email: "mei@hawkaii.com", designation: "Product Designer", department: "Design", manager: "Aanya Mehta", location: "Singapore", status: "active", joinedAt: "2023-01-09" },
  { id: "EMP-1044", name: "Jacob Owens", email: "jacob@hawkaii.com", designation: "DevOps Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Remote", status: "active", joinedAt: "2021-11-02" },
  { id: "EMP-1045", name: "Fatima Noor", email: "fatima@hawkaii.com", designation: "Backend Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Dubai", status: "active", joinedAt: "2024-04-22" },
  { id: "EMP-1046", name: "Carlos Mendes", email: "carlos@hawkaii.com", designation: "QA Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Lisbon", status: "inactive", joinedAt: "2020-06-18" },
  { id: "EMP-1047", name: "Hana Kobayashi", email: "hana@hawkaii.com", designation: "Data Analyst", department: "Analytics", manager: "Aanya Mehta", location: "Tokyo", status: "active", joinedAt: "2023-08-30" },
  { id: "EMP-1048", name: "Olu Adeyemi", email: "olu@hawkaii.com", designation: "Platform Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Lagos", status: "active", joinedAt: "2024-09-01" },
];

export interface AttendanceRow {
  id: string;
  employee: string;
  date: string;
  checkIn: string;
  checkOut: string;
  hours: string;
  status: "present" | "late" | "absent" | "wfh";
}

export const ATTENDANCE: AttendanceRow[] = [
  { id: "A1", employee: "Daniel Park", date: "2026-05-09", checkIn: "09:02", checkOut: "18:30", hours: "9h 28m", status: "present" },
  { id: "A2", employee: "Mei Lin", date: "2026-05-09", checkIn: "10:14", checkOut: "19:05", hours: "8h 51m", status: "late" },
  { id: "A3", employee: "Jacob Owens", date: "2026-05-09", checkIn: "08:45", checkOut: "17:50", hours: "9h 05m", status: "wfh" },
  { id: "A4", employee: "Fatima Noor", date: "2026-05-09", checkIn: "—", checkOut: "—", hours: "0h", status: "absent" },
  { id: "A5", employee: "Hana Kobayashi", date: "2026-05-09", checkIn: "09:00", checkOut: "18:00", hours: "9h 00m", status: "present" },
];

export interface LeaveRequest {
  id: string;
  employee: string;
  type: "Casual" | "Sick" | "Earned" | "WFH";
  from: string;
  to: string;
  days: number;
  status: "approved" | "pending" | "rejected";
  approver: string;
}

export const LEAVES: LeaveRequest[] = [
  { id: "LV-2201", employee: "Daniel Park", type: "Earned", from: "2026-05-15", to: "2026-05-19", days: 5, status: "pending", approver: "Sara Iqbal" },
  { id: "LV-2202", employee: "Mei Lin", type: "WFH", from: "2026-05-12", to: "2026-05-12", days: 1, status: "approved", approver: "Aanya Mehta" },
  { id: "LV-2203", employee: "Jacob Owens", type: "Sick", from: "2026-05-08", to: "2026-05-09", days: 2, status: "approved", approver: "Sara Iqbal" },
  { id: "LV-2204", employee: "Fatima Noor", type: "Casual", from: "2026-05-20", to: "2026-05-21", days: 2, status: "rejected", approver: "Sara Iqbal" },
  { id: "LV-2205", employee: "Hana Kobayashi", type: "Earned", from: "2026-06-01", to: "2026-06-07", days: 7, status: "pending", approver: "Aanya Mehta" },
];

export interface Project {
  id: string;
  name: string;
  client: string;
  manager: string;
  team: number;
  progress: number;
  status: "active" | "on_hold" | "completed";
  dueDate: string;
}

export const PROJECTS: Project[] = [
  { id: "PRJ-301", name: "Atlas Payments Platform", client: "NorthBank", manager: "Sara Iqbal", team: 12, progress: 72, status: "active", dueDate: "2026-08-15" },
  { id: "PRJ-302", name: "Helios Analytics Cloud", client: "Sunline Retail", manager: "Sara Iqbal", team: 8, progress: 41, status: "active", dueDate: "2026-09-30" },
  { id: "PRJ-303", name: "Orion CRM Migration", client: "Vertex Corp", manager: "Aanya Mehta", team: 6, progress: 100, status: "completed", dueDate: "2026-04-10" },
  { id: "PRJ-304", name: "Nimbus Data Lake", client: "Skyfin", manager: "Sara Iqbal", team: 9, progress: 18, status: "on_hold", dueDate: "2026-12-01" },
];

export interface TimesheetRow {
  id: string;
  employee: string;
  project: string;
  task: string;
  hours: number;
  date: string;
  status: "draft" | "pending" | "approved" | "rejected";
}

export const TIMESHEETS: TimesheetRow[] = [
  { id: "TS-9001", employee: "Daniel Park", project: "Atlas Payments", task: "API Hardening", hours: 7.5, date: "2026-05-08", status: "approved" },
  { id: "TS-9002", employee: "Fatima Noor", project: "Helios Analytics", task: "Schema Design", hours: 6, date: "2026-05-08", status: "pending" },
  { id: "TS-9003", employee: "Jacob Owens", project: "Atlas Payments", task: "K8s Migration", hours: 8, date: "2026-05-08", status: "approved" },
  { id: "TS-9004", employee: "Hana Kobayashi", project: "Helios Analytics", task: "Dashboard Wireframes", hours: 5.5, date: "2026-05-08", status: "draft" },
];

export interface Expense {
  id: string;
  employee: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  status: "pending" | "approved" | "rejected" | "paid";
}

export const EXPENSES: Expense[] = [
  { id: "EXP-5501", employee: "Daniel Park", category: "Travel", amount: 482.5, currency: "USD", date: "2026-05-02", status: "approved" },
  { id: "EXP-5502", employee: "Mei Lin", category: "Software", amount: 129.0, currency: "USD", date: "2026-05-04", status: "pending" },
  { id: "EXP-5503", employee: "Jacob Owens", category: "Internet", amount: 60.0, currency: "USD", date: "2026-05-01", status: "paid" },
  { id: "EXP-5504", employee: "Fatima Noor", category: "Client Lunch", amount: 215.75, currency: "AED", date: "2026-04-29", status: "rejected" },
];

export interface Asset {
  id: string;
  name: string;
  category: string;
  serial: string;
  assignedTo: string;
  status: "assigned" | "in_stock" | "repair";
  assignedOn: string;
}

export const ASSETS: Asset[] = [
  { id: "AST-7701", name: 'MacBook Pro 16"', category: "Laptop", serial: "C02XK1234ABC", assignedTo: "Daniel Park", status: "assigned", assignedOn: "2024-01-12" },
  { id: "AST-7702", name: "Dell UltraSharp 27\"", category: "Monitor", serial: "DLU27-89241", assignedTo: "Mei Lin", status: "assigned", assignedOn: "2024-03-04" },
  { id: "AST-7703", name: "iPhone 15", category: "Phone", serial: "IP15-77321", assignedTo: "—", status: "in_stock", assignedOn: "—" },
  { id: "AST-7704", name: "ThinkPad X1", category: "Laptop", serial: "TPX1-55421", assignedTo: "—", status: "repair", assignedOn: "—" },
];

export interface Ticket {
  id: string;
  title: string;
  category: "IT" | "HR" | "Finance" | "Facilities";
  priority: "Low" | "Medium" | "High" | "Critical";
  raisedBy: string;
  assignee: string;
  status: "open" | "in_progress" | "on_hold" | "closed";
  createdAt: string;
}

export const TICKETS: Ticket[] = [
  { id: "TKT-12001", title: "VPN not connecting from Lagos", category: "IT", priority: "High", raisedBy: "Olu Adeyemi", assignee: "Linh Tran", status: "in_progress", createdAt: "2026-05-08" },
  { id: "TKT-12002", title: "Update bank account for payroll", category: "HR", priority: "Medium", raisedBy: "Mei Lin", assignee: "Rahul Verma", status: "open", createdAt: "2026-05-09" },
  { id: "TKT-12003", title: "Need replacement charger", category: "IT", priority: "Low", raisedBy: "Daniel Park", assignee: "Marco Rossi", status: "closed", createdAt: "2026-05-05" },
  { id: "TKT-12004", title: "Reimbursement delay query", category: "Finance", priority: "Medium", raisedBy: "Fatima Noor", assignee: "Priya Nair", status: "on_hold", createdAt: "2026-05-06" },
];

export const DASHBOARD_STATS = {
  headcount: 248,
  presentToday: 212,
  onLeave: 14,
  openTickets: 9,
  pendingApprovals: 17,
  utilization: 86,
};
