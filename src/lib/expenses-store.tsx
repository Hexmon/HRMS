import * as React from "react";
import type { Role } from "./mock/roles";

// ---------- Types ----------
export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "pending_reviewer"
  | "reviewer_returned"
  | "reviewer_rejected"
  | "pending_director"
  | "director_returned"
  | "director_rejected"
  | "finance_verification"
  | "finance_hold"
  | "finance_verified"
  | "payment_released"
  | "bills_submitted"
  | "settlement_review"
  | "pending_adjustment"
  | "closed"
  | "withdrawn";

export type ExpenseStage =
  | "draft"
  | "reviewer"
  | "director"
  | "finance"
  | "payment"
  | "settlement"
  | "closed";

export type ExpenseType = "project" | "sales_presales";
export type PaymentType = "advance" | "reimbursement";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface LineItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
  taxAmount: number;
  vendor: string;
}

export interface ExpenseDoc {
  id: string;
  name: string;
  kind: "bill" | "receipt" | "ticket" | "hotel" | "vendor" | "other";
  uploadedAt: string;
}

export interface ApprovalEvent {
  by: string;
  role: string;
  action: string;
  status: "approved" | "pending" | "rejected" | "skipped";
  remark?: string;
  at: string;
}

export interface AuditEvent {
  by: string;
  what: string;
  at: string;
}

export interface CommentItem {
  by: string;
  text: string;
  at: string;
}

export interface Payment {
  paidAmount: number;
  mode: "bank_transfer" | "cash" | "card" | "upi";
  paidOn: string;
  reference: string;
  remarks?: string;
}

export interface Settlement {
  advanceAmount: number;
  actualSpent: number;
  balance: number; // positive = recoverable from employee, negative = payable to employee
  billsSubmitted: boolean;
  remarks?: string;
}

export interface ProjectMeta {
  projectCode: string;
  projectName: string;
  projectManager: string;
  costCenter: string;
  projectExpenseType: "travel" | "material" | "lodging" | "misc";
}
export interface SalesMeta {
  client: string;
  opportunity: string;
  meetingType: string;
  salesOwner: string;
  expectedOutcome: string;
}

export interface ExpenseTicket {
  id: string;
  // requester
  employee: string;
  employeeId: string;
  department: string;
  reviewer: string;
  director: string;
  // basic
  expenseType: ExpenseType;
  subType: string;
  taskTitle: string;
  taskDescription: string;
  startDate: string;
  endDate: string;
  location: string;
  estimatedAmount: number;
  paymentType: PaymentType;
  priority: Priority;
  remarks?: string;
  // conditional
  project?: ProjectMeta;
  sales?: SalesMeta;
  // line items
  lineItems: LineItem[];
  documents: ExpenseDoc[];
  // workflow
  status: ExpenseStatus;
  stage: ExpenseStage;
  approvals: ApprovalEvent[];
  audit: AuditEvent[];
  comments: CommentItem[];
  payment?: Payment;
  settlement?: Settlement;
  submittedAt?: string;
  createdAt: string;
}

export interface ReviewerMapping {
  id: string;
  employee: string;
  reviewer: string;
  department: string;
  effectiveFrom: string;
  active: boolean;
}

// ---------- Helpers ----------
export const HIGH_VALUE_THRESHOLD = 1500;

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_reviewer: "Pending Reviewer",
  reviewer_returned: "Reviewer Returned",
  reviewer_rejected: "Reviewer Rejected",
  pending_director: "Pending Director",
  director_returned: "Director Returned",
  director_rejected: "Director Rejected",
  finance_verification: "Finance Verification",
  finance_hold: "Finance Hold",
  finance_verified: "Finance Verified",
  payment_released: "Payment Released",
  bills_submitted: "Bills Submitted",
  settlement_review: "Settlement Review",
  pending_adjustment: "Pending Adjustment",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

