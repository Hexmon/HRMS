// Helpdesk types, SLA matrix, and seed data.

export type TicketCategory = "IT" | "HR" | "Finance" | "Admin" | "Assets" | "Project Support";
export type TicketPriority = "Low" | "Medium" | "High" | "Urgent";
export type TicketStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "on_hold"
  | "resolved"
  | "closed"
  | "reopened"
  | "escalated";

export interface TicketComment {
  id: string;
  at: string;
  author: string;
  authorRole?: string;
  body: string;
  internal?: boolean;
}

export interface TicketAttachment {
  id: string;
  documentId?: string;
  name: string;
  size: string;
  by: string;
  at: string;
}

export interface TicketEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface SubCategory {
  key: string;
  label: string;
}

export interface CategoryConfig {
  key: TicketCategory;
  apiId?: string;
  version?: number;
  label: string;
  defaultAssignee: string;
  defaultAssigneeRole: string;
  team: string;
  active: boolean;
  subCategories: SubCategory[];
}

export interface SlaPolicy {
  priority: TicketPriority;
  responseHours: number;
  resolutionHours: number;
}

export const SLA_MATRIX: Record<TicketPriority, SlaPolicy> = {
  Urgent: { priority: "Urgent", responseHours: 1, resolutionHours: 8 },
  High: { priority: "High", responseHours: 4, resolutionHours: 24 },
  Medium: { priority: "Medium", responseHours: 24, resolutionHours: 72 },
  Low: { priority: "Low", responseHours: 48, resolutionHours: 120 },
};

export const CATEGORIES: CategoryConfig[] = [
  {
    key: "IT",
    label: "IT Support",
    defaultAssignee: "Linh Tran",
    defaultAssigneeRole: "Helpdesk Specialist",
    team: "IT Operations",
    active: true,
    subCategories: [
      { key: "vpn", label: "VPN / Network" },
      { key: "email", label: "Email / Calendar" },
      { key: "software", label: "Software install" },
      { key: "hardware", label: "Hardware issue" },
      { key: "access", label: "Access / Permissions" },
    ],
  },
  {
    key: "HR",
    label: "HR",
    defaultAssignee: "Rahul Verma",
    defaultAssigneeRole: "HR Director",
    team: "People Ops",
    active: true,
    subCategories: [
      { key: "leave", label: "Leave query" },
      { key: "policy", label: "Policy clarification" },
      { key: "letter", label: "Letter request" },
      { key: "payroll", label: "Payroll query" },
    ],
  },
  {
    key: "Finance",
    label: "Finance",
    defaultAssignee: "Priya Nair",
    defaultAssigneeRole: "Finance Manager",
    team: "Finance",
    active: true,
    subCategories: [
      { key: "reimburse", label: "Reimbursement" },
      { key: "invoice", label: "Invoice / GST" },
      { key: "advance", label: "Advance request" },
    ],
  },
  {
    key: "Admin",
    label: "Admin / Facilities",
    defaultAssignee: "Marco Rossi",
    defaultAssigneeRole: "IT Operations Lead",
    team: "Admin",
    active: true,
    subCategories: [
      { key: "seat", label: "Seat / Workspace" },
      { key: "travel", label: "Travel" },
      { key: "stationery", label: "Stationery" },
    ],
  },
  {
    key: "Assets",
    label: "Assets",
    defaultAssignee: "Marco Rossi",
    defaultAssigneeRole: "IT Operations Lead",
    team: "IT Operations",
    active: true,
    subCategories: [
      { key: "request", label: "New asset" },
      { key: "repair", label: "Repair" },
      { key: "return", label: "Return" },
    ],
  },
  {
    key: "Project Support",
    label: "Project Support",
    defaultAssignee: "Sara Iqbal",
    defaultAssigneeRole: "Engineering Manager",
    team: "Engineering",
    active: true,
    subCategories: [
      { key: "tooling", label: "Tooling / CI" },
      { key: "infra", label: "Infrastructure" },
      { key: "client", label: "Client coordination" },
    ],
  },
];

