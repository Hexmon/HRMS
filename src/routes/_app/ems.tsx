import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, UserCircle, FileText, FileSignature, BookOpen, Send, CheckSquare, Settings2,
} from "lucide-react";
import type { Role } from "@/lib/mock/roles";

export const Route = createFileRoute("/_app/ems")({
  component: EmsLayout,
});

const APPROVER_ROLES: Role[] = ["manager", "project_manager", "hr_admin", "finance_manager", "main_admin", "asset_admin", "helpdesk_agent"];
const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

interface Tab { to: string; label: string; icon: any; visible?: (r: Role | null) => boolean; }

const TABS: Tab[] = [
  { to: "/ems", label: "My space", icon: LayoutDashboard },
  { to: "/ems/profile", label: "My profile", icon: UserCircle },
  { to: "/ems/documents", label: "Documents", icon: FileText },
  { to: "/ems/letters", label: "Letters", icon: FileSignature },
  { to: "/ems/policies", label: "Policies", icon: BookOpen },
  { to: "/ems/requests", label: "My requests", icon: Send },
  { to: "/ems/approvals", label: "My approvals", icon: CheckSquare, visible: (r) => !!r && APPROVER_ROLES.includes(r) },
  { to: "/ems/admin", label: "EMS management", icon: Settings2, visible: (r) => !!r && ADMIN_ROLES.includes(r) },
];

function EmsLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = TABS.filter((t) => !t.visible || t.visible(activeRole));

  return (
    <>
      <PageHeader
        eyebrow="Employee Self Service"
        title="My space"
        description="Your personal hub for profile, documents, requests and approvals."
      />

      <div className="-mx-1 flex gap-1 overflow-x-auto border-b pb-0 pt-1">
        {visible.map((t) => {
          const active = t.to === "/ems" ? path === "/ems" : path === t.to || path.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-t-xl border-b-2 px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
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
