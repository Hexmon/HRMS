import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, ActionButton } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { HELPDESK_AGENT_ROLES } from "@/lib/helpdesk-store";
import { cn } from "@/lib/utils";
import { RaiseTicketDrawer } from "@/components/helpdesk/raise-ticket-drawer";
import {
  LayoutDashboard, Inbox, Headphones, Timer, FolderTree, BarChart3, Plus,
} from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk")({ component: HelpdeskLayout });

function HelpdeskLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAgent = !!activeRole && (HELPDESK_AGENT_ROLES as readonly string[]).includes(activeRole);
  const isAdmin = activeRole === "main_admin";
  const [open, setOpen] = useState(false);

  // Don't render layout chrome on the detail page — that page owns its own header.
  if (/^\/helpdesk\/[^/]+$/.test(path) && !["/helpdesk/queue", "/helpdesk/sla", "/helpdesk/categories", "/helpdesk/reports", "/helpdesk/my"].includes(path)) {
    return <Outlet />;
  }

  const TABS = [
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
              <t.icon className="h-4 w-4" />{t.label}
            </Link>
          );
        })}
      </div>
      <div className="pt-2"><Outlet /></div>
      <RaiseTicketDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
