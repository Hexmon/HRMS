import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsApi, mapApiProjects, mapApiProject } from "@/domains/projects";
import type {
  ProjectCreateBody,
  ProjectMemberCreateBody,
  ProjectMemberUpdateBody,
  ProjectUpdateBody,
} from "@/domains/projects";
import {
  asRecord,
  isUuid,
  pageItems,
  useApiRouteEnabled,
  withApiFallback,
  type ApiRecord,
} from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { useEmployees } from "@/lib/employees-store";
import { PROJECTS, type Project, type ProjectAuditEntry } from "./mock/projects";

const KEY = "hawkaii_projects_v1";

interface Ctx {
  projects: Project[];
  loading: boolean;
  error: Error | null;
  isApiBacked: boolean;
  upsert: (p: Project, actor?: string) => Promise<void> | void;
  remove: (id: string, actor?: string) => void;
  setStatus: (
    id: string,
    status: Project["status"],
    actor?: string,
    remarks?: string,
  ) => Promise<void> | void;
  addMember: (
    id: string,
    member: Project["members"][number],
    actor?: string,
  ) => Promise<void> | void;
  removeMember: (id: string, memberId: string, actor?: string) => Promise<void> | void;
  reset: () => void;
}

const Ctx = React.createContext<Ctx | null>(null);

function loadLs<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLs(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(v));
}

const newAudit = (actor: string, action: string, remarks?: string): ProjectAuditEntry => ({
  id: "pa_" + Math.random().toString(36).slice(2, 10),
  at: new Date().toISOString(),
  actor,
  action,
  remarks,
});