export const STATUS_TONE: Record<ExpenseStatus, "muted" | "info" | "warning" | "success" | "destructive" | "primary"> = {
  draft: "muted",
  submitted: "info",
  pending_reviewer: "warning",
  reviewer_returned: "warning",
  reviewer_rejected: "destructive",
  pending_director: "warning",
  director_returned: "warning",
  director_rejected: "destructive",
  finance_verification: "info",
  finance_hold: "warning",
  finance_verified: "success",
  payment_released: "success",
  bills_submitted: "info",
  settlement_review: "warning",
  pending_adjustment: "warning",
  closed: "muted",
  withdrawn: "muted",
};

export function lineTotal(li: LineItem) {
  return li.quantity * li.unitCost + li.taxAmount;
}
export function ticketTotal(t: ExpenseTicket) {
  return t.lineItems.reduce((s, li) => s + lineTotal(li), 0);
}
export function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

const today = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const ts = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

// ---------- Seed Data ----------
const SEED: ExpenseTicket[] = [
  {
    id: "EXP-9101",
    employee: "Daniel Park", employeeId: "u4", department: "Engineering",
    reviewer: "Sara Iqbal", director: "Aanya Mehta",
    expenseType: "project", subType: "Client visit",
    taskTitle: "Atlas Payments — onsite kickoff (Mumbai)",
    taskDescription: "3-day onsite for kickoff workshops and architecture review.",
    startDate: today(-10), endDate: today(-7),
    location: "Mumbai, IN", estimatedAmount: 42000,
    paymentType: "advance", priority: "high",
    remarks: "Advance required for hotel booking pre-trip.",
    project: { projectCode: "PRJ-ATLS", projectName: "Atlas Payments", projectManager: "Sara Iqbal", costCenter: "CC-ENG-01", projectExpenseType: "travel" },
    lineItems: [
      { id: "li1", category: "Flights", description: "BLR↔BOM round trip", quantity: 1, unitCost: 14800, taxAmount: 1480, vendor: "Indigo" },
      { id: "li2", category: "Hotel", description: "3 nights · Andheri", quantity: 3, unitCost: 7500, taxAmount: 4050, vendor: "Hyatt Place" },
      { id: "li3", category: "Cabs", description: "Local transport", quantity: 1, unitCost: 3200, taxAmount: 0, vendor: "Uber" },
    ],
    documents: [
      { id: "d1", name: "Flight invoice.pdf", kind: "ticket", uploadedAt: ts(-11) },
      { id: "d2", name: "Hotel pre-auth.pdf", kind: "hotel", uploadedAt: ts(-11) },
    ],
    status: "payment_released", stage: "payment",
    approvals: [
      { by: "Daniel Park", role: "Requester", action: "Submitted", status: "approved", at: ts(-11) },
      { by: "Sara Iqbal", role: "Reviewer", action: "Approved", status: "approved", remark: "Looks good — within budget.", at: ts(-10) },
      { by: "Aanya Mehta", role: "Director", action: "Approved", status: "approved", remark: "Approved for advance release.", at: ts(-9) },
      { by: "Priya Nair", role: "Finance", action: "Verified", status: "approved", at: ts(-9) },
      { by: "Priya Nair", role: "Finance", action: "Payment Released", status: "approved", remark: "UTR: NEFT2026050912345", at: ts(-8) },
    ],
    audit: [
      { by: "Daniel Park", what: "Created draft", at: ts(-12) },
      { by: "Daniel Park", what: "Submitted for review", at: ts(-11) },
      { by: "Sara Iqbal", what: "Reviewer approved", at: ts(-10) },
      { by: "Aanya Mehta", what: "Director approved", at: ts(-9) },
      { by: "Priya Nair", what: "Finance verified & released payment", at: ts(-8) },
    ],
    comments: [{ by: "Sara Iqbal", text: "Please share trip report after travel.", at: ts(-10) }],
    payment: { paidAmount: 42000, mode: "bank_transfer", paidOn: today(-8), reference: "NEFT2026050912345", remarks: "Advance" },
    submittedAt: ts(-11), createdAt: ts(-12),
  },
  {
    id: "EXP-9102",
    employee: "Mei Lin", employeeId: "u_mei", department: "Engineering",
    reviewer: "Sara Iqbal", director: "Aanya Mehta",
    expenseType: "project", subType: "Software & tooling",
    taskTitle: "JetBrains All Products Pack renewal",
    taskDescription: "Annual IDE license renewal for backend squad.",
    startDate: today(-3), endDate: today(-3),
    location: "Remote", estimatedAmount: 9800,
    paymentType: "reimbursement", priority: "normal",
    project: { projectCode: "PRJ-INTL", projectName: "Internal Tooling", projectManager: "Sara Iqbal", costCenter: "CC-ENG-02", projectExpenseType: "misc" },
    lineItems: [{ id: "li1", category: "Software", description: "JetBrains license · 1 yr", quantity: 1, unitCost: 9800, taxAmount: 1764, vendor: "JetBrains" }],
    documents: [{ id: "d1", name: "JetBrains invoice.pdf", kind: "vendor", uploadedAt: ts(-3) }],
    status: "pending_reviewer", stage: "reviewer",
    approvals: [
      { by: "Mei Lin", role: "Requester", action: "Submitted", status: "approved", at: ts(-2) },
      { by: "Sara Iqbal", role: "Reviewer", action: "Awaiting", status: "pending", at: ts(-2) },
    ],
    audit: [{ by: "Mei Lin", what: "Submitted ticket", at: ts(-2) }],
    comments: [],
    submittedAt: ts(-2), createdAt: ts(-3),
  },
  {
    id: "EXP-9103",
    employee: "Jacob Owens", employeeId: "u_jacob", department: "Sales",
    reviewer: "Vikram Reddy", director: "Aanya Mehta",
    expenseType: "sales_presales", subType: "Client lunch",
    taskTitle: "Client lunch — Northwind Industries",
    taskDescription: "Discovery + commercial discussion over lunch.",
    startDate: today(-5), endDate: today(-5),
    location: "Bengaluru, IN", estimatedAmount: 6500,
    paymentType: "reimbursement", priority: "normal",
    sales: { client: "Northwind Industries", opportunity: "OPP-2245 · ERP Modernization", meetingType: "Discovery", salesOwner: "Jacob Owens", expectedOutcome: "Schedule technical workshop" },
    lineItems: [{ id: "li1", category: "Meals", description: "Lunch · 4 pax", quantity: 1, unitCost: 5800, taxAmount: 700, vendor: "Toast & Tonic" }],
    documents: [{ id: "d1", name: "Restaurant bill.jpg", kind: "bill", uploadedAt: ts(-5) }],
    status: "pending_director", stage: "director",
    approvals: [
      { by: "Jacob Owens", role: "Requester", action: "Submitted", status: "approved", at: ts(-5) },
      { by: "Vikram Reddy", role: "Reviewer", action: "Approved", status: "approved", remark: "Important account.", at: ts(-4) },
      { by: "Aanya Mehta", role: "Director", action: "Awaiting", status: "pending", at: ts(-4) },
    ],
    audit: [
      { by: "Jacob Owens", what: "Submitted ticket", at: ts(-5) },
      { by: "Vikram Reddy", what: "Reviewer approved", at: ts(-4) },
    ],
    comments: [],
    submittedAt: ts(-5), createdAt: ts(-5),
  },
  {
    id: "EXP-9104",
    employee: "Fatima Noor", employeeId: "u_fatima", department: "Design",
    reviewer: "Sara Iqbal", director: "Aanya Mehta",
    expenseType: "project", subType: "Conference",
    taskTitle: "Config 2026 — Figma conference",
    taskDescription: "Conference attendance with travel + lodging.",
    startDate: today(2), endDate: today(5),
    location: "San Francisco, US", estimatedAmount: 185000,
    paymentType: "advance", priority: "urgent",
    project: { projectCode: "PRJ-DSGN", projectName: "Design Ops", projectManager: "Sara Iqbal", costCenter: "CC-DSGN-01", projectExpenseType: "travel" },
    lineItems: [
      { id: "li1", category: "Flights", description: "BLR↔SFO", quantity: 1, unitCost: 95000, taxAmount: 8000, vendor: "Emirates" },
      { id: "li2", category: "Conference", description: "Config pass", quantity: 1, unitCost: 38000, taxAmount: 0, vendor: "Figma" },
      { id: "li3", category: "Hotel", description: "4 nights · SoMa", quantity: 4, unitCost: 9500, taxAmount: 6000, vendor: "Hyatt" },
    ],
    documents: [{ id: "d1", name: "Conf ticket.pdf", kind: "ticket", uploadedAt: ts(-1) }],
    status: "finance_verification", stage: "finance",
    approvals: [
      { by: "Fatima Noor", role: "Requester", action: "Submitted", status: "approved", at: ts(-2) },
      { by: "Sara Iqbal", role: "Reviewer", action: "Approved", status: "approved", at: ts(-1) },
      { by: "Aanya Mehta", role: "Director", action: "Approved", status: "approved", remark: "High value but strategic.", at: ts(-1) },
      { by: "Priya Nair", role: "Finance", action: "Awaiting verification", status: "pending", at: ts(-1) },
    ],
    audit: [
      { by: "Fatima Noor", what: "Submitted ticket", at: ts(-2) },
      { by: "Sara Iqbal", what: "Reviewer approved", at: ts(-1) },
      { by: "Aanya Mehta", what: "Director approved", at: ts(-1) },
    ],
    comments: [],
    submittedAt: ts(-2), createdAt: ts(-3),
  },
  {
    id: "EXP-9105",
    employee: "You", employeeId: "self", department: "Product",
    reviewer: "Ananya Iyer", director: "Aanya Mehta",
    expenseType: "project", subType: "Internet reimbursement",
    taskTitle: "Home internet — April",
    taskDescription: "Monthly broadband reimbursement.",
    startDate: today(-15), endDate: today(-15),
    location: "Remote", estimatedAmount: 1800,
    paymentType: "reimbursement", priority: "low",
    project: { projectCode: "PRJ-WFH", projectName: "WFH Stipend", projectManager: "Ananya Iyer", costCenter: "CC-OPS-03", projectExpenseType: "misc" },
    lineItems: [{ id: "li1", category: "Internet", description: "April broadband", quantity: 1, unitCost: 1525, taxAmount: 275, vendor: "ACT Fibernet" }],
    documents: [{ id: "d1", name: "ACT invoice.pdf", kind: "bill", uploadedAt: ts(-2) }],
    status: "draft", stage: "draft",
    approvals: [],
    audit: [{ by: "You", what: "Draft saved", at: ts(-2) }],
    comments: [],
    createdAt: ts(-2),
  },
  {
    id: "EXP-9106",
    employee: "You", employeeId: "self", department: "Product",
    reviewer: "Ananya Iyer", director: "Aanya Mehta",
    expenseType: "project", subType: "Cab — late night",
    taskTitle: "Cab — production deploy",
    taskDescription: "Late-night cab post deployment.",
    startDate: today(-20), endDate: today(-20),
    location: "Bengaluru, IN", estimatedAmount: 540,
    paymentType: "reimbursement", priority: "low",
    project: { projectCode: "PRJ-ATLS", projectName: "Atlas Payments", projectManager: "Sara Iqbal", costCenter: "CC-ENG-01", projectExpenseType: "travel" },
    lineItems: [{ id: "li1", category: "Cabs", description: "Office → Home, 02:00", quantity: 1, unitCost: 540, taxAmount: 0, vendor: "Uber" }],
    documents: [{ id: "d1", name: "Uber receipt.pdf", kind: "receipt", uploadedAt: ts(-19) }],
    status: "closed", stage: "closed",
    approvals: [
      { by: "You", role: "Requester", action: "Submitted", status: "approved", at: ts(-19) },
      { by: "Ananya Iyer", role: "Reviewer", action: "Approved", status: "approved", at: ts(-18) },
      { by: "Aanya Mehta", role: "Director", action: "Approved", status: "approved", at: ts(-17) },
      { by: "Priya Nair", role: "Finance", action: "Verified & paid", status: "approved", at: ts(-16) },
      { by: "Priya Nair", role: "Finance", action: "Closed", status: "approved", remark: "Settlement complete.", at: ts(-15) },
    ],
    audit: [
      { by: "You", what: "Submitted ticket", at: ts(-19) },
      { by: "Priya Nair", what: "Closed ticket", at: ts(-15) },
    ],
    comments: [],
    payment: { paidAmount: 540, mode: "bank_transfer", paidOn: today(-16), reference: "NEFT99812", remarks: "Reimbursed" },
    settlement: { advanceAmount: 0, actualSpent: 540, balance: 0, billsSubmitted: true, remarks: "Closed" },
    submittedAt: ts(-19), createdAt: ts(-20),
  },
  {
    id: "EXP-9107",
    employee: "Olu Adeyemi", employeeId: "u_olu", department: "Marketing",
    reviewer: "Vikram Reddy", director: "Aanya Mehta",
    expenseType: "sales_presales", subType: "Event sponsorship",
    taskTitle: "DroidCon booth — material printing",
    taskDescription: "Booth banners + collateral printing for DroidCon.",
    startDate: today(-7), endDate: today(-7),
    location: "Bengaluru, IN", estimatedAmount: 28000,
    paymentType: "reimbursement", priority: "high",
    sales: { client: "Multiple prospects", opportunity: "Lead-gen Q2", meetingType: "Event", salesOwner: "Olu Adeyemi", expectedOutcome: "50+ qualified leads" },
    lineItems: [
      { id: "li1", category: "Print", description: "Booth banners", quantity: 4, unitCost: 4800, taxAmount: 0, vendor: "Print Hub" },
      { id: "li2", category: "Collateral", description: "Brochures · 500", quantity: 1, unitCost: 8800, taxAmount: 0, vendor: "Print Hub" },
    ],
    documents: [],
    status: "settlement_review", stage: "settlement",
    approvals: [
      { by: "Olu Adeyemi", role: "Requester", action: "Submitted", status: "approved", at: ts(-8) },
      { by: "Vikram Reddy", role: "Reviewer", action: "Approved", status: "approved", at: ts(-8) },
      { by: "Aanya Mehta", role: "Director", action: "Approved", status: "approved", at: ts(-7) },
      { by: "Priya Nair", role: "Finance", action: "Verified & paid", status: "approved", at: ts(-6) },
    ],
    audit: [
      { by: "Olu Adeyemi", what: "Submitted ticket", at: ts(-8) },
      { by: "Priya Nair", what: "Awaiting bills for settlement", at: ts(-2) },
    ],
    comments: [{ by: "Priya Nair", text: "Please upload final printer GST bills.", at: ts(-2) }],
    payment: { paidAmount: 30000, mode: "bank_transfer", paidOn: today(-6), reference: "NEFT88112", remarks: "Advance released" },
    settlement: { advanceAmount: 30000, actualSpent: 28000, balance: 2000, billsSubmitted: false, remarks: "Awaiting bills" },
    submittedAt: ts(-8), createdAt: ts(-9),
  },
  {
    id: "EXP-9108",
    employee: "Hana Kobayashi", employeeId: "u_hana", department: "Engineering",
    reviewer: "Sara Iqbal", director: "Aanya Mehta",
    expenseType: "project", subType: "Material",
    taskTitle: "USB-C dock for client demo",
    taskDescription: "Hardware required for client environment demo.",
    startDate: today(-1), endDate: today(-1),
    location: "Remote", estimatedAmount: 5400,
    paymentType: "reimbursement", priority: "normal",
    project: { projectCode: "PRJ-ATLS", projectName: "Atlas Payments", projectManager: "Sara Iqbal", costCenter: "CC-ENG-01", projectExpenseType: "material" },
    lineItems: [{ id: "li1", category: "Hardware", description: "USB-C dock", quantity: 1, unitCost: 4576, taxAmount: 824, vendor: "Amazon" }],
    documents: [{ id: "d1", name: "Amazon invoice.pdf", kind: "vendor", uploadedAt: ts(-1) }],
    status: "reviewer_returned", stage: "reviewer",
    approvals: [
      { by: "Hana Kobayashi", role: "Requester", action: "Submitted", status: "approved", at: ts(-1) },
      { by: "Sara Iqbal", role: "Reviewer", action: "Returned", status: "rejected", remark: "Please tag the correct cost center.", at: ts(0) },
    ],
    audit: [
      { by: "Hana Kobayashi", what: "Submitted ticket", at: ts(-1) },
      { by: "Sara Iqbal", what: "Returned for changes", at: ts(0) },
    ],
    comments: [{ by: "Sara Iqbal", text: "Cost center should be CC-ENG-04.", at: ts(0) }],
    submittedAt: ts(-1), createdAt: ts(-1),
  },
];

