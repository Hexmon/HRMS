export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "cancelled";
export type ProjectHealth = "green" | "amber" | "red";
export type ProjectType = "client" | "internal";
export type BillingType = "fixed" | "hourly" | "retainer" | "internal";
export type Priority = "low" | "medium" | "high" | "critical";
export type ModuleStatus = "planned" | "in_progress" | "completed" | "on_hold";

export interface ProjectMember {
  id: string;
  employeeId: string;
  name: string;
  role: string;
  allocation: number; // percent
  billable: boolean;
  startDate: string;
  endDate?: string;
  reportingLead?: string;
}

export interface ProjectModule {
  id: string;
  name: string;
  lead: string;
  status: ModuleStatus;
  startDate: string;
  endDate: string;
  priority: Priority;
}

export interface ProjectDocument {
  id: string;
  name: string;
  category: "sow" | "brd" | "contract" | "client" | "other";
  size: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ProjectAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  remarks?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  type: ProjectType;
  billingType: BillingType;
  manager: string;
  managerEmail?: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  health: ProjectHealth;
  description: string;
  // planning
  estimatedHours: number;
  actualHours: number;
  estimatedBudget: number;
  actualSpend: number;
  techStack: string[];
  priority: Priority;
  costCenter: string;
  department: string;
  // ops
  members: ProjectMember[];
  modules: ProjectModule[];
  documents: ProjectDocument[];
  audit: ProjectAuditEntry[];
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PROJECT_HEALTH_LABEL: Record<ProjectHealth, string> = {
  green: "On track",
  amber: "At risk",
  red: "Critical",
};

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  fixed: "Fixed price",
  hourly: "Hourly (T&M)",
  retainer: "Retainer",
  internal: "Internal",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  client: "Client",
  internal: "Internal",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  on_hold: "On hold",
};

const audit = (joined: string, actor: string, name: string): ProjectAuditEntry[] => [
  { id: "pa1", at: joined, actor, action: "Project created", remarks: name },
  { id: "pa2", at: joined, actor, action: "Project manager assigned" },
];

const docs = (joined: string, actor: string): ProjectDocument[] => [
  {
    id: "pd1",
    name: "Statement of Work.pdf",
    category: "sow",
    size: "412 KB",
    uploadedAt: joined,
    uploadedBy: actor,
  },
  {
    id: "pd2",
    name: "Business Requirements.docx",
    category: "brd",
    size: "286 KB",
    uploadedAt: joined,
    uploadedBy: actor,
  },
  {
    id: "pd3",
    name: "Master Services Agreement.pdf",
    category: "contract",
    size: "612 KB",
    uploadedAt: joined,
    uploadedBy: actor,
  },
];

