import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { coreApi, mapApiUsersToEmployees } from "@/domains/core";
import { pageItems, useApiRouteEnabled, withApiFallback } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { EMPLOYEES, type Employee, type AuditEntry, type RoleHistoryEntry } from "./mock/employees";
import { DEPARTMENTS as SEED_DEPTS, type Department } from "./mock/departments";
import { DESIGNATIONS as SEED_DESIGS, type Designation } from "./mock/designations";

const EMP_KEY = "hawkaii_employees_v2";
const DEPT_KEY = "hawkaii_departments_v1";
const DESG_KEY = "hawkaii_designations_v1";

interface Ctx {
  employees: Employee[];
  departments: Department[];
  designations: Designation[];
  loading: boolean;
  error: Error | null;
  isApiBacked: boolean;
  upsert: (e: Employee, actor?: string) => void;
  remove: (id: string, actor?: string) => void;
  setStatus: (id: string, status: Employee["status"], actor?: string) => void;
  setLogin: (id: string, enabled: boolean, actor?: string) => void;
  setRoles: (id: string, roles: string[], actor?: string) => void;
  addDepartment: (name: string, description?: string) => Department;
  addDesignation: (title: string, department: string) => Designation;
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

const newAudit = (actor: string, action: string, remarks?: string): AuditEntry => ({
  id: "a_" + Math.random().toString(36).slice(2, 10),
  at: new Date().toISOString(),
  actor,
  action,
  remarks,
});

export function EmployeesProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = React.useState<Employee[]>(EMPLOYEES);
  const [departments, setDepartments] = React.useState<Department[]>(SEED_DEPTS);
  const [designations, setDesignations] = React.useState<Designation[]>(SEED_DESIGS);
  const apiEnabled = useApiRouteEnabled([
    "/dashboard",
    "/employees",
    "/projects",
    "/team-utilization",
    "/timesheet",
    "/assets",
  ]);

  React.useEffect(() => {
    setEmployees(loadLs(EMP_KEY, EMPLOYEES));
    setDepartments(loadLs(DEPT_KEY, SEED_DEPTS));
    setDesignations(loadLs(DESG_KEY, SEED_DESIGS));
  }, []);

  const persistE = (next: Employee[]) => {
    setEmployees(next);
    saveLs(EMP_KEY, next);
  };
  const persistD = (next: Department[]) => {
    setDepartments(next);
    saveLs(DEPT_KEY, next);
  };
  const persistG = (next: Designation[]) => {
    setDesignations(next);
    saveLs(DESG_KEY, next);
  };

  const upsert: Ctx["upsert"] = (e, actor = "Rahul Verma") => {
    const exists = employees.some((x) => x.id === e.id);
    const action = exists ? "Profile updated" : "Profile created";
    const next: Employee = {
      ...e,
      audit: [newAudit(actor, action), ...(e.audit ?? [])],
    };
    persistE(exists ? employees.map((x) => (x.id === e.id ? next : x)) : [next, ...employees]);
  };

  const remove: Ctx["remove"] = (id) => persistE(employees.filter((x) => x.id !== id));

  const setStatus: Ctx["setStatus"] = (id, status, actor = "Rahul Verma") => {
    persistE(
      employees.map((x) =>
        x.id === id
          ? {
              ...x,
              status,
              audit: [newAudit(actor, "Status changed", `Status set to ${status}`), ...x.audit],
            }
          : x,
      ),
    );
  };

  const setLogin: Ctx["setLogin"] = (id, enabled, actor = "Rahul Verma") => {
    persistE(
      employees.map((x) =>
        x.id === id
          ? {
              ...x,
              loginEnabled: enabled,
              audit: [newAudit(actor, enabled ? "Login enabled" : "Login disabled"), ...x.audit],
            }
          : x,
      ),
    );
  };

  const setRoles: Ctx["setRoles"] = (id, roles, actor = "Rahul Verma") => {
    persistE(
      employees.map((x) => {
        if (x.id !== id) return x;
        const entry: RoleHistoryEntry = {
          at: new Date().toISOString(),
          actor,
          from: x.systemRoles,
          to: roles,
        };
        return {
          ...x,
          systemRoles: roles,
          roleHistory: [entry, ...x.roleHistory],
          audit: [newAudit(actor, "Roles updated", roles.join(", ")), ...x.audit],
        };
      }),
    );
  };

  const addDepartment: Ctx["addDepartment"] = (name, _description) => {
    const id = `DEP-${String(departments.length + 1).padStart(2, "0")}`;
    const dept: Department = { id, name, head: "—", headcount: 0 };
    persistD([...departments, dept]);
    return dept;
  };

  const addDesignation: Ctx["addDesignation"] = (title, department) => {
    const id = `DSG-${String(designations.length + 1).padStart(2, "0")}`;
    const desig: Designation = { id, title, level: "Mid", department };
    persistG([...designations, desig]);
    return desig;
  };

  const reset = () => {
    persistE(EMPLOYEES);
    persistD(SEED_DEPTS);
    persistG(SEED_DESIGS);
  };

  const apiEmployeesQuery = useQuery({
    queryKey: queryKeys.list("core", "users", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await coreApi.listUsersPartial({ page_size: 100 });
          return mapApiUsersToEmployees(pageItems(response), employees);
        },
        () => employees,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const visibleEmployees = apiEnabled ? (apiEmployeesQuery.data ?? []) : employees;
  const apiError = apiEmployeesQuery.error instanceof Error ? apiEmployeesQuery.error : null;

  return (
    <Ctx.Provider
      value={{
        employees: visibleEmployees,
        departments,
        designations,
        loading: apiEnabled && apiEmployeesQuery.isLoading,
        error: apiError,
        isApiBacked: apiEnabled && Boolean(apiEmployeesQuery.data),
        upsert,
        remove,
        setStatus,
        setLogin,
        setRoles,
        addDepartment,
        addDesignation,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEmployees() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useEmployees must be used inside EmployeesProvider");
  return ctx;
}

export function nextEmployeeId(existing: Employee[]): string {
  const max = existing.reduce((m, e) => {
    const n = parseInt(e.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return `EMP-${max + 1}`;
}
