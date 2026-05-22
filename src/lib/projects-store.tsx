import * as React from "react";
import { PROJECTS, type Project, type ProjectAuditEntry } from "./mock/projects";

const KEY = "hawkaii_projects_v1";

interface Ctx {
  projects: Project[];
  upsert: (p: Project, actor?: string) => void;
  remove: (id: string, actor?: string) => void;
  setStatus: (id: string, status: Project["status"], actor?: string, remarks?: string) => void;
  addMember: (id: string, member: Project["members"][number], actor?: string) => void;
  removeMember: (id: string, memberId: string, actor?: string) => void;
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

  React.useEffect(() => {
    setProjects(loadLs(KEY, PROJECTS));
  }, []);

  const persist = (next: Project[]) => {
    setProjects(next);
    saveLs(KEY, next);
  };

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
  };

  const reset = () => persist(PROJECTS);

  return (
    <Ctx.Provider value={{ projects, upsert, remove, setStatus, addMember, removeMember, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProjects() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useProjects must be used within ProjectsProvider");
  return c;
}