export interface Ticket {
  id: string;
  apiId?: string;
  version?: number;
  subject: string;
  description: string;
  category: TicketCategory;
  categoryApiId?: string;
  subCategory: string;
  priority: TicketPriority;
  status: TicketStatus;
  raisedBy: string;
  raisedById?: string;
  raisedByEmail?: string;
  raisedByDept?: string;
  assignee?: string;
  assigneeUserId?: string;
  assigneeRole?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  firstResponseAt?: string;
  relatedAssetId?: string;
  relatedProjectId?: string;
  resolution?: string;
  reopenCount: number;
  escalated: boolean;
  comments: TicketComment[];
  attachments: TicketAttachment[];
  events: TicketEvent[];
}

const isoMinusHours = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const baseEvents = (createdBy: string, at: string): TicketEvent[] => [
  { id: "e0", at, actor: createdBy, action: "Ticket created" },
];

export const TICKETS: Ticket[] = [
  {
    id: "TKT-12001",
    subject: "VPN not connecting from Lagos office",
    description:
      "Whenever I try to connect to the corporate VPN from the Lagos office, the client times out after 30s. Tried both Wi-Fi and tethering.",
    category: "IT",
    subCategory: "vpn",
    priority: "High",
    status: "in_progress",
    raisedBy: "Daniel Park",
    raisedByEmail: "daniel@hawkaii.com",
    raisedByDept: "Engineering",
    assignee: "Linh Tran",
    assigneeRole: "Helpdesk Specialist",
    createdAt: isoMinusHours(6),
    updatedAt: isoMinusHours(2),
    firstResponseAt: isoMinusHours(5),
    reopenCount: 0,
    escalated: false,
    comments: [
      {
        id: "c1",
        at: isoMinusHours(5),
        author: "Linh Tran",
        authorRole: "Helpdesk Specialist",
        body: "Looking into the VPN gateway logs now. Could you share a screen recording of the failure?",
      },
      {
        id: "c2",
        at: isoMinusHours(2),
        author: "Daniel Park",
        authorRole: "Employee",
        body: "Sent a screen recording over email. Same issue from a second laptop.",
      },
    ],
    attachments: [
      { id: "f1", name: "vpn-logs.txt", size: "12 KB", by: "Linh Tran", at: isoMinusHours(4) },
    ],
    events: [
      ...baseEvents("Daniel Park", isoMinusHours(6)),
      { id: "e1", at: isoMinusHours(6), actor: "System", action: "Auto-assigned to Linh Tran" },
      { id: "e2", at: isoMinusHours(5), actor: "Linh Tran", action: "First response sent" },
      {
        id: "e3",
        at: isoMinusHours(4),
        actor: "Linh Tran",
        action: "Status changed to In progress",
      },
    ],
  },
  {
    id: "TKT-12002",
    subject: "Update bank account for payroll",
    description:
      "I changed banks last month — please update payroll details. Letter from new bank attached.",
    category: "HR",
    subCategory: "payroll",
    priority: "Medium",
    status: "new",
    raisedBy: "Mei Lin",
    raisedByEmail: "mei@hawkaii.com",
    raisedByDept: "Design",
    assignee: "Rahul Verma",
    assigneeRole: "HR Director",
    createdAt: isoMinusHours(20),
    updatedAt: isoMinusHours(20),
    reopenCount: 0,
    escalated: false,
    comments: [],
    attachments: [
      { id: "f2", name: "bank-letter.pdf", size: "240 KB", by: "Mei Lin", at: isoMinusHours(20) },
    ],
    events: baseEvents("Mei Lin", isoMinusHours(20)),
  },
  {
    id: "TKT-12003",
    subject: "Need replacement charger",
    description: "MacBook charger stopped working. Need a 96W USB-C replacement.",
    category: "Assets",
    subCategory: "repair",
    priority: "Low",
    status: "closed",
    raisedBy: "Daniel Park",
    raisedByEmail: "daniel@hawkaii.com",
    raisedByDept: "Engineering",
    assignee: "Marco Rossi",
    assigneeRole: "IT Operations Lead",
    createdAt: isoMinusHours(96),
    updatedAt: isoMinusHours(70),
    firstResponseAt: isoMinusHours(90),
    resolvedAt: isoMinusHours(72),
    closedAt: isoMinusHours(70),
    relatedAssetId: "AST-7710",
    reopenCount: 0,
    escalated: false,
    resolution: "Issued replacement charger from inventory.",
    comments: [
      {
        id: "c3",
        at: isoMinusHours(90),
        author: "Marco Rossi",
        authorRole: "IT Operations Lead",
        body: "Charger ready at the IT desk. Please collect today.",
      },
      {
        id: "c4",
        at: isoMinusHours(72),
        author: "Daniel Park",
        authorRole: "Employee",
        body: "Picked up — thanks!",
      },
    ],
    attachments: [],
    events: [
      ...baseEvents("Daniel Park", isoMinusHours(96)),
      { id: "e4", at: isoMinusHours(95), actor: "System", action: "Auto-assigned to Marco Rossi" },
      {
        id: "e5",
        at: isoMinusHours(72),
        actor: "Marco Rossi",
        action: "Resolved",
        detail: "Issued replacement charger",
      },
      { id: "e6", at: isoMinusHours(70), actor: "Daniel Park", action: "Closed by requester" },
    ],
  },
  {
    id: "TKT-12004",
    subject: "Reimbursement delay query",
    description: "April travel reimbursement still showing pending in payslip.",
    category: "Finance",
    subCategory: "reimburse",
    priority: "Medium",
    status: "on_hold",
    raisedBy: "Fatima Noor",
    raisedByEmail: "fatima@hawkaii.com",
    raisedByDept: "Sales",
    assignee: "Priya Nair",
    assigneeRole: "Finance Manager",
    createdAt: isoMinusHours(50),
    updatedAt: isoMinusHours(30),
    firstResponseAt: isoMinusHours(45),
    reopenCount: 0,
    escalated: false,
    comments: [
      {
        id: "c5",
        at: isoMinusHours(45),
        author: "Priya Nair",
        authorRole: "Finance Manager",
        body: "On hold pending bank confirmation — will revert by EOD tomorrow.",
      },
    ],
    attachments: [],
    events: [
      ...baseEvents("Fatima Noor", isoMinusHours(50)),
      { id: "e7", at: isoMinusHours(45), actor: "Priya Nair", action: "Status changed to On hold" },
    ],
  },
  {
    id: "TKT-12005",
    subject: "Slack workspace access for new joiner",
    description: "New hire Aaron started today — needs Slack and Notion access.",
    category: "IT",
    subCategory: "access",
    priority: "Urgent",
    status: "new",
    raisedBy: "Sara Iqbal",
    raisedByEmail: "sara@hawkaii.com",
    raisedByDept: "Engineering",
    createdAt: isoMinusHours(2),
    updatedAt: isoMinusHours(2),
    reopenCount: 0,
    escalated: false,
    comments: [],
    attachments: [],
    events: baseEvents("Sara Iqbal", isoMinusHours(2)),
  },
  {
    id: "TKT-12006",
    subject: "Letter for visa application",
    description: "Need an employment verification letter on company letterhead for UK visa.",
    category: "HR",
    subCategory: "letter",
    priority: "High",
    status: "assigned",
    raisedBy: "Daniel Park",
    raisedByEmail: "daniel@hawkaii.com",
    raisedByDept: "Engineering",
    assignee: "Rahul Verma",
    assigneeRole: "HR Director",
    createdAt: isoMinusHours(30),
    updatedAt: isoMinusHours(28),
    firstResponseAt: isoMinusHours(28),
    reopenCount: 0,
    escalated: true,
    comments: [
      {
        id: "c6",
        at: isoMinusHours(28),
        author: "Rahul Verma",
        authorRole: "HR Director",
        body: "Drafting now — should be ready by tomorrow morning.",
      },
    ],
    attachments: [],
    events: [
      ...baseEvents("Daniel Park", isoMinusHours(30)),
      { id: "e8", at: isoMinusHours(28), actor: "Rahul Verma", action: "Acknowledged" },
      {
        id: "e9",
        at: isoMinusHours(20),
        actor: "Sara Iqbal",
        action: "Escalated",
        detail: "Travel date approaching",
      },
    ],
  },
  {
    id: "TKT-12007",
    subject: "Workspace seat allocation",
    description: "Need a permanent seat allocation in the new wing.",
    category: "Admin",
    subCategory: "seat",
    priority: "Low",
    status: "resolved",
    raisedBy: "Mei Lin",
    raisedByEmail: "mei@hawkaii.com",
    raisedByDept: "Design",
    assignee: "Marco Rossi",
    assigneeRole: "IT Operations Lead",
    createdAt: isoMinusHours(72),
    updatedAt: isoMinusHours(10),
    firstResponseAt: isoMinusHours(60),
    resolvedAt: isoMinusHours(10),
    reopenCount: 0,
    escalated: false,
    resolution: "Assigned seat D-14 in the new wing.",
    comments: [],
    attachments: [],
    events: [
      ...baseEvents("Mei Lin", isoMinusHours(72)),
      {
        id: "e10",
        at: isoMinusHours(10),
        actor: "Marco Rossi",
        action: "Resolved",
        detail: "Assigned seat D-14",
      },
    ],
  },
  {
    id: "TKT-12008",
    subject: "Production deploy keeps failing",
    description: "CI keeps timing out during the deploy step on the customer-portal project.",
    category: "Project Support",
    subCategory: "tooling",
    priority: "Urgent",
    status: "escalated",
    raisedBy: "Daniel Park",
    raisedByEmail: "daniel@hawkaii.com",
    raisedByDept: "Engineering",
    assignee: "Sara Iqbal",
    assigneeRole: "Engineering Manager",
    createdAt: isoMinusHours(14),
    updatedAt: isoMinusHours(1),
    firstResponseAt: isoMinusHours(13),
    relatedProjectId: "P-1042",
    reopenCount: 0,
    escalated: true,
    comments: [
      {
        id: "c7",
        at: isoMinusHours(13),
        author: "Sara Iqbal",
        authorRole: "Engineering Manager",
        body: "Looking at the runner logs — looks like an OOM on the build container.",
      },
      {
        id: "c8",
        at: isoMinusHours(1),
        author: "Sara Iqbal",
        authorRole: "Engineering Manager",
        body: "Escalating to platform team — needs a runner capacity bump.",
        internal: true,
      },
    ],
    attachments: [],
    events: [
      ...baseEvents("Daniel Park", isoMinusHours(14)),
      { id: "e11", at: isoMinusHours(13), actor: "Sara Iqbal", action: "First response sent" },
      { id: "e12", at: isoMinusHours(1), actor: "Sara Iqbal", action: "Escalated" },
    ],
  },
];

