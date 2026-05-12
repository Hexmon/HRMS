import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { writeAuditLog } from "./audit";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type ProjectMember = Database["public"]["Tables"]["project_members"]["Row"];
export type ProjectTask = Database["public"]["Tables"]["project_tasks"]["Row"];

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects").select("*").order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function getProject(id: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_members(*), project_tasks(*), project_documents(*)")
    .eq("id", id).maybeSingle();
  if (error) return null;
  return data;
}

export async function createProject(input: Omit<ProjectInsert, "company_id">) {
  const { data: cid } = await supabase.rpc("current_company_id");
  if (!cid) throw new Error("No company");
  const { data, error } = await supabase
    .from("projects").insert({ ...input, company_id: cid as string })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "project.created", entityType: "project", entityId: data.id });
  return data;
}

export async function updateProject(id: string, patch: Partial<ProjectInsert>) {
  const { data, error } = await supabase
    .from("projects").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "project.updated", entityType: "project", entityId: id });
  return data;
}

export async function assignMember(
  projectId: string, employeeId: string, role: string, allocationPct = 100,
) {
  const { data, error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, employee_id: employeeId, role, allocation_pct: allocationPct })
    .select("*").single();
  if (error) throw error;
  await writeAuditLog({ action: "project.member_added", entityType: "project", entityId: projectId });
  return data;
}

export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("project_members").select("*").eq("project_id", projectId);
  if (error) return [];
  return data ?? [];
}

export async function listTasks(projectId: string): Promise<ProjectTask[]> {
  const { data, error } = await supabase
    .from("project_tasks").select("*").eq("project_id", projectId);
  if (error) return [];
  return data ?? [];
}
