export type TimesheetEntryStatus =
  | "draft"
  | "submitted"
  | "pending"
  | "approved"
  | "rejected"
  | "returned";

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  weekStart: string;       // ISO date for Monday of that week
  date: string;            // ISO date of the entry
  projectId: string;
  projectCode: string;
  projectName: string;
  task: string;
  billable: boolean;
  hours: number;
  description: string;
}

export interface TimesheetWeek {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  weekStart: string;
  status: TimesheetEntryStatus;
  submittedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  remarks?: string;
}

export const TIMESHEET_STATUS_LABEL: Record<TimesheetEntryStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned",
};

// ---- helpers ----
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - diff);
  return out;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const TODAY = new Date("2026-05-11"); // app demo date — Monday
const THIS_WEEK = isoDate(startOfWeek(TODAY));
const LAST_WEEK = isoDate(addDays(startOfWeek(TODAY), -7));

const mkEntry = (
  i: number,
  employeeId: string,
  employeeName: string,
  weekStart: string,
  dayOffset: number,
  projectId: string,
  projectCode: string,
  projectName: string,
  task: string,
  hours: number,
  billable: boolean,
  description: string,
): TimesheetEntry => ({
  id: `te_${weekStart}_${employeeId}_${i}`,
  employeeId,
  employeeName,
  weekStart,
  date: isoDate(addDays(new Date(weekStart), dayOffset)),
  projectId,
  projectCode,
  projectName,
  task,
  billable,
  hours,
  description,
});

