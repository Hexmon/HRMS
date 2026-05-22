import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useExpenses, fmtCurrency, ticketTotal, type ExpenseTicket } from "@/lib/expenses-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/expenses/finance")({ component: FinanceQueue });

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

function FinanceQueue() {
  const { tickets } = useExpenses();
  const groups = useMemo(
    () => ({
      verify: tickets.filter((t) => t.status === "finance_verification"),
      pay: tickets.filter((t) => t.status === "finance_verified"),
      settle: tickets.filter((t) =>
        ["payment_released", "bills_submitted", "settlement_review", "pending_adjustment"].includes(
          t.status,
        ),
      ),
      closed: tickets.filter((t) => t.status === "closed"),
      hold: tickets.filter((t) => t.status === "finance_hold"),
    }),
    [tickets],
  );
  return (
    <Tabs defaultValue="verify">
      <TabsList>
        <TabsTrigger value="verify">Verification ({groups.verify.length})</TabsTrigger>
        <TabsTrigger value="pay">Payment ({groups.pay.length})</TabsTrigger>
        <TabsTrigger value="settle">Settlement ({groups.settle.length})</TabsTrigger>
        <TabsTrigger value="hold">On Hold ({groups.hold.length})</TabsTrigger>
        <TabsTrigger value="closed">Closed ({groups.closed.length})</TabsTrigger>
      </TabsList>
      {(["verify", "pay", "settle", "hold", "closed"] as const).map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <DataTable columns={cols} rows={groups[k]} searchKeys={["id", "employee", "taskTitle"]} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
