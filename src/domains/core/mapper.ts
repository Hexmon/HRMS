import { asRecord, dateText, text, boolValue, type ApiRecord } from "@/shared/api";
import type { Employee } from "@/lib/mock/employees";

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "Employee",
    lastName: parts.slice(1).join(" ") || "User",
  };
}

export function mapApiUserToEmployee(value: unknown, fallback?: Partial<Employee>): Employee {
  const row = asRecord(value);
  const name = text(row.full_name ?? row.name, fallback?.name ?? "Employee User");
  const split = splitName(name);
  const roles = Array.isArray(row.roles)
    ? row.roles.map((role) => text(role).toLowerCase().replace(/\s+/g, "_")).filter(Boolean)
    : (fallback?.systemRoles ?? ["employee"]);

  return {
    id: text(row.employee_code ?? row.id, fallback?.id ?? "EMP-API"),
    firstName: text(row.first_name, fallback?.firstName ?? split.firstName),
    middleName: text(row.middle_name, fallback?.middleName),
    lastName: text(row.last_name, fallback?.lastName ?? split.lastName),
    name,
    gender: fallback?.gender,
    dob: text(row.date_of_birth, fallback?.dob),
    email: text(row.email, fallback?.email ?? ""),
    personalEmail: text(row.personal_email, fallback?.personalEmail),
    phone: text(row.phone, fallback?.phone ?? "—"),
    designation: text(row.designation_name ?? row.designation, fallback?.designation ?? "Employee"),
    department: text(row.department_name ?? row.department, fallback?.department ?? "General"),
    manager: text(row.manager_name ?? row.manager, fallback?.manager ?? "—"),
    location: text(row.location ?? row.work_location, fallback?.location ?? "—"),
    workMode: fallback?.workMode ?? "hybrid",
    status: text(row.employment_status, fallback?.status ?? "active") as Employee["status"],
    employmentType: fallback?.employmentType ?? "full_time",
    joinedAt: dateText(
      row.joined_at ?? row.created_at,
      fallback?.joinedAt ?? new Date().toISOString(),
    ).slice(0, 10),
    probationEndDate: text(row.probation_end_date, fallback?.probationEndDate),
    noticeDays: fallback?.noticeDays ?? 30,
    shift: text(row.shift, fallback?.shift ?? "General"),
    loginEnabled: boolValue(row.login_enabled, fallback?.loginEnabled ?? true),
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
