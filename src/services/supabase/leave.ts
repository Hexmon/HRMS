import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type LeaveRow = Database["public"]["Tables"]["leave_requests"]["Row"];
export type LeaveInsert = Database["public"]["Tables"]["leave_requests"]["Insert"];
export type WfhRow = Database["public"]["Tables"]["wfh_requests"]["Row"];
export type WfhInsert = Database["public"]["Tables"]["wfh_requests"]["Insert"];
export type Holiday = Database["public"]["Tables"]["holidays"]["Row"];
export type LeaveBalance = Database["public"]["Tables"]["leave_balances"]["Row"];

export async function listLeaveRequests(employeeId?: string) {
  let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function applyLeave(input: Omit<LeaveInsert, "company_id">) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({ ...input, company_id: cid as string })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "leave.requested", entityType: "leave_request", entityId: data.id });
  return data;
}

export async function decideLeave(id: string, status: "approved" | "rejected", remarks?: string) {
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status, remarks, approved_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: `leave.${status}`, entityType: "leave_request", entityId: id, remarks });
  return data;
}

export async function listWfhRequests(employeeId?: string) {
  let q = supabase.from("wfh_requests").select("*").order("created_at", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function applyWfh(input: Omit<WfhInsert, "company_id">) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("wfh_requests")
    .insert({ ...input, company_id: cid as string })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "wfh.requested", entityType: "wfh_request", entityId: data.id });
  return data;
}

export async function decideWfh(id: string, status: "approved" | "rejected", remarks?: string) {
  const { data, error } = await supabase
    .from("wfh_requests")
    .update({ status, remarks, approved_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: `wfh.${status}`, entityType: "wfh_request", entityId: id, remarks });
  return data;
}

export async function listHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabase.from("holidays").select("*").order("holiday_date");
  if (error) return [];
  return data ?? [];
}

export async function listLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
  const { data, error } = await supabase
    .from("leave_balances").select("*").eq("employee_id", employeeId);
  if (error) return [];
  return data ?? [];
}
