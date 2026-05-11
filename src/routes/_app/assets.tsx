import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Boxes, Laptop, Inbox, Undo2, ShieldCheck, UserCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/assets")({ component: AssetsLayout });

const TABS = [
  { to: "/assets", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/assets/inventory", label: "Inventory", icon: Boxes, gate: "admin" as const },
  { to: "/assets/my", label: "My Assets", icon: Laptop },
  { to: "/assets/requests", label: "Requests", icon: Inbox },
  { to: "/assets/returns", label: "Returns", icon: Undo2, gate: "admin" as const },
  { to: "/assets/warranty", label: "Warranty & Maintenance", icon: ShieldCheck, gate: "admin" as const },
];

const ADMIN_ROLES = ["main_admin", "asset_admin", "hr_admin"];

function AssetsLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = !!activeRole && ADMIN_ROLES.includes(activeRole);
  const visible = TABS.filter((t) => !t.gate || (t.gate === "admin" && isAdmin));

  return (
    <>
      <PageHeader
        eyebrow="Assets"
        title="Asset Management"
        description="Track laptops, monitors, accessories, software licences and IT inventory across the workforce."
      />
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b pt-1">
        {visible.map((t) => {
          const active = t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
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

// placeholder reference to silence unused import
const _ = UserCircle;
