import { createFileRoute, Link, Outlet, useRouterState, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Database, ShieldCheck, GitBranch, FileText,
  Mail, BellRing, Lock, ScrollText,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("hawkaii_session");
      const role = raw ? (JSON.parse(raw).activeRole as string | null) : null;
      if (role && role !== "main_admin" && role !== "hr_admin") {
        throw redirect({ to: "/dashboard" });
      }
    } catch (e) {
      if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
    }
  },
  component: AdminSettingsLayout,
});

interface Tab { to: string; label: string; icon: typeof LayoutDashboard; mainOnly?: boolean }

const TABS: Tab[] = [
  { to: "/admin-settings", label: "Overview", icon: LayoutDashboard },
  { to: "/admin-settings/company", label: "Company", icon: Building2 },
  { to: "/admin-settings/master-data", label: "Master Data", icon: Database },
  { to: "/admin-settings/roles", label: "Roles & Permissions", icon: ShieldCheck, mainOnly: true },
  { to: "/admin-settings/workflows", label: "Approval Workflows", icon: GitBranch, mainOnly: true },
  { to: "/admin-settings/policies", label: "Policies", icon: FileText },
  { to: "/admin-settings/email-templates", label: "Email Templates", icon: Mail },
  { to: "/admin-settings/notifications", label: "Notifications", icon: BellRing },
  { to: "/admin-settings/security", label: "Security", icon: Lock, mainOnly: true },
  { to: "/admin-settings/audit", label: "Audit Logs", icon: ScrollText, mainOnly: true },
];

function AdminSettingsLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isMain = activeRole === "main_admin";

  const visible = TABS.filter((t) => isMain || !t.mainOnly);

  const isExact = (to: string) => path === to || path === to + "/";
  const isActive = (to: string) =>
    to === "/admin-settings" ? isExact(to) : path === to || path.startsWith(to + "/");

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Admin Settings"
        description={
          isMain
            ? "Configure your company, master data, RBAC, approval workflows, policies and security."
            : "Manage HR-related configuration: master data, policies, templates and notifications."
        }
      />
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b pt-1">
        {visible.map((t) => {
          const active = isActive(t.to);
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
      <div className="pt-4"><Outlet /></div>
    </>
  );
}
