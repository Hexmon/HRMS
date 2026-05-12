import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type EmployeeInsert = Database["public"]["Tables"]["employees"]["Insert"];
export type EmployeeUpdate = Database["public"]["Tables"]["employees"]["Update"];

export async function getCompanyEmployees(): Promise<EmployeeRow[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*, departments(name), designations(name)")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[employees] list", error.message);
    return [];
  }
  return (data ?? []) as unknown as EmployeeRow[];
}

export async function getEmployeeById(id: string): Promise<EmployeeRow | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("*, departments(name), designations(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as unknown as EmployeeRow;
}

export async function createEmployee(input: EmployeeInsert) {
  const { data, error } = await supabase
    .from("employees")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(id: string, patch: EmployeeUpdate) {
  const { data, error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}
