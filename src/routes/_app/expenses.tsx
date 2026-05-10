import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EXPENSES, type Expense } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

const columns: Column<Expense>[] = [
  { key: "id", header: "Claim", render: (r) => <span className="text-sm font-semibold">{r.id}</span> },
  { key: "employee", header: "Employee", render: (r) => <span className="text-sm">{r.employee}</span> },
  { key: "category", header: "Category", render: (r) => <span className="text-sm text-muted-foreground">{r.category}</span> },
  { key: "amount", header: "Amount", render: (r) => <span className="text-sm font-semibold tabular-nums">{r.currency} {r.amount.toFixed(2)}</span> },
  { key: "date", header: "Date", render: (r) => <span className="text-sm tabular-nums">{r.date}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Submit claims, track approvals and process reimbursements."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="mr-1.5 h-4 w-4" /> New claim
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl p-4"><p className="text-xs text-muted-foreground">Pending approval</p><p className="mt-1 text-2xl font-semibold">USD 1,284.00</p></Card>
        <Card className="rounded-2xl p-4"><p className="text-xs text-muted-foreground">Approved this month</p><p className="mt-1 text-2xl font-semibold">USD 18,742.50</p></Card>
        <Card className="rounded-2xl p-4"><p className="text-xs text-muted-foreground">Paid YTD</p><p className="mt-1 text-2xl font-semibold">USD 142,901.00</p></Card>
      </div>
      <DataTable
        columns={columns}
        rows={EXPENSES}
        searchKeys={["employee", "category", "id"]}
        rowActions={() => [{ label: "View receipts" }, { label: "Approve" }, { label: "Reject", tone: "destructive" }]}
      />
    </>
  );
}
