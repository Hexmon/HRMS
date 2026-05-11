import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/mock/roles";
import { LayoutDashboard, FileCheck2, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_app/timesheet")({
  component: TimesheetLayout,
});

const APPROVER_ROLES: Role[] = ["manager", "main_admin", "hr_admin", "project_manager"];
const PM_ROLES: Role[] = ["project_manager", "main_admin"];

const TABS = [
  { to: "/timesheet", label: "My timesheet", icon: LayoutDashboard, exact: true },
  { to: "/timesheet/approvals", label: "Approvals", icon: FileCheck2, roles: APPROVER_ROLES },
  { to: "/timesheet/projects", label: "Project view", icon: Briefcase, roles: PM_ROLES },
];

function TimesheetLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = TABS.filter((t) => !t.roles || (activeRole && t.roles.includes(activeRole)));

  return (
    <>
      <PageHeader
        eyebrow="Time"
        title="Timesheet"
        description="Log time against projects, submit weekly, and approve at speed."
      />
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b pt-1">
        {visible.map((t) => {
          const active = t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-t-xl border-b-2 px-3 py-2.5 text-sm font-medium transition",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="pt-2">
        <Outlet />
      </div>
    </>
  );
}
