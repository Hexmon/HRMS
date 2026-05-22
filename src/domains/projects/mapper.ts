import { asArray, asRecord, dateText, numberValue, text, type ApiRecord } from "@/shared/api";
import type {
  BillingType,
  ModuleStatus,
  Priority,
  Project,
  ProjectDocument,
  ProjectHealth,
  ProjectMember,
  ProjectModule,
  ProjectStatus,
  ProjectType,
} from "@/lib/mock/projects";

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = text(value).trim().toLowerCase().replace(/\s+/g, "_");
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

function money(value: unknown): number {
  return numberValue(value, 0);
}

function sizeText(value: unknown): string {
  const bytes = numberValue(value, 0);
  if (bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function userName(value: unknown, fallback = "Unassigned"): string {
  const row = asRecord(value);
  return text(row.full_name ?? row.name, fallback);
}

function userEmail(value: unknown): string | undefined {
  const row = asRecord(value);
  return text(row.email) || undefined;
}

function mapMember(value: unknown): ProjectMember | null {
  const row = asRecord(value);
  const status = text(row.status, "active");
  if (status === "removed") return null;
  const employee = asRecord(row.employee);
  const lead = asRecord(row.reporting_lead);
  return {
    id: text(row.id, "member-api"),
    apiId: text(row.id) || undefined,
    version: numberValue(row.version, 1),
    employeeId: text(
      employee.employee_code ?? row.employee_code,
      text(row.user_id ?? row.employee_user_id),
    ),
    employeeUserId: text(row.user_id ?? row.employee_user_id) || undefined,
    name: userName(row.employee, text(row.name, "Employee")),
    role: text(row.project_role ?? row.role, "Engineer"),
    allocation: numberValue(row.allocation_percent ?? row.allocation, 0),
    billable: Boolean(row.billable),
    startDate: dateText(row.start_date).slice(0, 10),
    endDate: text(row.end_date) || undefined,
    reportingLead: userName(row.reporting_lead, text(row.reporting_lead_user_id)) || undefined,
    reportingLeadUserId: text(lead.id ?? row.reporting_lead_user_id) || undefined,
    status,
  };
}

function mapModule(value: unknown): ProjectModule {
  const row = asRecord(value);
  return {
    id: text(row.id, "module-api"),
    apiId: text(row.id) || undefined,
    version: numberValue(row.version, 1),
    ownerUserId: text(row.owner_user_id) || undefined,
    name: text(row.name, "Project module"),
    lead: text(row.lead, userName(row.owner, "Unassigned")),
    status: enumValue<ModuleStatus>(
      row.status,
      ["planned", "in_progress", "completed", "on_hold"],
      "planned",
    ),
    startDate: dateText(row.start_date ?? row.due_date).slice(0, 10),
    endDate: dateText(row.due_date ?? row.end_date).slice(0, 10),
    priority: enumValue<Priority>(row.priority, ["low", "medium", "high", "critical"], "medium"),
  };
}

function documentCategory(value: unknown): ProjectDocument["category"] {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "_");
  if (["sow", "brd", "contract", "client", "other"].includes(normalized)) {
    return normalized as ProjectDocument["category"];
  }
  return "other";
}

function mapDocument(value: unknown): ProjectDocument {
  const row = asRecord(value);
  return {
    id: text(row.id, "document-api"),
    name: text(row.name ?? row.file_name, "Project document"),
    category: documentCategory(row.category ?? row.document_type),
    size: text(row.size, sizeText(row.size_bytes)),
    uploadedAt: dateText(row.uploaded_at ?? row.created_at),
    uploadedBy: text(row.uploaded_by, "Backend API"),
  };
}

export function mapApiProject(value: unknown, fallback?: Partial<Project>): Project {
  const row = asRecord(value);
  const manager = asRecord(row.manager);
  const department = asRecord(row.department);
  const summary = asRecord(row.summary);
  const members = asArray(row.members)
    .map(mapMember)
    .filter((member): member is ProjectMember => Boolean(member));

  return {
    id: text(row.id, fallback?.id ?? "project-api"),
    version: numberValue(row.version, fallback?.version ?? 1),
    code: text(row.project_code ?? row.code, fallback?.code ?? "PROJECT"),
    name: text(row.name, fallback?.name ?? "Project"),
    client: text(row.client_name ?? row.client, fallback?.client ?? "—"),
    type: enumValue<ProjectType>(row.project_type ?? row.type, ["client", "internal"], "client"),
    billingType: enumValue<BillingType>(
      row.billing_type ?? row.billingType,
      ["fixed", "hourly", "retainer", "internal"],
      "fixed",
    ),
    manager: userName(row.manager, fallback?.manager ?? "Unassigned"),
    managerEmail: userEmail(row.manager) ?? fallback?.managerEmail,
    managerUserId: text(row.manager_user_id ?? manager.id, fallback?.managerUserId),
    department: text(department.name, fallback?.department ?? "—"),
    departmentId: text(department.id ?? row.department_id, fallback?.departmentId),
    startDate: dateText(row.start_date, fallback?.startDate ?? new Date().toISOString()).slice(
      0,
      10,
    ),
    endDate: dateText(row.end_date, fallback?.endDate ?? new Date().toISOString()).slice(0, 10),
    status: enumValue<ProjectStatus>(
      row.status,
      ["planned", "active", "on_hold", "completed", "cancelled"],
      fallback?.status ?? "planned",
    ),
    health: enumValue<ProjectHealth>(
      row.health,
      ["green", "amber", "red"],
      fallback?.health ?? "green",
    ),
    description: text(row.description, fallback?.description ?? ""),
    estimatedHours: money(row.estimated_hours ?? fallback?.estimatedHours),
    actualHours: money(row.actual_hours ?? summary.actual_hours ?? fallback?.actualHours),
    estimatedBudget: money(row.estimated_budget ?? fallback?.estimatedBudget),
    actualSpend: money(row.actual_spend ?? fallback?.actualSpend),
    techStack: Array.isArray(row.tech_stack)
      ? row.tech_stack.map((item) => text(item)).filter(Boolean)
      : (fallback?.techStack ?? []),
    priority: enumValue<Priority>(row.priority, ["low", "medium", "high", "critical"], "medium"),
    costCenter: text(row.cost_center, fallback?.costCenter ?? ""),
    members,
    modules: asArray(row.modules ?? row.milestones).map(mapModule),
    documents: asArray(row.documents).map(mapDocument),
    audit: fallback?.audit ?? [
      {
        id: `${text(row.id, "project")}-created`,
        at: dateText(row.created_at ?? row.updated_at),
        actor: "Backend API",
        action: "Project synced",
      },
    ],
    permissions: asRecord(row.permissions) as Project["permissions"],
  };
}

export function mapApiProjects(values: unknown[], fallbacks: Project[]): Project[] {
  return values.map((value) => {
    const row = asRecord(value);
    const id = text(row.id);
    const code = text(row.project_code ?? row.code);
    const fallback = fallbacks.find((project) => project.id === id || project.code === code);
    return mapApiProject(row as ApiRecord, fallback);
  });
}
