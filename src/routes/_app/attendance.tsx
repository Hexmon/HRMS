import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { LayoutDashboard, CalendarDays, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendanceLayout,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

const TABS = [
  { to: "/attendance", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/attendance/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/attendance/exceptions", label: "Exceptions", icon: AlertTriangle, adminOnly: true },
];

function AttendanceLayout() {
  const { activeRole } = useAuth();
  const visible = TABS.filter(
    (t) => !t.adminOnly || (activeRole && ADMIN_ROLES.includes(activeRole)),
  );

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Attendance"
        description="Track punch-ins, work hours, exceptions and team-wide presence."
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
    </>
  );
}
