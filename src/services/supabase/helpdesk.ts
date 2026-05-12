import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type Ticket = Database["public"]["Tables"]["helpdesk_tickets"]["Row"];
export type TicketInsert = Database["public"]["Tables"]["helpdesk_tickets"]["Insert"];
export type Comment = Database["public"]["Tables"]["helpdesk_comments"]["Row"];
export type Category = Database["public"]["Tables"]["helpdesk_categories"]["Row"];

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("helpdesk_categories").select("*").order("name");
  if (error) return [];
  return data ?? [];
}

export async function createTicket(input: Omit<TicketInsert, "company_id">) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("helpdesk_tickets").insert({ ...input, company_id: cid as string })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "helpdesk.created", entityType: "helpdesk_ticket", entityId: data.id });
  return data;
}

export async function listMyTickets(requesterId: string) {
  const { data, error } = await supabase
    .from("helpdesk_tickets").select("*").eq("requester_id", requesterId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function listAgentQueue(assigneeId?: string) {
  let q = supabase.from("helpdesk_tickets").select("*")
    .in("status", ["open", "in_progress"]).order("created_at", { ascending: false });
  if (assigneeId) q = q.eq("assignee_id", assigneeId);
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function assignTicket(ticketId: string, assigneeId: string) {
  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .update({ assignee_id: assigneeId, status: "in_progress" })
    .eq("id", ticketId).select("*").single();
  if (error) throw error;
  await supabase.from("helpdesk_assignments").insert({ ticket_id: ticketId, assignee_id: assigneeId });
  await writeAuditLog({ action: "helpdesk.assigned", entityType: "helpdesk_ticket", entityId: ticketId });
  return data;
}

export async function changeStatus(ticketId: string, status: string) {
  const patch: Database["public"]["Tables"]["helpdesk_tickets"]["Update"] = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("helpdesk_tickets").update(patch).eq("id", ticketId).select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: `helpdesk.${status}`, entityType: "helpdesk_ticket", entityId: ticketId });
  return data;
}

export async function listComments(ticketId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("helpdesk_comments").select("*").eq("ticket_id", ticketId)
    .order("created_at");
  if (error) return [];
  return data ?? [];
}

export async function addComment(ticketId: string, body: string, isInternal = false) {
  const { data, error } = await supabase
    .from("helpdesk_comments").insert({ ticket_id: ticketId, body, is_internal: isInternal })
    .select("*").single();
  if (error) throw error;
  return data;
}
