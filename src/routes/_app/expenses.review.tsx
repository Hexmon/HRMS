import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useExpenses, fmtCurrency, ticketTotal, type ExpenseTicket } from "@/lib/expenses-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/expenses/review")({
  component: ManagerVerificationQueue,
});

const cols: Column<ExpenseTicket>[] = [
  {
    key: "id",
    header: "Ticket",
    render: (r) => (
      <Link
        to="/expenses/$id"
        params={{ id: r.id }}
        className="font-medium text-primary hover:underline"
      >
        {r.id}
      </Link>
    ),
  },
  {
    key: "emp",
    header: "Requester",
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.employee}</p>
        <p className="text-xs text-muted-foreground">{r.department}</p>
      </div>
    ),
  },
  { key: "title", header: "Task", render: (r) => <span className="text-sm">{r.taskTitle}</span> },
  {
    key: "amount",
    header: "Amount",
    render: (r) => <span className="font-semibold">{fmtCurrency(ticketTotal(r))}</span>,
  },
  {
    key: "pay",
    header: "Payment",
    render: (r) => <span className="text-xs capitalize">{r.paymentType}</span>,
  },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function ManagerVerificationQueue() {
  const { tickets, loading, error } = useExpenses();
  const groups = useMemo(
    () => ({
      pending: tickets.filter((t) => t.status === "pending_manager"),
      approved: tickets.filter(
        (t) =>
          t.approvals.some((a) => a.role === "Manager" && a.status === "approved") &&
          t.status !== "manager_returned",
      ),
      returned: tickets.filter((t) => t.status === "manager_returned"),
      rejected: tickets.filter((t) => t.status === "manager_rejected"),
    }),
    [tickets],
  );

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">
          Pending manager verification ({groups.pending.length})
        </TabsTrigger>
        <TabsTrigger value="approved">Manager verified ({groups.approved.length})</TabsTrigger>
        <TabsTrigger value="returned">Returned ({groups.returned.length})</TabsTrigger>
        <TabsTrigger value="rejected">Rejected ({groups.rejected.length})</TabsTrigger>
      </TabsList>
      {(["pending", "approved", "returned", "rejected"] as const).map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <DataTable
            columns={cols}
            rows={groups[k]}
            searchKeys={["id", "employee", "taskTitle"]}
            emptyTitle="Queue clear"
            emptyDescription={
              error
                ? "Expense queue data could not be loaded from the backend."
                : "No tickets in this state."
            }
            loading={loading}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
