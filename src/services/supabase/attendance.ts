import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type AttendanceRow = Database["public"]["Tables"]["attendance_logs"]["Row"];
export type AttendanceInsert = Database["public"]["Tables"]["attendance_logs"]["Insert"];

export async function listAttendance(employeeId?: string, from?: string, to?: string) {
  let q = supabase.from("attendance_logs").select("*").order("log_date", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (from) q = q.gte("log_date", from);
  if (to) q = q.lte("log_date", to);
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function punchIn(employeeId: string, workMode = "office") {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("attendance_logs")
    .upsert(
      {
        company_id: cid as string,
        employee_id: employeeId,
        log_date: today,
        punch_in: new Date().toISOString(),
        work_mode: workMode,
        status: "present",
      },
      { onConflict: "employee_id,log_date" },
    )
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "attendance.punch_in", entityType: "attendance_log", entityId: data.id });
  return data;
}

export async function punchOut(employeeId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("*").eq("employee_id", employeeId).eq("log_date", today).maybeSingle();
  if (!existing) throw new Error("No punch in for today");
  const out = new Date();
  const inTs = existing.punch_in ? new Date(existing.punch_in) : out;
  const hours = Math.max(0, (out.getTime() - inTs.getTime()) / 3_600_000);
  const { data, error } = await supabase
    .from("attendance_logs")
    .update({ punch_out: out.toISOString(), work_hours: Number(hours.toFixed(2)) })
    .eq("id", existing.id).select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "attendance.punch_out", entityType: "attendance_log", entityId: data.id });
  return data;
}
