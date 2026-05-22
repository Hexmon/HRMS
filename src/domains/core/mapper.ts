import { asRecord, dateText, text, boolValue, type ApiRecord } from "@/shared/api";
import type { Employee } from "@/lib/mock/employees";

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "Employee",
    lastName: parts.slice(1).join(" ") || "User",
  };
}

function nestedText(row: ApiRecord, key: string, childKey: string): unknown {
  const value = row[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as ApiRecord)[childKey];
}

function mapRole(value: unknown): string {
  const normalized = text(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  switch (normalized) {
    case "admin":
      return "main_admin";
    case "hr_manager":
      return "hr_admin";
    case "finance_manager":
      return "finance_manager";
    case "asset_manager":
      return "asset_admin";
    case "reviewer":
    case "director":
      return "manager";
    default:
      return normalized || "employee";
  }
}

function mapStatus(value: unknown, fallback?: Employee["status"]): Employee["status"] {
  switch (text(value).trim().toLowerCase()) {
    case "active":
      return "active";
    case "terminated":
      return "exited";
    case "inactive":
    case "suspended":
      return "inactive";
    default:
      return fallback ?? "active";
  }
}

export function mapApiUserToEmployee(value: unknown, fallback?: Partial<Employee>): Employee {
  const row = asRecord(value);
  const name = text(row.full_name ?? row.name, fallback?.name ?? "Employee User");
  const split = splitName(name);
  const roleValues = Array.isArray(row.role_labels) ? row.role_labels : row.roles;
  const roles = Array.isArray(roleValues)
    ? roleValues.map(mapRole).filter(Boolean)
    : (fallback?.systemRoles ?? ["employee"]);

  return {
    id: text(row.employee_code, fallback?.id ?? text(row.id, "EMP-API")),
    apiId: text(row.id, fallback?.apiId),
    version:
      typeof row.version === "number" && Number.isFinite(row.version)
        ? row.version
        : fallback?.version,
    firstName: text(row.first_name, fallback?.firstName ?? split.firstName),
    middleName: text(row.middle_name, fallback?.middleName),
    lastName: text(row.last_name, fallback?.lastName ?? split.lastName),
    name,
    gender: fallback?.gender,
    dob: text(row.date_of_birth, fallback?.dob),
    email: text(row.email, fallback?.email ?? ""),
    personalEmail: text(row.personal_email, fallback?.personalEmail),
    phone: text(row.phone, fallback?.phone ?? "—"),
    designation: text(
      row.designation_name ?? nestedText(row, "designation", "title") ?? row.designation,
      fallback?.designation ?? "Employee",
    ),
    department: text(
      row.department_name ?? nestedText(row, "department", "name") ?? row.department,
      fallback?.department ?? "General",
    ),
    manager: text(
      row.manager_name ?? nestedText(row, "manager", "full_name") ?? row.manager,
      fallback?.manager ?? "—",
    ),
    location: text(row.location ?? row.work_location, fallback?.location ?? "—"),
    workMode: fallback?.workMode ?? "hybrid",
    status: mapStatus(row.status ?? row.employment_status, fallback?.status),
    employmentType: fallback?.employmentType ?? "full_time",
    joinedAt: dateText(
      row.joined_at ?? row.created_at,
      fallback?.joinedAt ?? new Date().toISOString(),
    ).slice(0, 10),
    probationEndDate: text(row.probation_end_date, fallback?.probationEndDate),
    noticeDays: fallback?.noticeDays ?? 30,
    shift: text(row.shift, fallback?.shift ?? "General"),
    loginEnabled:
      row.login_state === "enabled"
        ? true
        : row.login_state === "disabled" || row.login_state === "setup_pending"
          ? false
          : boolValue(row.login_enabled, fallback?.loginEnabled ?? false),
    systemRoles: roles.length ? roles : ["employee"],
    lastLoginAt: text(row.last_login_at, fallback?.lastLoginAt),
    avatarTone: fallback?.avatarTone ?? "primary",
    roleHistory: fallback?.roleHistory ?? [],
    audit: fallback?.audit ?? [],
    documents: fallback?.documents ?? [],
  };
}

export function mapApiUsersToEmployees(values: unknown[], fallbacks: Employee[]): Employee[] {
  return values.map((value) => {
    const row = asRecord(value);
    const key = text(row.employee_code ?? row.id);
    const fallback = fallbacks.find(
      (employee) => employee.id === key || employee.email === row.email,
    );
    return mapApiUserToEmployee(row as ApiRecord, fallback);
  });
}
