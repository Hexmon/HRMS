import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  remarks?: string;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  const { data: cid } = await supabase.rpc("current_company_id");
  const { data: pid } = await supabase.rpc("current_profile_id");
  if (!cid) return;
  const { error } = await supabase.from("audit_logs").insert({
    company_id: cid as string,
    actor_user_id: (pid as string) ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    old_value: (input.oldValue as never) ?? null,
    new_value: (input.newValue as never) ?? null,
    remarks: input.remarks ?? null,
  });
  if (error) console.warn("[audit] writeAuditLog", error.message);
}

export async function listAuditLogs(limit = 100): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}
