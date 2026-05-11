import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Users, Clock, Plane, Briefcase, Timer, Wallet,
  Boxes, LifeBuoy, ShieldCheck, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/reports")({ component: ReportsLayout });

interface CategoryDef {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[]; // role keys allowed
}

export const REPORT_CATEGORIES: CategoryDef[] = [
  { to: "/reports/hr", label: "HR Reports", icon: Users, roles: ["main_admin", "hr_admin"] },
  { to: "/reports/attendance", label: "Attendance Reports", icon: Clock, roles: ["main_admin", "hr_admin", "manager"] },
  { to: "/reports/leave", label: "Leave & WFH Reports", icon: Plane, roles: ["main_admin", "hr_admin", "manager"] },
  { to: "/reports/projects", label: "Project Reports", icon: Briefcase, roles: ["main_admin", "manager", "project_manager"] },
  { to: "/reports/timesheet", label: "Timesheet Reports", icon: Timer, roles: ["main_admin", "manager", "project_manager", "hr_admin"] },
  { to: "/reports/expenses", label: "Expense Reports", icon: Wallet, roles: ["main_admin", "finance_manager"] },
  { to: "/reports/assets", label: "Asset Reports", icon: Boxes, roles: ["main_admin", "asset_admin"] },
  { to: "/reports/helpdesk", label: "Helpdesk Reports", icon: LifeBuoy, roles: ["main_admin", "helpdesk_agent", "asset_admin", "hr_admin", "finance_manager"] },
  { to: "/reports/audit", label: "Audit Reports", icon: ShieldCheck, roles: ["main_admin"] },
];

export function visibleCategoriesForRole(role: string | null) {
  if (!role) return [];
  return REPORT_CATEGORIES.filter((c) => c.roles.includes(role));
}

function ReportsLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = path === "/reports" || path === "/reports/";
  const current = REPORT_CATEGORIES.find((c) => path === c.to || path.startsWith(c.to + "/"));

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title={current?.label ?? "Reports"}
        description={
          isIndex
            ? "Curated, role-aware reports across people, projects, finance and IT."
            : "Filter, drill down and export role-specific data."
        }
        actions={
          !isIndex && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/reports"><ChevronLeft className="mr-1 h-4 w-4" /> Back to reports</Link>
            </Button>
          )
        }
      />
      {!isIndex && (
        <ModuleTabs tabs={visibleCategoriesForRole(activeRole ?? null).map((c) => ({ to: c.to, label: c.label, icon: c.icon }))} />
      )}
      <div className="pt-4 page-fade-in"><Outlet /></div>
    </>
  );
}
