import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useExpenses, fmtCurrency, ticketTotal } from "@/lib/expenses-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { ExpenseTicket } from "@/lib/expenses-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/expenses/my")({ component: MyExpenses });

function MyExpenses() {
  const { user } = useAuth();
  const { tickets, withdraw } = useExpenses();
  const nav = useNavigate();
  const me = user?.name ?? "You";
  const rows = useMemo(() => tickets.filter((t) => t.employee === me || t.employeeId === "self"), [tickets, me]);

  const cols: Column<ExpenseTicket>[] = [
    { key: "id", header: "Ticket", render: (r) => <Link to="/expenses/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline">{r.id}</Link> },
    { key: "type", header: "Type", render: (r) => <span className="text-xs text-muted-foreground">{r.expenseType === "project" ? "Project" : "Sales / Pre-sales"} · {r.subType}</span> },
    { key: "title", header: "Task", render: (r) => <span className="text-sm font-medium">{r.taskTitle}</span> },
    { key: "amount", header: "Amount", render: (r) => <span className="font-semibold">{fmtCurrency(ticketTotal(r))}</span> },
    { key: "pay", header: "Payment Type", render: (r) => <span className="text-xs capitalize">{r.paymentType}</span> },
    { key: "stage", header: "Stage", render: (r) => <span className="text-xs capitalize text-muted-foreground">{r.stage}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "submitted", header: "Submitted", render: (r) => <span className="text-xs text-muted-foreground">{r.submittedAt?.slice(0, 10) ?? "—"}</span> },
  ];

  return (
    <DataTable
      columns={cols}
      rows={rows}
      searchKeys={["id", "taskTitle", "subType"]}
      emptyTitle="No expenses yet"
      emptyDescription="Create your first expense ticket to get started."
      toolbarRight={
        <Button onClick={() => nav({ to: "/expenses/create" })} className="rounded-full"><Plus className="mr-1 h-4 w-4" /> New Expense</Button>
      }
      rowActions={(r) => [
        { label: "View", onClick: () => nav({ to: "/expenses/$id", params: { id: r.id } }) },
        ...(r.status === "draft" ? [{ label: "Edit draft", onClick: () => nav({ to: "/expenses/create" }) }] : []),
        ...(["pending_reviewer", "pending_director", "draft"].includes(r.status)
          ? [{ label: "Withdraw", tone: "destructive" as const, onClick: () => { withdraw(r.id, me); toast.success("Ticket withdrawn"); } }]
          : []),
        { label: "Clone", onClick: () => { toast.success("Cloned to draft"); } },
        { label: "Download summary", onClick: () => toast.message("Download started") },
      ]}
    />
  );
}
