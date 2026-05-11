import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import {
  LayoutDashboard, CalendarPlus, Home, CheckSquare, Eye, CalendarDays,
} from "lucide-react";

export const Route = createFileRoute("/_app/leave-wfh")({
  component: LeaveLayout,
});

const APPROVER: Role[] = ["manager", "project_manager", "hr_admin", "main_admin"];
const ADMIN: Role[] = ["hr_admin", "main_admin"];

const TABS = [
  { to: "/leave-wfh", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/leave-wfh/apply-leave", label: "Apply leave", icon: CalendarPlus },
  { to: "/leave-wfh/apply-wfh", label: "Apply WFH", icon: Home },
  { to: "/leave-wfh/approvals", label: "Approvals", icon: CheckSquare, gate: "approver" as const },
  { to: "/leave-wfh/monitor", label: "Monitor", icon: Eye, gate: "admin" as const },
  { to: "/leave-wfh/holidays", label: "Holidays", icon: CalendarDays },
];

function LeaveLayout() {
  const { activeRole } = useAuth();
  const visible = TABS.filter((t) => {
    if (t.gate === "approver") return activeRole && APPROVER.includes(activeRole);
    if (t.gate === "admin") return activeRole && ADMIN.includes(activeRole);
    return true;
  });

  return (
    <>
      <PageHeader
        eyebrow="Leave & Work from Home"
        title="Leave & WFH"
        description="Apply, track and approve time-off and work-from-home requests."
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in"><Outlet /></div>
    </>
  );
}
