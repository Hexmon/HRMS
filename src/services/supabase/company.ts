import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];

export async function getCurrentCompany(): Promise<Company | null> {
  const { data: cid, error: rpcErr } = await supabase.rpc("current_company_id");
  if (rpcErr || !cid) return null;
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", cid as string)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function createCompany(input: CompanyInsert): Promise<Company | null> {
  const { data, error } = await supabase
    .from("companies")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    console.warn("[company] createCompany", error.message);
    return null;
  }
  return data;
}

export async function updateCompany(id: string, patch: Partial<CompanyInsert>) {
  const { data, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
