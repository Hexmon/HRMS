import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type Timesheet = Database["public"]["Tables"]["timesheets"]["Row"];
export type TimesheetEntry = Database["public"]["Tables"]["timesheet_entries"]["Row"];
export type TimesheetInsert = Database["public"]["Tables"]["timesheets"]["Insert"];
export type EntryInsert = Database["public"]["Tables"]["timesheet_entries"]["Insert"];

export async function getOrCreateWeek(employeeId: string, weekStart: string, weekEnd: string) {
  const { data: existing } = await supabase
    .from("timesheets").select("*")
    .eq("employee_id", employeeId).eq("week_start", weekStart).maybeSingle();
  if (existing) return existing;
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("timesheets")
    .insert({ company_id: cid as string, employee_id: employeeId, week_start: weekStart, week_end: weekEnd })
    .select("*").single();
  if (error) throw error;
  return data;
}

export async function listEntries(timesheetId: string): Promise<TimesheetEntry[]> {
  const { data, error } = await supabase
    .from("timesheet_entries").select("*").eq("timesheet_id", timesheetId);
  if (error) return [];
  return data ?? [];
}

export async function upsertEntry(entry: EntryInsert) {
  const { data, error } = await supabase
    .from("timesheet_entries").insert(entry).select("*").single();
  if (error) throw error;
  return data;
}

export async function submitTimesheet(id: string) {
  const { data, error } = await supabase
    .from("timesheets")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "timesheet.submitted", entityType: "timesheet", entityId: id });
  return data;
}

export async function decideTimesheet(id: string, status: "approved" | "rejected", remarks?: string) {
  const { data, error } = await supabase
    .from("timesheets").update({ status }).eq("id", id).select("*").single();
  if (error) throw error;
  await supabase.from("timesheet_approvals").insert({ timesheet_id: id, status, remarks });
  await writeAuditLog({ action: `timesheet.${status}`, entityType: "timesheet", entityId: id, remarks });
  return data;
}

export async function listMyTimesheets(employeeId: string) {
  const { data, error } = await supabase
    .from("timesheets").select("*").eq("employee_id", employeeId)
    .order("week_start", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function listPendingApprovals() {
  const { data, error } = await supabase
    .from("timesheets").select("*").eq("status", "submitted")
    .order("submitted_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}