export const PROJECTS: Project[] = [
  {
    id: "PRJ-301",
    code: "ATL-PAY",
    name: "Atlas Payments Platform",
    client: "NorthBank",
    type: "client",
    billingType: "fixed",
    manager: "Sara Iqbal",
    managerEmail: "sara@hawkaii.com",
    startDate: "2025-09-01",
    endDate: "2026-08-15",
    status: "active",
    health: "green",
    description:
      "End-to-end payments platform with card, wallet and ACH rails for NorthBank's retail division.",
    estimatedHours: 9600,
    actualHours: 6912,
    estimatedBudget: 1_200_000,
    actualSpend: 864_000,
    techStack: ["TypeScript", "Node.js", "PostgreSQL", "AWS", "React"],
    priority: "high",
    costCenter: "CC-DEL-01",
    department: "Engineering",
    members: [
      {
        id: "m1",
        employeeId: "EMP-1042",
        name: "Daniel Park",
        role: "Tech Lead",
        allocation: 100,
        billable: true,
        startDate: "2025-09-01",
        reportingLead: "Sara Iqbal",
      },
      {
        id: "m2",
        employeeId: "EMP-1044",
        name: "Jacob Owens",
        role: "DevOps",
        allocation: 50,
        billable: true,
        startDate: "2025-09-15",
        reportingLead: "Daniel Park",
      },
      {
        id: "m3",
        employeeId: "EMP-1045",
        name: "Fatima Noor",
        role: "Backend Engineer",
        allocation: 80,
        billable: true,
        startDate: "2025-09-15",
        reportingLead: "Daniel Park",
      },
      {
        id: "m4",
        employeeId: "EMP-1054",
        name: "Liam O'Connor",
        role: "Frontend Engineer",
        allocation: 100,
        billable: true,
        startDate: "2025-10-01",
        reportingLead: "Daniel Park",
      },
      {
        id: "m5",
        employeeId: "EMP-1043",
        name: "Mei Lin",
        role: "Product Designer",
        allocation: 30,
        billable: true,
        startDate: "2025-09-01",
        reportingLead: "Aanya Mehta",
      },
    ],
    modules: [
      {
        id: "mod1",
        name: "Card processing core",
        lead: "Daniel Park",
        status: "in_progress",
        startDate: "2025-09-15",
        endDate: "2026-03-30",
        priority: "high",
      },
      {
        id: "mod2",
        name: "Wallet ledger",
        lead: "Fatima Noor",
        status: "in_progress",
        startDate: "2025-11-01",
        endDate: "2026-04-30",
        priority: "high",
      },
      {
        id: "mod3",
        name: "Admin console",
        lead: "Liam O'Connor",
        status: "planned",
        startDate: "2026-02-01",
        endDate: "2026-06-30",
        priority: "medium",
      },
      {
        id: "mod4",
        name: "Compliance & audit",
        lead: "Daniel Park",
        status: "planned",
        startDate: "2026-05-01",
        endDate: "2026-08-15",
        priority: "critical",
      },
    ],
    documents: docs("2025-09-01", "Sara Iqbal"),
    audit: audit("2025-09-01", "Rahul Verma", "Atlas Payments Platform"),
  },
  {
    id: "PRJ-302",
    code: "HEL-ANL",
    name: "Helios Analytics Cloud",
    client: "Sunline Retail",
    type: "client",
    billingType: "hourly",
    manager: "Sara Iqbal",
    startDate: "2026-01-15",
    endDate: "2026-09-30",
    status: "active",
    health: "amber",
    description:
      "Multi-tenant analytics warehouse with embedded dashboards for Sunline's 1,200 store network.",
    estimatedHours: 5200,
    actualHours: 2132,
    estimatedBudget: 640_000,
    actualSpend: 268_400,
    techStack: ["Python", "Snowflake", "dbt", "React", "AWS"],
    priority: "medium",
    costCenter: "CC-DEL-02",
    department: "Engineering",
    members: [
      {
        id: "m1",
        employeeId: "EMP-1047",
        name: "Hana Kobayashi",
        role: "Lead Analyst",
        allocation: 100,
        billable: true,
        startDate: "2026-01-15",
        reportingLead: "Aanya Mehta",
      },
      {
        id: "m2",
        employeeId: "EMP-1048",
        name: "Olu Adeyemi",
        role: "Platform Engineer",
        allocation: 80,
        billable: true,
        startDate: "2026-02-01",
        reportingLead: "Sara Iqbal",
      },
      {
        id: "m3",
        employeeId: "EMP-1042",
        name: "Daniel Park",
        role: "Tech Reviewer",
        allocation: 20,
        billable: true,
        startDate: "2026-01-15",
        reportingLead: "Sara Iqbal",
      },
    ],
    modules: [
      {
        id: "mod1",
        name: "Ingestion pipelines",
        lead: "Olu Adeyemi",
        status: "in_progress",
        startDate: "2026-02-01",
        endDate: "2026-05-30",
        priority: "high",
      },
      {
        id: "mod2",
        name: "Semantic models",
        lead: "Hana Kobayashi",
        status: "in_progress",
        startDate: "2026-03-01",
        endDate: "2026-07-30",
        priority: "high",
      },
      {
        id: "mod3",
        name: "Embedded dashboards",
        lead: "Hana Kobayashi",
        status: "planned",
        startDate: "2026-06-01",
        endDate: "2026-09-30",
        priority: "medium",
      },
    ],
    documents: docs("2026-01-15", "Sara Iqbal"),
    audit: audit("2026-01-15", "Rahul Verma", "Helios Analytics Cloud"),
  },
  {
    id: "PRJ-303",
    code: "ORI-CRM",
    name: "Orion CRM Migration",
    client: "Vertex Corp",
    type: "client",
    billingType: "fixed",
    manager: "Aanya Mehta",
    startDate: "2025-08-01",
    endDate: "2026-04-10",
    status: "completed",
    health: "green",
    description: "Lift-and-shift migration of Vertex's legacy CRM to a modern, API-first platform.",
    estimatedHours: 3800,
    actualHours: 3960,
    estimatedBudget: 480_000,
    actualSpend: 492_000,
    techStack: ["TypeScript", "NestJS", "PostgreSQL", "GCP"],
    priority: "medium",
    costCenter: "CC-DEL-01",
    department: "Engineering",
    members: [
      {
        id: "m1",
        employeeId: "EMP-1049",
        name: "Sofia Rossi",
        role: "Project Manager",
        allocation: 100,
        billable: true,
        startDate: "2025-08-01",
        endDate: "2026-04-10",
        reportingLead: "Aanya Mehta",
      },
      {
        id: "m2",
        employeeId: "EMP-1050",
        name: "Aarav Gupta",
        role: "Backend Engineer",
        allocation: 100,
        billable: true,
        startDate: "2025-08-15",
        endDate: "2026-04-10",
      },
    ],
    modules: [
      {
        id: "mod1",
        name: "Data migration",
        lead: "Aarav Gupta",
        status: "completed",
        startDate: "2025-08-15",
        endDate: "2025-12-30",
        priority: "high",
      },
      {
        id: "mod2",
        name: "Workflow rebuild",
        lead: "Sofia Rossi",
        status: "completed",
        startDate: "2025-11-01",
        endDate: "2026-03-15",
        priority: "high",
      },
      {
        id: "mod3",
        name: "Cutover & training",
        lead: "Sofia Rossi",
        status: "completed",
        startDate: "2026-03-15",
        endDate: "2026-04-10",
        priority: "medium",
      },
    ],
    documents: docs("2025-08-01", "Aanya Mehta"),
    audit: audit("2025-08-01", "Rahul Verma", "Orion CRM Migration"),
  },
  {
    id: "PRJ-304",
    code: "NIM-DLK",
    name: "Nimbus Data Lake",
    client: "Skyfin",
    type: "client",
    billingType: "retainer",
    manager: "Sara Iqbal",
    startDate: "2026-02-01",
    endDate: "2026-12-01",
    status: "on_hold",
    health: "red",
    description: "Federated data lake with PII tokenization for Skyfin's underwriting analytics.",
    estimatedHours: 7200,
    actualHours: 1296,
    estimatedBudget: 900_000,
    actualSpend: 162_000,
    techStack: ["Python", "Databricks", "Terraform", "AWS"],
    priority: "high",
    costCenter: "CC-DEL-03",
    department: "Engineering",
    members: [
      {
        id: "m1",
        employeeId: "EMP-1044",
        name: "Jacob Owens",
        role: "Cloud Architect",
        allocation: 60,
        billable: true,
        startDate: "2026-02-01",
        reportingLead: "Sara Iqbal",
      },
      {
        id: "m2",
        employeeId: "EMP-1048",
        name: "Olu Adeyemi",
        role: "Data Engineer",
        allocation: 40,
        billable: true,
        startDate: "2026-02-15",
        reportingLead: "Sara Iqbal",
      },
    ],
    modules: [
      {
        id: "mod1",
        name: "Foundation & IAM",
        lead: "Jacob Owens",
        status: "on_hold",
        startDate: "2026-02-15",
        endDate: "2026-05-30",
        priority: "high",
      },
      {
        id: "mod2",
        name: "Tokenization service",
        lead: "Olu Adeyemi",
        status: "planned",
        startDate: "2026-06-01",
        endDate: "2026-09-30",
        priority: "critical",
      },
    ],
    documents: docs("2026-02-01", "Sara Iqbal"),
    audit: [
      ...audit("2026-02-01", "Rahul Verma", "Nimbus Data Lake"),
      {
        id: "pa3",
        at: "2026-04-12T09:00:00Z",
        actor: "Sara Iqbal",
        action: "Status changed to On Hold",
        remarks: "Client legal review pending",
      },
    ],
  },
  {
    id: "PRJ-305",
    code: "HAW-OPS",
    name: "Hawkaii Internal Ops Portal",
    client: "Hawkaii",
    type: "internal",
    billingType: "internal",
    manager: "Aanya Mehta",
    startDate: "2026-03-01",
    endDate: "2026-10-31",
    status: "active",
    health: "green",
    description:
      "Internal operations portal unifying HR, finance and IT workflows for the Hawkaii team.",
    estimatedHours: 2400,
    actualHours: 720,
    estimatedBudget: 0,
    actualSpend: 0,
    techStack: ["TypeScript", "React", "Supabase"],
    priority: "medium",
    costCenter: "CC-INT-01",
    department: "People Ops",
    members: [
      {
        id: "m1",
        employeeId: "EMP-1043",
        name: "Mei Lin",
        role: "Lead Designer",
        allocation: 50,
        billable: false,
        startDate: "2026-03-01",
        reportingLead: "Aanya Mehta",
      },
      {
        id: "m2",
        employeeId: "EMP-1051",
        name: "Emma Schultz",
        role: "Product Owner",
        allocation: 30,
        billable: false,
        startDate: "2026-03-01",
        reportingLead: "Rahul Verma",
      },
    ],
    modules: [
      {
        id: "mod1",
        name: "HRMS integrations",
        lead: "Emma Schultz",
        status: "in_progress",
        startDate: "2026-03-15",
        endDate: "2026-07-30",
        priority: "medium",
      },
      {
        id: "mod2",
        name: "Finance dashboards",
        lead: "Mei Lin",
        status: "planned",
        startDate: "2026-08-01",
        endDate: "2026-10-31",
        priority: "low",
      },
    ],
    documents: [
      {
        id: "pd1",
        name: "Internal Project Brief.pdf",
        category: "brd",
        size: "112 KB",
        uploadedAt: "2026-03-01",
        uploadedBy: "Aanya Mehta",
      },
    ],
    audit: audit("2026-03-01", "Rahul Verma", "Hawkaii Internal Ops Portal"),
  },
  {
    id: "PRJ-306",
    code: "PUL-MOB",
    name: "Pulse Mobile App v3",
    client: "PulseHealth",
    type: "client",
    billingType: "hourly",
    manager: "Sofia Rossi",
    startDate: "2026-05-01",
    endDate: "2026-11-30",
    status: "planned",
    health: "green",
    description:
      "Next-gen patient mobile experience with telehealth scheduling and wearable integrations.",
    estimatedHours: 4400,
    actualHours: 0,
    estimatedBudget: 580_000,
    actualSpend: 0,
    techStack: ["React Native", "TypeScript", "GraphQL"],
    priority: "high",
    costCenter: "CC-DEL-02",
    department: "Engineering",
    members: [
      {
        id: "m1",
        employeeId: "EMP-1054",
        name: "Liam O'Connor",
        role: "Mobile Lead",
        allocation: 60,
        billable: true,
        startDate: "2026-05-15",
        reportingLead: "Sofia Rossi",
      },
    ],
    modules: [
      {
        id: "mod1",
        name: "Discovery & UX",
        lead: "Sofia Rossi",
        status: "planned",
        startDate: "2026-05-15",
        endDate: "2026-07-15",
        priority: "high",
      },
    ],
    documents: docs("2026-05-01", "Sofia Rossi"),
    audit: audit("2026-05-01", "Rahul Verma", "Pulse Mobile App v3"),
  },
];
