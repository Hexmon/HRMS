import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, ActionButton, ModuleTabs, type ModuleTab } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { HELPDESK_AGENT_ROLES } from "@/lib/helpdesk-store";
import { RaiseTicketDrawer } from "@/components/helpdesk/raise-ticket-drawer";
import {
  LayoutDashboard,
  Inbox,
  Headphones,
  Timer,
  FolderTree,
  BarChart3,
  Plus,
} from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk")({ component: HelpdeskLayout });

function HelpdeskLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAgent = !!activeRole && (HELPDESK_AGENT_ROLES as readonly string[]).includes(activeRole);
  const isAdmin = activeRole === "main_admin";
  const [open, setOpen] = useState(false);

  const isDetail = /^\/helpdesk\/TKT-/.test(path);

  const TABS: (ModuleTab & { show: boolean })[] = [
    { to: "/helpdesk", label: "Dashboard", icon: LayoutDashboard, exact: true, show: true },
    { to: "/helpdesk/my", label: "My Tickets", icon: Inbox, show: true },
    { to: "/helpdesk/queue", label: "Agent Queue", icon: Headphones, show: isAgent },
    { to: "/helpdesk/sla", label: "SLA View", icon: Timer, show: isAgent },
    { to: "/helpdesk/categories", label: "Categories", icon: FolderTree, show: isAdmin },
    { to: "/helpdesk/reports", label: "Reports", icon: BarChart3, show: isAgent },
  ];

  const visible = TABS.filter((t) => t.show);

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Helpdesk"
        description="Raise, route and resolve tickets across IT, HR, Finance, Admin and project support — with SLAs."
        actions={
          <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Raise ticket
          </ActionButton>
        }
      />
      {!isDetail && <ModuleTabs tabs={visible} />}
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
      <RaiseTicketDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