const SEED_MAPPINGS: ReviewerMapping[] = [
  { id: "rm1", employee: "Daniel Park", reviewer: "Sara Iqbal", department: "Engineering", effectiveFrom: "2026-01-01", active: true },
  { id: "rm2", employee: "Mei Lin", reviewer: "Sara Iqbal", department: "Engineering", effectiveFrom: "2026-01-01", active: true },
  { id: "rm3", employee: "Jacob Owens", reviewer: "Vikram Reddy", department: "Sales", effectiveFrom: "2026-01-01", active: true },
  { id: "rm4", employee: "Fatima Noor", reviewer: "Sara Iqbal", department: "Design", effectiveFrom: "2026-01-01", active: true },
  { id: "rm5", employee: "Olu Adeyemi", reviewer: "Vikram Reddy", department: "Marketing", effectiveFrom: "2026-01-01", active: true },
];

// ---------- Provider ----------
interface Ctx {
  tickets: ExpenseTicket[];
  mappings: ReviewerMapping[];
  byId: (id: string) => ExpenseTicket | undefined;
  add: (t: Omit<ExpenseTicket, "id" | "createdAt" | "audit" | "approvals" | "comments" | "stage">) => ExpenseTicket;
  patch: (id: string, p: Partial<ExpenseTicket>) => void;
  withdraw: (id: string, by: string) => void;
  reviewerAction: (id: string, action: "approve" | "return" | "reject", by: string, remark?: string) => void;
  directorAction: (id: string, action: "approve" | "return" | "reject", by: string, remark?: string) => void;
  financeAction: (
    id: string,
    action: "verify" | "hold" | "release_payment" | "mark_bills" | "review_settlement" | "close",
    by: string,
    payload?: { remark?: string; payment?: Payment; settlement?: Partial<Settlement> },
  ) => void;
  addComment: (id: string, by: string, text: string) => void;
  setMappingActive: (id: string, active: boolean) => void;
  addMapping: (m: Omit<ReviewerMapping, "id">) => void;
}