export function nextProjectId(existing: Project[]): string {
  const nums = existing
    .map((p) => Number(p.id.replace(/[^0-9]/g, "")))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 300;
  return `PRJ-${max + 1}`;
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = React.useState<Project[]>(PROJECTS);
  const { employees, departments } = useEmployees();
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled([
    "/projects",
    "/team-utilization",
    "/timesheet",
    "/reports/projects",
    "/helpdesk",
  ]);

  React.useEffect(() => {
    setProjects(loadLs(KEY, PROJECTS));
  }, []);

  const persist = (next: Project[]) => {
    setProjects(next);
    saveLs(KEY, next);
  };

  const apiProjectsQuery = useQuery({
    queryKey: queryKeys.list("projects", "portfolio", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => mapApiProjects(pageItems(await projectsApi.list({ page_size: 100 })), projects),
        () => projects,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const visibleProjects = apiEnabled ? (apiProjectsQuery.data ?? []) : projects;
  const apiError = apiProjectsQuery.error instanceof Error ? apiProjectsQuery.error : null;

  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.domain("projects") });

  const findProject = (id: string) => visibleProjects.find((project) => project.id === id);

  const resolveUserId = (value: string | undefined): string | null => {
    if (!value) return null;
    if (isUuid(value)) return value;
    const employee = employees.find(
      (candidate) =>
        candidate.apiId === value ||
        candidate.id === value ||
        candidate.name === value ||
        candidate.email === value,
    );
    return employee?.apiId && isUuid(employee.apiId) ? employee.apiId : null;
  };

  const resolveDepartmentId = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    if (isUuid(value)) return value;
    const department = departments.find(
      (candidate) =>
        candidate.apiId === value || candidate.id === value || candidate.name === value,
    );
    const id = department?.apiId ?? department?.id;
    return id && isUuid(id) ? id : undefined;
  };

  const projectCreateBody = (project: Project): ProjectCreateBody => {
    const managerUserId = resolveUserId(project.managerUserId ?? project.manager);
    if (!managerUserId) {
      throw new Error("Project manager must be selected from backend employees.");
    }
    const body: ProjectCreateBody = {
      project_code: project.code,
      name: project.name,
      client_name: project.client,
      project_type: project.type,
      billing_type: project.billingType,
      manager_user_id: managerUserId,
      department_id: resolveDepartmentId(project.departmentId ?? project.department),
      start_date: project.startDate,
      end_date: project.endDate,
      status: project.status,
      health: project.health,
      description: project.description || null,
      estimated_hours: project.estimatedHours.toFixed(2),
      estimated_budget: project.estimatedBudget.toFixed(2),
      tech_stack: project.techStack,
      priority: project.priority,
    };
    const costCenter = project.costCenter.trim();
    if (costCenter) body.cost_center = costCenter;
    return body;
  };

  const projectUpdateBody = (project: Project, expectedVersion: number): ProjectUpdateBody => ({
    ...projectCreateBody(project),
    expected_version: expectedVersion,
  });

  const memberCreateBody = (
    member: Project["members"][number],
    expectedVersion: number,
  ): ProjectMemberCreateBody => {
    const userId = resolveUserId(member.employeeUserId ?? member.employeeId ?? member.name);
    if (!userId) {
      throw new Error(
        `${member.name || "Project member"} must be selected from backend employees.`,
      );
    }
    return {
      user_id: userId,
      project_role: member.role,
      allocation_percent: member.allocation,
      over_allocation_acknowledged:
        member.allocation > 100 ? Boolean(member.overAllocationAcknowledged) : false,
      over_allocation_reason: member.overAllocationReason?.trim() || undefined,
      billable: member.billable,
      start_date: member.startDate,
      end_date: member.endDate ?? null,
      reporting_lead_user_id: resolveUserId(member.reportingLeadUserId ?? member.reportingLead),
      expected_version: expectedVersion,
    };
  };

  const memberUpdateBody = (
    member: Project["members"][number],
    expectedVersion: number,
    status?: string,
  ): ProjectMemberUpdateBody => ({
    project_role: member.role,
    allocation_percent: member.allocation,
    over_allocation_acknowledged:
      member.allocation > 100 ? Boolean(member.overAllocationAcknowledged) : undefined,
    over_allocation_reason: member.overAllocationReason?.trim() || undefined,
    billable: member.billable,
    start_date: member.startDate,
    end_date: member.endDate ?? null,
    reporting_lead_user_id: resolveUserId(member.reportingLeadUserId ?? member.reportingLead),
    status,
    expected_version: expectedVersion,
  });

  const syncMembers = async (currentProject: Project, desiredMembers: Project["members"] = []) => {
    let projectVersion = currentProject.version ?? 1;
    const existingMembers = currentProject.members;
    for (const member of desiredMembers) {
      const existing = existingMembers.find(
        (candidate) =>
          candidate.id === member.id ||
          candidate.apiId === member.apiId ||
          candidate.employeeUserId === member.employeeUserId ||
          candidate.employeeId === member.employeeId,
      );
      if (existing?.apiId && isUuid(existing.apiId)) {
        await projectsApi.updateMember(
          currentProject.id,
          existing.apiId,
          memberUpdateBody({ ...existing, ...member }, existing.version ?? 1),
        );
      } else {
        const response = await projectsApi.addMember(
          currentProject.id,
          memberCreateBody(member, projectVersion),
        );
        const nextVersion = Number(asRecord(response).project_version);
        if (Number.isFinite(nextVersion)) projectVersion = nextVersion;
      }
    }
    for (const existing of existingMembers) {
      const stillPresent = desiredMembers.some(
        (member) =>
          member.id === existing.id ||
          member.apiId === existing.apiId ||
          member.employeeUserId === existing.employeeUserId ||
          member.employeeId === existing.employeeId,
      );
      if (!stillPresent && existing.apiId && isUuid(existing.apiId)) {
        await projectsApi.updateMember(
          currentProject.id,
          existing.apiId,
          memberUpdateBody(existing, existing.version ?? 1, "removed"),
        );
      }
    }
  };

  const saveProjectMutation = useMutation({
    mutationFn: async (project: Project) => {
      const current = findProject(project.id);
      if (current?.id && isUuid(current.id)) {
        const response = await projectsApi.update(
          current.id,
          projectUpdateBody(project, current.version ?? project.version ?? 1),
        );
        const updated = mapApiProject(asRecord(response).project ?? response, current);
        await syncMembers(updated, project.members);
        return response;
      }
      const response = await projectsApi.create(projectCreateBody(project));
      const created = mapApiProject(asRecord(response).project ?? response);
      await syncMembers(created, project.members);
      return response;
    },
    onSuccess: invalidateProjects,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ project, status }: { project: Project; status: Project["status"] }) =>
      projectsApi.update(project.id, {
        status,
        expected_version: project.version ?? 1,
      }),
    onSuccess: invalidateProjects,
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({
      project,
      member,
    }: {
      project: Project;
      member: Project["members"][number];
    }) => projectsApi.addMember(project.id, memberCreateBody(member, project.version ?? 1)),
    onSuccess: invalidateProjects,
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({
      project,
      member,
    }: {
      project: Project;
      member: Project["members"][number];
    }) =>
      member.apiId && isUuid(member.apiId)
        ? projectsApi.updateMember(
            project.id,
            member.apiId,
            memberUpdateBody(member, member.version ?? 1, "removed"),
          )
        : Promise.resolve({}),
    onSuccess: invalidateProjects,
  });

  const upsert: Ctx["upsert"] = (p, actor = "System") => {
    const exists = projects.some((x) => x.id === p.id);
    const next = exists
      ? projects.map((x) =>
          x.id === p.id ? { ...p, audit: [...x.audit, newAudit(actor, "Project updated")] } : x,
        )
      : [
          { ...p, audit: [...(p.audit ?? []), newAudit(actor, "Project created", p.name)] },
          ...projects,
        ];
    persist(next);
    if (apiEnabled) return saveProjectMutation.mutateAsync(p).then(() => undefined);
  };

  const remove: Ctx["remove"] = (id) => {
    persist(projects.filter((p) => p.id !== id));
  };

  const setStatus: Ctx["setStatus"] = (id, status, actor = "System", remarks) => {
    persist(
      projects.map((p) =>
        p.id === id
          ? {
              ...p,
              status,
              audit: [...p.audit, newAudit(actor, `Status changed to ${status}`, remarks)],
            }
          : p,
      ),
    );
    const current = findProject(id);
    if (apiEnabled && current?.id && isUuid(current.id)) {
      return statusMutation.mutateAsync({ project: current, status }).then(() => undefined);
    }
  };

  const addMember: Ctx["addMember"] = (id, member, actor = "System") => {
    persist(
      projects.map((p) =>
        p.id === id
          ? {
              ...p,
              members: [...p.members, member],
              audit: [...p.audit, newAudit(actor, "Team member added", member.name)],
            }
          : p,
      ),
    );
    const current = findProject(id);
    if (apiEnabled && current?.id && isUuid(current.id)) {
      return addMemberMutation.mutateAsync({ project: current, member }).then(() => undefined);
    }
  };

  const removeMember: Ctx["removeMember"] = (id, memberId, actor = "System") => {
    persist(
      projects.map((p) => {
        if (p.id !== id) return p;
        const m = p.members.find((x) => x.id === memberId);
        return {
          ...p,
          members: p.members.filter((x) => x.id !== memberId),
          audit: [...p.audit, newAudit(actor, "Team member removed", m?.name)],
        };
      }),
    );
    const current = findProject(id);
    const member = current?.members.find((candidate) => candidate.id === memberId);
    if (apiEnabled && current?.id && isUuid(current.id) && member) {
      return removeMemberMutation.mutateAsync({ project: current, member }).then(() => undefined);
    }
  };

  const reset = () => persist(PROJECTS);

  return (
    <Ctx.Provider
      value={{
        projects: visibleProjects,
        loading: apiEnabled && apiProjectsQuery.isLoading,
        error: apiError,
        isApiBacked: apiEnabled && Boolean(apiProjectsQuery.data),
        upsert,
        remove,
        setStatus,
        addMember,
        removeMember,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useProjects() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useProjects must be used within ProjectsProvider");
  return c;
}