// ---------- helpers ----------

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export type SlaState = "on_track" | "near_breach" | "breached" | "met";

export interface SlaComputed {
  responseDueAt: string;
  resolutionDueAt: string;
  responseState: SlaState;
  resolutionState: SlaState;
  worst: SlaState;
}

export function computeSla(t: Ticket): SlaComputed {
  const policy = SLA_MATRIX[t.priority];
  const created = new Date(t.createdAt).getTime();
  const responseDueAt = new Date(created + policy.responseHours * 3600 * 1000).toISOString();
  const resolutionDueAt = new Date(created + policy.resolutionHours * 3600 * 1000).toISOString();

  const evalState = (dueIso: string, completedIso?: string, weight = 0.2): SlaState => {
    const due = new Date(dueIso).getTime();
    const ref = completedIso ? new Date(completedIso).getTime() : Date.now();
    if (completedIso) return ref <= due ? "met" : "breached";
    if (ref >= due) return "breached";
    if (due - ref <= weight * (policy.resolutionHours * 3600 * 1000)) return "near_breach";
    return "on_track";
  };

  const responseState = evalState(responseDueAt, t.firstResponseAt, 0.25);
  const resolutionState = evalState(resolutionDueAt, t.resolvedAt ?? t.closedAt, 0.2);
  const order: Record<SlaState, number> = { met: 0, on_track: 1, near_breach: 2, breached: 3 };
  const worst = order[resolutionState] >= order[responseState] ? resolutionState : responseState;
  return { responseDueAt, resolutionDueAt, responseState, resolutionState, worst };
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
