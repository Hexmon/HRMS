import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeService } from "@/services/supabase";
import type { Employee } from "@/lib/mock/employees";

/**
 * Hybrid hook: when a real Supabase session exists, fetch employees from the
 * backend and adapt them to the local Employee shape used by the UI. Falls
 * back to `null` so callers can use mock data instead.
 *
 * This is intentionally additive — does not replace `useEmployees()` so the
 * existing mock-driven UI keeps working. Components can opt in by checking
 * `data` and using it when present.
 */
export function useSupabaseEmployees() {
  const [data, setData] = React.useState<Employee[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setData(null);
        return;
      }
      const rows = await EmployeeService.getCompanyEmployees();
      const adapted: Employee[] = rows.map((r) => ({
        id: r.employee_code ?? r.id,
        firstName: r.first_name,
        middleName: r.middle_name ?? undefined,
        lastName: r.last_name,
        name: r.full_name ?? `${r.first_name} ${r.last_name}`.trim(),
        email: r.company_email ?? r.personal_email ?? "",
        personalEmail: r.personal_email ?? undefined,
        phone: r.contact_number ?? "",
        designation: r.designations?.name ?? "—",
        department: r.departments?.name ?? "—",
        manager: "—",
        location: r.work_location ?? "—",
        workMode: (r.work_mode as Employee["workMode"]) ?? "office",
        status: (r.employee_status as Employee["status"]) ?? "active",
        employmentType: (r.employment_type as Employee["employmentType"]) ?? "full_time",
        joinedAt: r.date_of_joining ?? r.created_at,
        probationEndDate: r.probation_end_date ?? undefined,
        noticeDays: r.notice_period_days ?? 30,
        shift: "General (10:00–19:00)",
        loginEnabled: r.login_enabled,
        systemRoles: ["employee"],
        avatarTone: "primary",
        roleHistory: [],
        audit: [],
        documents: [],
      }));
      setData(adapted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
