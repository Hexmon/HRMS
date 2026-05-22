import * as React from "react";

export type LeaveType = "casual" | "sick" | "earned" | "unpaid" | "comp_off";
export type ReqKind = "leave" | "wfh";
export type ReqStatus =
  | "draft"
  | "submitted"
  | "pending_manager"
  | "approved"
  | "rejected"
  | "cancelled";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
  comp_off: "Comp Off",
};

export interface LeaveRequest {
  id: string;
  kind: ReqKind;
  employee: string;
  department: string;
  manager: string;
  leaveType?: LeaveType;
  fromDate: string; // yyyy-mm-dd
  toDate: string;
  halfDay: boolean;
  duration: number; // days
  reason: string;
  projectRef?: string;
  status: ReqStatus;
  remarks?: string;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // yyyy-mm-dd
  region: string;
  optional: boolean;
}

const SEED: LeaveRequest[] = [
  {
    id: "LV-2041",
    kind: "leave",
    employee: "Daniel Park",
    department: "Engineering",
    manager: "Ananya Iyer",
    leaveType: "earned",
    fromDate: "2026-05-15",
    toDate: "2026-05-19",
    halfDay: false,
    duration: 5,
    reason: "Family vacation to Goa",
    status: "pending_manager",
    createdAt: "2026-05-08",
  },
  {
    id: "LV-2040",
    kind: "leave",
    employee: "Fatima Noor",
    department: "Design",
    manager: "Vikram Reddy",
    leaveType: "sick",
    fromDate: "2026-05-12",
    toDate: "2026-05-12",
    halfDay: false,
    duration: 1,
    reason: "Flu — doctor visit",
    status: "pending_manager",
    createdAt: "2026-05-08",
  },
  {
    id: "LV-2039",
    kind: "leave",
    employee: "You",
    department: "Product",
    manager: "Ananya Iyer",
    leaveType: "casual",
    fromDate: "2026-05-22",
    toDate: "2026-05-22",
    halfDay: true,
    duration: 0.5,
    reason: "Personal errand",
    status: "approved",
    createdAt: "2026-05-04",
  },
  {
    id: "LV-2038",
    kind: "leave",
    employee: "You",
    department: "Product",
    manager: "Ananya Iyer",
    leaveType: "earned",
    fromDate: "2026-04-12",
    toDate: "2026-04-14",
    halfDay: false,
    duration: 3,
    reason: "Cousin's wedding",
    status: "approved",
    createdAt: "2026-04-01",
  },
  {
    id: "WFH-118",
    kind: "wfh",
    employee: "Aryan Mehta",
    department: "Engineering",
    manager: "Ananya Iyer",
    fromDate: "2026-05-14",
    toDate: "2026-05-14",
    halfDay: false,
    duration: 1,
    reason: "Plumber visit",
    projectRef: "Atlas Payments",
    status: "pending_manager",
    createdAt: "2026-05-07",
  },
  {
    id: "WFH-117",
    kind: "wfh",
    employee: "You",
    department: "Product",
    manager: "Ananya Iyer",
    fromDate: "2026-05-13",
    toDate: "2026-05-13",
    halfDay: false,
    duration: 1,
    reason: "Heads-down deep work",
    projectRef: "Discovery Q2",
    status: "approved",
    createdAt: "2026-05-05",
  },
  {
    id: "LV-2031",
    kind: "leave",
    employee: "Jacob Owens",
    department: "Sales",
    manager: "Vikram Reddy",
    leaveType: "casual",
    fromDate: "2026-04-29",
    toDate: "2026-04-29",
    halfDay: false,
    duration: 1,
    reason: "Family event",
    status: "rejected",
    remarks: "Quarter close week — please reschedule.",
    createdAt: "2026-04-22",
  },
];

export const HOLIDAYS: Holiday[] = [
  { id: "H1", name: "Buddha Purnima", date: "2026-05-11", region: "IN", optional: false },
  { id: "H2", name: "Memorial Day", date: "2026-05-26", region: "US", optional: false },
  { id: "H3", name: "Eid ul-Adha", date: "2026-06-06", region: "AE / IN", optional: false },
  { id: "H4", name: "Independence Day", date: "2026-07-04", region: "US", optional: false },
  { id: "H5", name: "Raksha Bandhan", date: "2026-08-19", region: "IN", optional: true },
  { id: "H6", name: "Independence Day (IN)", date: "2026-08-15", region: "IN", optional: false },
];

export const LEAVE_BALANCES = [
  { type: "casual" as LeaveType, used: 2, total: 8 },
  { type: "sick" as LeaveType, used: 1, total: 8 },
  { type: "earned" as LeaveType, used: 5, total: 18 },
  { type: "comp_off" as LeaveType, used: 0, total: 2 },
];

interface Ctx {
  requests: LeaveRequest[];
  add: (r: Omit<LeaveRequest, "id" | "createdAt" | "status">) => LeaveRequest;
  setStatus: (id: string, status: ReqStatus, remarks?: string) => void;
  cancel: (id: string) => void;
}

const C = React.createContext<Ctx | null>(null);

export function LeaveProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = React.useState<LeaveRequest[]>(SEED);

  const add: Ctx["add"] = (r) => {
    const prefix = r.kind === "wfh" ? "WFH" : "LV";
    const id = `${prefix}-${1000 + Math.floor(Math.random() * 9000)}`;
    const created: LeaveRequest = {
      ...r,
      id,
      createdAt: new Date().toISOString().slice(0, 10),
      status: "pending_manager",
    };
    setRequests((rs) => [created, ...rs]);
    return created;
  };
  const setStatus: Ctx["setStatus"] = (id, status, remarks) => {
    setRequests((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status, remarks: remarks ?? r.remarks } : r)),
    );
  };
  const cancel: Ctx["cancel"] = (id) => setStatus(id, "cancelled");

  return <C.Provider value={{ requests, add, setStatus, cancel }}>{children}</C.Provider>;
}

export function useLeave() {
  const ctx = React.useContext(C);
  if (!ctx) throw new Error("useLeave must be used within LeaveProvider");
  return ctx;
}