const C = React.createContext<Ctx | null>(null);

const STORE_KEY = "hawkaii_expenses";
const MAP_KEY = "hawkaii_expense_mappings";

const ls = {
  get<T>(k: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const r = window.localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};

export function ExpensesProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = React.useState<ExpenseTicket[]>(SEED);
  const [mappings, setMappings] = React.useState<ReviewerMapping[]>(SEED_MAPPINGS);

  React.useEffect(() => {
    const t = ls.get<ExpenseTicket[] | null>(STORE_KEY, null);
    if (t && t.length) setTickets(t);
    const m = ls.get<ReviewerMapping[] | null>(MAP_KEY, null);
    if (m && m.length) setMappings(m);
  }, []);

  const persist = (next: ExpenseTicket[]) => {
    setTickets(next);
    ls.set(STORE_KEY, next);
  };
  const persistMap = (next: ReviewerMapping[]) => {
    setMappings(next);
    ls.set(MAP_KEY, next);
  };

  const byId: Ctx["byId"] = (id) => tickets.find((t) => t.id === id);

  const add: Ctx["add"] = (t) => {
    const id = `EXP-${9200 + Math.floor(Math.random() * 800)}`;
    const created: ExpenseTicket = {
      ...t,
      id,
      createdAt: new Date().toISOString(),
      stage: t.status === "draft" ? "draft" : "reviewer",
      approvals:
        t.status === "draft"
          ? []
          : [
              { by: t.employee, role: "Requester", action: "Submitted", status: "approved", at: new Date().toISOString() },
              { by: t.reviewer, role: "Reviewer", action: "Awaiting", status: "pending", at: new Date().toISOString() },
            ],
      audit: [{ by: t.employee, what: t.status === "draft" ? "Saved as draft" : "Submitted ticket", at: new Date().toISOString() }],
      comments: [],
    };
    persist([created, ...tickets]);
    return created;
  };

  const patch: Ctx["patch"] = (id, p) => persist(tickets.map((t) => (t.id === id ? { ...t, ...p } : t)));

  const pushAudit = (t: ExpenseTicket, by: string, what: string): ExpenseTicket => ({
    ...t,
    audit: [...t.audit, { by, what, at: new Date().toISOString() }],
  });

  const withdraw: Ctx["withdraw"] = (id, by) => {
    persist(
      tickets.map((t) => {
        if (t.id !== id) return t;
        if (t.status === "closed") return t;
        return pushAudit({ ...t, status: "withdrawn", stage: "closed" }, by, "Withdrew ticket");
      }),
    );
  };

  const reviewerAction: Ctx["reviewerAction"] = (id, action, by, remark) => {
    persist(
      tickets.map((t) => {
        if (t.id !== id) return t;
        if (by === t.employee) return t; // no self-approval
        const ev: ApprovalEvent = {
          by, role: "Reviewer",
          action: action === "approve" ? "Approved" : action === "return" ? "Returned" : "Rejected",
          status: action === "approve" ? "approved" : "rejected",
          remark, at: new Date().toISOString(),
        };
        let next: ExpenseTicket;
        if (action === "approve") {
          next = {
            ...t, status: "pending_director", stage: "director",
            approvals: [...t.approvals.filter((a) => a.status !== "pending"), ev,
              { by: t.director, role: "Director", action: "Awaiting", status: "pending", at: new Date().toISOString() }],
          };
        } else if (action === "return") {
          next = { ...t, status: "reviewer_returned", stage: "reviewer", approvals: [...t.approvals.filter((a) => a.status !== "pending"), ev] };
        } else {
          next = { ...t, status: "reviewer_rejected", stage: "closed", approvals: [...t.approvals.filter((a) => a.status !== "pending"), ev] };
        }
        return pushAudit(next, by, `Reviewer ${action}`);
      }),
    );
  };

  const directorAction: Ctx["directorAction"] = (id, action, by, remark) => {
    persist(
      tickets.map((t) => {
        if (t.id !== id) return t;
        if (by === t.employee || by === t.reviewer) return t;
        const ev: ApprovalEvent = {
          by, role: "Director",
          action: action === "approve" ? "Approved" : action === "return" ? "Returned" : "Rejected",
          status: action === "approve" ? "approved" : "rejected",
          remark, at: new Date().toISOString(),
        };
        let next: ExpenseTicket;
        if (action === "approve") {
          next = {
            ...t, status: "finance_verification", stage: "finance",
            approvals: [...t.approvals.filter((a) => a.status !== "pending"), ev,
              { by: "Finance", role: "Finance", action: "Awaiting verification", status: "pending", at: new Date().toISOString() }],
          };
        } else if (action === "return") {
          next = { ...t, status: "director_returned", stage: "reviewer", approvals: [...t.approvals.filter((a) => a.status !== "pending"), ev] };
        } else {
          next = { ...t, status: "director_rejected", stage: "closed", approvals: [...t.approvals.filter((a) => a.status !== "pending"), ev] };
        }
        return pushAudit(next, by, `Director ${action}`);
      }),
    );
  };

  const financeAction: Ctx["financeAction"] = (id, action, by, payload = {}) => {
    persist(
      tickets.map((t) => {
        if (t.id !== id) return t;
        if (by === t.employee || by === t.reviewer || by === t.director) return t;
        const now = new Date().toISOString();
        const remark = payload.remark;
        const baseEv = (a: string, st: ApprovalEvent["status"] = "approved"): ApprovalEvent => ({
          by, role: "Finance", action: a, status: st, remark, at: now,
        });
        switch (action) {
          case "verify":
            return pushAudit(
              { ...t, status: "finance_verified", stage: "finance", approvals: [...t.approvals.filter((a) => a.status !== "pending"), baseEv("Verified")] },
              by, "Finance verified",
            );
          case "hold":
            return pushAudit(
              { ...t, status: "finance_hold", stage: "finance", approvals: [...t.approvals, baseEv("On Hold", "rejected")] },
              by, "Put on hold",
            );
          case "release_payment":
            if (!payload.payment) return t;
            return pushAudit(
              { ...t, status: "payment_released", stage: "payment", payment: payload.payment, approvals: [...t.approvals, baseEv("Payment Released")] },
              by, `Released payment · ${payload.payment.reference}`,
            );
          case "mark_bills":
            return pushAudit(
              { ...t, status: "bills_submitted", stage: "settlement",
                settlement: { ...(t.settlement ?? { advanceAmount: 0, actualSpent: ticketTotal(t), balance: 0, billsSubmitted: true }), billsSubmitted: true },
                approvals: [...t.approvals, baseEv("Bills Received")] },
              by, "Marked bills received",
            );
          case "review_settlement":
            return pushAudit(
              { ...t, status: "settlement_review", stage: "settlement", settlement: { ...(t.settlement ?? { advanceAmount: 0, actualSpent: 0, balance: 0, billsSubmitted: false }), ...(payload.settlement ?? {}) } as Settlement },
              by, "Reviewing settlement",
            );
          case "close": {
            const settled = t.settlement ?? { advanceAmount: 0, actualSpent: ticketTotal(t), balance: 0, billsSubmitted: false };
            if (t.paymentType === "advance" && !settled.billsSubmitted) return t; // gate
            return pushAudit(
              { ...t, status: "closed", stage: "closed", approvals: [...t.approvals, baseEv("Closed")] },
              by, "Closed ticket",
            );
          }
        }
      }),
    );
  };

  const addComment: Ctx["addComment"] = (id, by, text) => {
    persist(
      tickets.map((t) =>
        t.id === id ? { ...t, comments: [...t.comments, { by, text, at: new Date().toISOString() }] } : t,
      ),
    );
  };

  const setMappingActive: Ctx["setMappingActive"] = (id, active) =>
    persistMap(mappings.map((m) => (m.id === id ? { ...m, active } : m)));

  const addMapping: Ctx["addMapping"] = (m) =>
    persistMap([{ ...m, id: `rm_${Date.now()}` }, ...mappings]);

  return (
    <C.Provider value={{ tickets, mappings, byId, add, patch, withdraw, reviewerAction, directorAction, financeAction, addComment, setMappingActive, addMapping }}>
      {children}
    </C.Provider>
  );
}

export function useExpenses() {
  const ctx = React.useContext(C);
  if (!ctx) throw new Error("useExpenses must be used within ExpensesProvider");
  return ctx;
}

// ---------- Role helpers ----------
export const REVIEWER_ROLES: Role[] = ["manager", "project_manager", "hr_admin", "main_admin"];
export const DIRECTOR_ROLES: Role[] = ["main_admin", "hr_admin"];
export const FINANCE_ROLES: Role[] = ["finance_manager", "main_admin"];
export const ADMIN_ROLES: Role[] = ["main_admin", "hr_admin", "finance_manager"];
