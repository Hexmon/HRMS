import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/mock/roles";
import { LayoutDashboard, CalendarDays, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendanceLayout,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

const TABS = [
  { to: "/attendance", label: "Overview", icon: LayoutDashboard },
  { to: "/attendance/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/attendance/exceptions", label: "Exceptions", icon: AlertTriangle, adminOnly: true },
];

function AttendanceLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = TABS.filter((t) => !t.adminOnly || (activeRole && ADMIN_ROLES.includes(activeRole)));

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Attendance"
        description="Track punch-ins, work hours, exceptions and team-wide presence."
      />
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b pt-1">
        {visible.map((t) => {
          const active = t.to === "/attendance" ? path === "/attendance" : path === t.to || path.startsWith(t.to + "/");
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
      <div className="pt-2"><Outlet /></div>
    </>
  );
}
