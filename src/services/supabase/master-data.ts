import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Department = Database["public"]["Tables"]["departments"]["Row"];
export type Designation = Database["public"]["Tables"]["designations"]["Row"];

export async function listDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from("departments").select("*").order("name");
  if (error) return [];
  return data ?? [];
}

export async function createDepartment(name: string, description?: string) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company context");
  const { data, error } = await supabase
    .from("departments")
    .insert({ company_id: cid as string, name, description })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listDesignations(): Promise<Designation[]> {
  const { data, error } = await supabase.from("designations").select("*").order("name");
  if (error) return [];
  return data ?? [];
}

export async function createDesignation(name: string, description?: string) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company context");
  const { data, error } = await supabase
    .from("designations")
    .insert({ company_id: cid as string, name, description })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
