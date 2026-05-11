import * as React from "react";
import { EMPLOYEES, type Employee } from "./mock/employees";

const STORAGE_KEY = "hawkaii_employees";

interface Ctx {
  employees: Employee[];
  upsert: (e: Employee) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: Employee["status"]) => void;
  reset: () => void;
}

const EmployeesCtx = React.createContext<Ctx | null>(null);

export function EmployeesProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = React.useState<Employee[]>(EMPLOYEES);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setEmployees(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: Employee[]) => {
    setEmployees(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const upsert: Ctx["upsert"] = (e) => {
    const exists = employees.some((x) => x.id === e.id);
    persist(exists ? employees.map((x) => (x.id === e.id ? e : x)) : [e, ...employees]);
  };
  const remove: Ctx["remove"] = (id) => persist(employees.filter((x) => x.id !== id));
  const setStatus: Ctx["setStatus"] = (id, status) =>
    persist(employees.map((x) => (x.id === id ? { ...x, status } : x)));
  const reset = () => persist(EMPLOYEES);

  return (
    <EmployeesCtx.Provider value={{ employees, upsert, remove, setStatus, reset }}>
      {children}
    </EmployeesCtx.Provider>
  );
}

export function useEmployees() {
  const ctx = React.useContext(EmployeesCtx);
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
