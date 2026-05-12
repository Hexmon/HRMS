import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type Asset = Database["public"]["Tables"]["assets"]["Row"];
export type AssetInsert = Database["public"]["Tables"]["assets"]["Insert"];

export async function listAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets").select("*").order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function createAsset(input: Omit<AssetInsert, "company_id">) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("assets").insert({ ...input, company_id: cid as string })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "asset.created", entityType: "asset", entityId: data.id });
  return data;
}

export async function assignAsset(assetId: string, employeeId: string, conditionOut?: string) {
  const { data, error } = await supabase
    .from("asset_assignments")
    .insert({ asset_id: assetId, employee_id: employeeId, condition_out: conditionOut })
    .select("*").single();
  if (error) throw error;
  await supabase.from("assets").update({ status: "assigned" }).eq("id", assetId);
  await writeAuditLog({ action: "asset.assigned", entityType: "asset", entityId: assetId });
  return data;
}

export async function returnAsset(assignmentId: string, conditionIn?: string) {
  const { data, error } = await supabase
    .from("asset_assignments")
    .update({ returned_at: new Date().toISOString(), condition_in: conditionIn })
    .eq("id", assignmentId).select("*").single();
  if (error) throw error;
  await supabase.from("assets").update({ status: "available" }).eq("id", data.asset_id);
  await writeAuditLog({ action: "asset.returned", entityType: "asset", entityId: data.asset_id });
  return data;
}

export async function requestAsset(employeeId: string, assetType: string, reason?: string) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("asset_requests")
    .insert({ company_id: cid as string, employee_id: employeeId, asset_type: assetType, reason })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "asset.requested", entityType: "asset_request", entityId: data.id });
  return data;
}

export async function listMyAssets(employeeId: string) {
  const { data, error } = await supabase
    .from("asset_assignments").select("*, assets(*)").eq("employee_id", employeeId)
    .is("returned_at", null);
  if (error) return [];
  return data ?? [];
}

export async function warrantyAlerts(daysAhead = 60) {
  const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("assets").select("*")
    .gte("warranty_until", today).lte("warranty_until", cutoff)
    .order("warranty_until");
  if (error) return [];
  return data ?? [];
}
