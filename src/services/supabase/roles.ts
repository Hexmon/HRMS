import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type Permission = Database["public"]["Tables"]["permissions"]["Row"];
export type AppRoleName = Database["public"]["Enums"]["app_role"];

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from("roles").select("*").order("name");
  if (error) return [];
  return data ?? [];
}

export async function listPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase.from("permissions").select("*").order("module");
  if (error) return [];
  return data ?? [];
}

export async function assignRole(userProfileId: string, roleId: string) {
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_profile_id: userProfileId, role_id: roleId });
  if (error) throw error;
}

export async function revokeRole(userProfileId: string, roleId: string) {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_profile_id", userProfileId)
    .eq("role_id", roleId);
  if (error) throw error;
}

export async function setRolePermissions(roleId: string, permissionIds: string[]) {
  await supabase.from("role_permissions").delete().eq("role_id", roleId);
  if (permissionIds.length === 0) return;
  const { error } = await supabase
    .from("role_permissions")
    .insert(permissionIds.map((pid) => ({ role_id: roleId, permission_id: pid })));
  if (error) throw error;
}
