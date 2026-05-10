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
