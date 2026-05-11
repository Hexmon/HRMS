import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
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
  { to: "/leave-wfh", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leave-wfh/apply-leave", label: "Apply leave", icon: CalendarPlus },
  { to: "/leave-wfh/apply-wfh", label: "Apply WFH", icon: Home },
  { to: "/leave-wfh/approvals", label: "Approvals", icon: CheckSquare, gate: "approver" as const },
  { to: "/leave-wfh/monitor", label: "Monitor", icon: Eye, gate: "admin" as const },
  { to: "/leave-wfh/holidays", label: "Holidays", icon: CalendarDays },
];

function LeaveLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
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
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b pt-1">
        {visible.map((t) => {
          const active = t.to === "/leave-wfh" ? path === "/leave-wfh" : path === t.to || path.startsWith(t.to + "/");
          return (
            <Link key={t.to} to={t.to}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-t-xl border-b-2 px-3 py-2.5 text-sm font-medium transition",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />{t.label}
            </Link>
          );
        })}
      </div>
      <div className="pt-2"><Outlet /></div>
    </>
  );
}
