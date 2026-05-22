import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, Boxes, Laptop, Inbox, Undo2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/assets")({ component: AssetsLayout });

const TABS = [
  { to: "/assets", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/assets/inventory", label: "Inventory", icon: Boxes, gate: "admin" as const },
  { to: "/assets/my", label: "My Assets", icon: Laptop },
  { to: "/assets/requests", label: "Requests", icon: Inbox },
  { to: "/assets/returns", label: "Returns", icon: Undo2, gate: "admin" as const },
  {
    to: "/assets/warranty",
    label: "Warranty & Maintenance",
    icon: ShieldCheck,
    gate: "admin" as const,
  },
];

const ADMIN_ROLES = ["main_admin", "asset_admin", "hr_admin"];

function AssetsLayout() {
  const { activeRole } = useAuth();
  const isAdmin = !!activeRole && ADMIN_ROLES.includes(activeRole);
  const visible = TABS.filter((t) => !t.gate || (t.gate === "admin" && isAdmin));

  return (
    <>
      <PageHeader
        eyebrow="Assets"
        title="Asset Management"
        description="Track laptops, monitors, accessories, software licences and IT inventory across the workforce."
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
    </>
  );
}
