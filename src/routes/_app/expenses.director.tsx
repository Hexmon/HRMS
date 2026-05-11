import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useExpenses, fmtCurrency, ticketTotal, HIGH_VALUE_THRESHOLD, type ExpenseTicket } from "@/lib/expenses-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/expenses/director")({ component: DirectorQueue });

const cols: Column<ExpenseTicket>[] = [
  { key: "id", header: "Ticket", render: (r) => (
    <div className="flex items-center gap-2">
      <Link to="/expenses/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline">{r.id}</Link>
      {ticketTotal(r) >= HIGH_VALUE_THRESHOLD && (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
          <AlertTriangle className="h-3 w-3" /> High value
        </span>
      )}
    </div>
  ) },
  { key: "emp", header: "Requester", render: (r) => <div><p className="text-sm font-medium">{r.employee}</p><p className="text-xs text-muted-foreground">{r.department}</p></div> },
  { key: "title", header: "Task", render: (r) => <span className="text-sm">{r.taskTitle}</span> },
  { key: "rev", header: "Reviewer", render: (r) => <span className="text-xs">{r.reviewer}</span> },
  { key: "amount", header: "Amount", render: (r) => <span className="font-semibold">{fmtCurrency(ticketTotal(r))}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function DirectorQueue() {
  const { tickets } = useExpenses();
  const groups = useMemo(() => ({
    pending: tickets.filter((t) => t.status === "pending_director"),
    approved: tickets.filter((t) => t.approvals.some((a) => a.role === "Director" && a.status === "approved")),
    returned: tickets.filter((t) => t.status === "director_returned"),
    rejected: tickets.filter((t) => t.status === "director_rejected"),
  }), [tickets]);
  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">Pending final approval ({groups.pending.length})</TabsTrigger>
        <TabsTrigger value="approved">Approved ({groups.approved.length})</TabsTrigger>
        <TabsTrigger value="returned">Returned ({groups.returned.length})</TabsTrigger>
        <TabsTrigger value="rejected">Rejected ({groups.rejected.length})</TabsTrigger>
      </TabsList>
      {(["pending", "approved", "returned", "rejected"] as const).map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <DataTable columns={cols} rows={groups[k]} searchKeys={["id", "employee", "taskTitle"]} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
