import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type EmployeeInsert = Database["public"]["Tables"]["employees"]["Insert"];
export type EmployeeUpdate = Database["public"]["Tables"]["employees"]["Update"];

export interface EmployeeWithJoins extends EmployeeRow {
  departments?: { name: string } | null;
  designations?: { name: string } | null;
}

export async function getCompanyEmployees(): Promise<EmployeeWithJoins[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*, departments(name), designations(name)")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[employees] list", error.message);
    return [];
  }
  return (data ?? []) as unknown as EmployeeWithJoins[];
}

export async function getEmployeeById(id: string): Promise<EmployeeWithJoins | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("*, departments(name), designations(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as unknown as EmployeeWithJoins;
}

export async function createEmployee(input: EmployeeInsert) {
  const { data, error } = await supabase.from("employees").insert(input).select("*").single();
  if (error) throw error;
  await writeAuditLog({
    action: "employee.created",
    entityType: "employee",
    entityId: data.id,
    new_value: data as never,
  } as never);
  return data;
}

export async function updateEmployee(id: string, patch: EmployeeUpdate) {
  const { data: prev } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("employees").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({
    action: "employee.updated",
    entityType: "employee",
    entityId: id,
    oldValue: prev as never,
    newValue: data as never,
  });
  return data;
}

export async function setEmployeeLogin(id: string, loginEnabled: boolean) {
  const { data, error } = await supabase
    .from("employees").update({ login_enabled: loginEnabled }).eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({
    action: loginEnabled ? "employee.login_enabled" : "employee.login_disabled",
    entityType: "employee",
    entityId: id,
  });
  return data;
}

export async function setEmployeeStatus(id: string, status: string) {
  const { data, error } = await supabase
    .from("employees")
    // employee_status is a typed enum in the DB; cast at the boundary
    .update({ employee_status: status as never })
    .eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({
    action: "employee.status_changed",
    entityType: "employee",
    entityId: id,
    remarks: `Status set to ${status}`,
  });
  return data;
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
  await writeAuditLog({ action: "employee.deleted", entityType: "employee", entityId: id });
}

/** Replace an employee user's role assignments. Requires the linked user_profile id. */
export async function setEmployeeRoles(userProfileId: string, roleIds: string[]) {
  await supabase.from("user_roles").delete().eq("user_profile_id", userProfileId);
  if (roleIds.length) {
    const { error } = await supabase
      .from("user_roles")
      .insert(roleIds.map((rid) => ({ user_profile_id: userProfileId, role_id: rid })));
    if (error) throw error;
  }
  await writeAuditLog({
    action: "employee.roles_updated",
    entityType: "user_profile",
    entityId: userProfileId,
    remarks: `Roles set to ${roleIds.join(", ")}`,
  });
}
