import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader, ModuleTabs, type ModuleTab } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { MANAGER_ROLES, FINANCE_ROLES, ADMIN_ROLES } from "@/lib/expenses-store";
import type { Role } from "@/lib/mock/roles";
import {
  LayoutDashboard,
  Receipt,
  Plus,
  ClipboardCheck,
  Wallet,
  BookOpen,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({ component: ExpensesLayout });

const TABS = [
  { to: "/expenses", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/expenses/my", label: "My Expenses", icon: Receipt },
  { to: "/expenses/create", label: "Create Ticket", icon: Plus },
  {
    to: "/expenses/review",
    label: "Expense Approvals",
    icon: ClipboardCheck,
    gate: "manager" as const,
  },
  { to: "/expenses/finance", label: "Finance Queue", icon: Wallet, gate: "finance" as const },
  { to: "/expenses/register", label: "Register", icon: BookOpen, gate: "admin" as const },
  { to: "/expenses/reports", label: "Reports", icon: BarChart3, gate: "admin" as const },
];

function hasExpenseTabAccess(
  roles: readonly Role[] | null | undefined,
  activeRole: Role | null,
  allowedRoles: readonly Role[],
) {
  return Boolean(
    (activeRole && allowedRoles.includes(activeRole)) ||
    roles?.some((role) => allowedRoles.includes(role)),
  );
}

function ExpensesLayout() {
  const { activeRole, user } = useAuth();
  const visible: ModuleTab[] = TABS.filter((t) => {
    if (!t.gate) return true;
    if (t.gate === "manager") return hasExpenseTabAccess(user?.roles, activeRole, MANAGER_ROLES);
    if (t.gate === "finance") return hasExpenseTabAccess(user?.roles, activeRole, FINANCE_ROLES);
    if (t.gate === "admin") return hasExpenseTabAccess(user?.roles, activeRole, ADMIN_ROLES);
    return false;
  });

  return (
    <>
      <PageHeader
        eyebrow="Expense Management"
        title="Expenses"
        description="Submit, review and settle project, sales and reimbursement expenses end-to-end."
      />
      <ModuleTabs tabs={visible} />
      <div className="pt-4 page-fade-in">
        <Outlet />
      </div>
    </>
  );
}
