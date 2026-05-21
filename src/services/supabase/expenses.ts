import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type ExpenseTicket = Database["public"]["Tables"]["expense_tickets"]["Row"];
export type ExpenseLine = Database["public"]["Tables"]["expense_line_items"]["Row"];
export type TicketInsert = Database["public"]["Tables"]["expense_tickets"]["Insert"];
export type LineInsert = Database["public"]["Tables"]["expense_line_items"]["Insert"];

export async function createTicket(input: Omit<TicketInsert, "company_id">) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("expense_tickets")
    .insert({ ...input, company_id: cid as string })
    .select("*")
    .single();
  if (error) throw error;
  await writeAuditLog({
    action: "expense.created",
    entityType: "expense_ticket",
    entityId: data.id,
  });
  return data;
}

export async function addLineItem(line: LineInsert) {
  const { data, error } = await supabase
    .from("expense_line_items")
    .insert(line)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listMyTickets(employeeId: string): Promise<ExpenseTicket[]> {
  const { data, error } = await supabase
    .from("expense_tickets")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function listQueue(stage: "manager" | "finance") {
  const map: Record<string, string> = {
    manager: "submitted",
    finance: "manager_approved",
  };
  const { data, error } = await supabase
    .from("expense_tickets")
    .select("*")
    .eq("status", map[stage])
    .order("submitted_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function decideTicket(
  id: string,
  stage: "manager" | "finance",
  status: "approved" | "rejected",
  remarks?: string,
) {
  const next =
    status === "approved" ? (stage === "manager" ? "manager_approved" : "paid") : "rejected";
  const { data, error } = await supabase
    .from("expense_tickets")
    .update({ status: next })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  await supabase.from("expense_approvals").insert({ ticket_id: id, stage, status, remarks });
  await writeAuditLog({
    action: `expense.${stage}_${status}`,
    entityType: "expense_ticket",
    entityId: id,
    remarks,
  });
  return data;
}

export async function recordPayment(ticketId: string, amount: number, reference?: string) {
  const { data, error } = await supabase
    .from("expense_payments")
    .insert({ ticket_id: ticketId, amount, reference })
    .select("*")
    .single();
  if (error) throw error;
  await writeAuditLog({ action: "expense.paid", entityType: "expense_ticket", entityId: ticketId });
  return data;
}
