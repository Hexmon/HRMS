import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs, type ModuleTab } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, UserCircle, FileText, FileSignature, BookOpen, Send, CheckSquare, Settings2,
} from "lucide-react";
import type { Role } from "@/lib/mock/roles";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_app/ems")({
  component: EmsLayout,
});

const APPROVER_ROLES: Role[] = ["manager", "project_manager", "hr_admin", "finance_manager", "main_admin", "asset_admin", "helpdesk_agent"];
const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

interface Tab { to: string; label: string; icon: LucideIcon; exact?: boolean; visible?: (r: Role | null) => boolean; }

const TABS: Tab[] = [
  { to: "/ems", label: "My space", icon: LayoutDashboard, exact: true },
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
  const visible: ModuleTab[] = TABS.filter((t) => !t.visible || t.visible(activeRole));

  return (
    <>
      <PageHeader
        eyebrow="Employee Self Service"
        title="My space"
        description="Your personal hub for profile, documents, requests and approvals."
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in"><Outlet /></div>
    </>
  );
}