export const TIMESHEET_ENTRIES: TimesheetEntry[] = [
  // Daniel Park — last week, approved (8h x 5 = 40h)
  mkEntry(1, "EMP-1042", "Daniel Park", LAST_WEEK, 0, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Card processing core", 8, true, "API integration"),
  mkEntry(2, "EMP-1042", "Daniel Park", LAST_WEEK, 1, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Card processing core", 7.5, true, "Pairing with Fatima"),
  mkEntry(3, "EMP-1042", "Daniel Park", LAST_WEEK, 2, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Compliance & audit", 8, true, "Audit log refactor"),
  mkEntry(4, "EMP-1042", "Daniel Park", LAST_WEEK, 3, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Card processing core", 8, true, "Code review"),
  mkEntry(5, "EMP-1042", "Daniel Park", LAST_WEEK, 4, "PRJ-302", "HEL-ANL", "Helios Analytics Cloud", "Tech reviewer", 4, true, "Architecture review"),
  // Daniel Park — this week, draft
  mkEntry(6, "EMP-1042", "Daniel Park", THIS_WEEK, 0, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Card processing core", 8, true, "PR cleanup"),

  // Fatima Noor — last week, pending
  mkEntry(7, "EMP-1045", "Fatima Noor", LAST_WEEK, 0, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Wallet ledger", 7, true, "Schema design"),
  mkEntry(8, "EMP-1045", "Fatima Noor", LAST_WEEK, 1, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Wallet ledger", 7.5, true, "Migrations"),
  mkEntry(9, "EMP-1045", "Fatima Noor", LAST_WEEK, 2, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Wallet ledger", 8, true, "Unit tests"),
  mkEntry(10, "EMP-1045", "Fatima Noor", LAST_WEEK, 3, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Wallet ledger", 6, true, "Bug fixes"),
  mkEntry(11, "EMP-1045", "Fatima Noor", LAST_WEEK, 4, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Internal training", 4, false, "Onboarding session"),

  // Jacob Owens — last week, approved
  mkEntry(12, "EMP-1044", "Jacob Owens", LAST_WEEK, 0, "PRJ-304", "NIM-DLK", "Nimbus Data Lake", "Foundation & IAM", 6, true, "Terraform module"),
  mkEntry(13, "EMP-1044", "Jacob Owens", LAST_WEEK, 1, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "DevOps support", 4, true, "K8s upgrade"),
  mkEntry(14, "EMP-1044", "Jacob Owens", LAST_WEEK, 2, "PRJ-304", "NIM-DLK", "Nimbus Data Lake", "Foundation & IAM", 6, true, "IAM design"),
  mkEntry(15, "EMP-1044", "Jacob Owens", LAST_WEEK, 3, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "DevOps support", 4, true, "Build pipeline"),

  // Hana Kobayashi — last week, returned
  mkEntry(16, "EMP-1047", "Hana Kobayashi", LAST_WEEK, 0, "PRJ-302", "HEL-ANL", "Helios Analytics Cloud", "Semantic models", 8, true, "Model design"),
  mkEntry(17, "EMP-1047", "Hana Kobayashi", LAST_WEEK, 1, "PRJ-302", "HEL-ANL", "Helios Analytics Cloud", "Semantic models", 8, true, "Documentation"),
  mkEntry(18, "EMP-1047", "Hana Kobayashi", LAST_WEEK, 2, "PRJ-302", "HEL-ANL", "Helios Analytics Cloud", "Embedded dashboards", 6, true, "Wireframes"),

  // Liam — last week, rejected
  mkEntry(19, "EMP-1054", "Liam O'Connor", LAST_WEEK, 0, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Admin console", 8, true, "UI scaffolding"),
  mkEntry(20, "EMP-1054", "Liam O'Connor", LAST_WEEK, 1, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Admin console", 8, true, "Forms work"),

  // Mei Lin — this week, pending
  mkEntry(21, "EMP-1043", "Mei Lin", THIS_WEEK, 0, "PRJ-305", "HAW-OPS", "Hawkaii Internal Ops Portal", "HRMS integrations", 4, false, "Internal design review"),
  mkEntry(22, "EMP-1043", "Mei Lin", THIS_WEEK, 0, "PRJ-301", "ATL-PAY", "Atlas Payments Platform", "Design support", 3, true, "Wallet flows"),

  // Olu Adeyemi — last week, pending
  mkEntry(23, "EMP-1048", "Olu Adeyemi", LAST_WEEK, 0, "PRJ-302", "HEL-ANL", "Helios Analytics Cloud", "Ingestion pipelines", 8, true, "dbt models"),
  mkEntry(24, "EMP-1048", "Olu Adeyemi", LAST_WEEK, 1, "PRJ-302", "HEL-ANL", "Helios Analytics Cloud", "Ingestion pipelines", 8, true, "QA"),
  mkEntry(25, "EMP-1048", "Olu Adeyemi", LAST_WEEK, 2, "PRJ-304", "NIM-DLK", "Nimbus Data Lake", "Tokenization service", 4, true, "Spike"),
];

export const TIMESHEET_WEEKS: TimesheetWeek[] = [
  { id: "tw_1042_lw", employeeId: "EMP-1042", employeeName: "Daniel Park", department: "Engineering", weekStart: LAST_WEEK, status: "approved", submittedAt: addDays(new Date(LAST_WEEK), 5).toISOString(), decidedAt: addDays(new Date(LAST_WEEK), 6).toISOString(), decidedBy: "Sara Iqbal" },
  { id: "tw_1042_tw", employeeId: "EMP-1042", employeeName: "Daniel Park", department: "Engineering", weekStart: THIS_WEEK, status: "draft" },
  { id: "tw_1045_lw", employeeId: "EMP-1045", employeeName: "Fatima Noor", department: "Engineering", weekStart: LAST_WEEK, status: "pending", submittedAt: addDays(new Date(LAST_WEEK), 5).toISOString() },
  { id: "tw_1044_lw", employeeId: "EMP-1044", employeeName: "Jacob Owens", department: "Engineering", weekStart: LAST_WEEK, status: "approved", submittedAt: addDays(new Date(LAST_WEEK), 5).toISOString(), decidedAt: addDays(new Date(LAST_WEEK), 6).toISOString(), decidedBy: "Sara Iqbal" },
  { id: "tw_1047_lw", employeeId: "EMP-1047", employeeName: "Hana Kobayashi", department: "Analytics", weekStart: LAST_WEEK, status: "returned", submittedAt: addDays(new Date(LAST_WEEK), 5).toISOString(), decidedBy: "Aanya Mehta", remarks: "Please add task descriptions for Tuesday." },
  { id: "tw_1054_lw", employeeId: "EMP-1054", employeeName: "Liam O'Connor", department: "Engineering", weekStart: LAST_WEEK, status: "rejected", submittedAt: addDays(new Date(LAST_WEEK), 5).toISOString(), decidedAt: addDays(new Date(LAST_WEEK), 6).toISOString(), decidedBy: "Sara Iqbal", remarks: "Hours don't match deployment evidence." },
  { id: "tw_1043_tw", employeeId: "EMP-1043", employeeName: "Mei Lin", department: "Design", weekStart: THIS_WEEK, status: "pending", submittedAt: TODAY.toISOString() },
  { id: "tw_1048_lw", employeeId: "EMP-1048", employeeName: "Olu Adeyemi", department: "Engineering", weekStart: LAST_WEEK, status: "pending", submittedAt: addDays(new Date(LAST_WEEK), 5).toISOString() },
  // Missing — Sofia Rossi did not submit last week
];

export const DEMO_TODAY_ISO = isoDate(TODAY);
export const DEMO_THIS_WEEK = THIS_WEEK;
export const DEMO_LAST_WEEK = LAST_WEEK;

// LEGACY (kept for old dashboards that may still reference TIMESHEETS)
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
