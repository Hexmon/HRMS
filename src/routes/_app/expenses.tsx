import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  REVIEWER_ROLES, DIRECTOR_ROLES, FINANCE_ROLES, ADMIN_ROLES,
} from "@/lib/expenses-store";
import {
  LayoutDashboard, Receipt, Plus, ClipboardCheck, Crown, Wallet,
  BookOpen, BarChart3, Users2,
} from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({ component: ExpensesLayout });

const TABS = [
  { to: "/expenses", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/expenses/my", label: "My Expenses", icon: Receipt },
  { to: "/expenses/create", label: "Create Ticket", icon: Plus },
  { to: "/expenses/review", label: "Reviewer Queue", icon: ClipboardCheck, gate: "reviewer" as const },
  { to: "/expenses/director", label: "Director Approval", icon: Crown, gate: "director" as const },
  { to: "/expenses/finance", label: "Finance Queue", icon: Wallet, gate: "finance" as const },
  { to: "/expenses/register", label: "Register", icon: BookOpen, gate: "admin" as const },
  { to: "/expenses/reports", label: "Reports", icon: BarChart3, gate: "admin" as const },
  { to: "/expenses/mapping", label: "Reviewer Mapping", icon: Users2, gate: "director" as const },
];

function ExpensesLayout() {
  const { activeRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = TABS.filter((t) => {
    if (!t.gate) return true;
    if (!activeRole) return false;
    if (t.gate === "reviewer") return REVIEWER_ROLES.includes(activeRole);
    if (t.gate === "director") return DIRECTOR_ROLES.includes(activeRole);
    if (t.gate === "finance") return FINANCE_ROLES.includes(activeRole);
    if (t.gate === "admin") return ADMIN_ROLES.includes(activeRole);
    return false;
  });

  return (
    <>
      <PageHeader
        eyebrow="Expense Management"
        title="Expenses"
        description="Submit, review and settle project, sales and reimbursement expenses end-to-end."
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
