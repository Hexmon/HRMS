import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LEAVES, type LeaveRequest } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/leave")({
  component: LeavePage,
});

const balances = [
  { label: "Earned leave", value: "12 / 18" },
  { label: "Casual leave", value: "4 / 8" },
  { label: "Sick leave", value: "5 / 10" },
  { label: "WFH days", value: "Unlimited" },
];

const columns: Column<LeaveRequest>[] = [
  { key: "id", header: "Request", render: (r) => <span className="text-sm font-semibold">{r.id}</span> },
  { key: "employee", header: "Employee", render: (r) => <span className="text-sm">{r.employee}</span> },
  { key: "type", header: "Type", render: (r) => <span className="text-sm text-muted-foreground">{r.type}</span> },
  { key: "from", header: "From", render: (r) => <span className="text-sm tabular-nums">{r.from}</span> },
  { key: "to", header: "To", render: (r) => <span className="text-sm tabular-nums">{r.to}</span> },
  { key: "days", header: "Days", render: (r) => <span className="text-sm font-semibold tabular-nums">{r.days}</span> },
  { key: "approver", header: "Approver", render: (r) => <span className="text-sm text-muted-foreground">{r.approver}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function LeavePage() {
  return (
    <>
      <PageHeader
        title="Leave & WFH"
        description="Apply, track and manage time off and work-from-home requests."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="mr-1.5 h-4 w-4" /> New request
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {balances.map((b) => (
          <Card key={b.label} className="rounded-2xl border-border/60 p-4">
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{b.value}</p>
          </Card>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={LEAVES}
        searchKeys={["employee", "type", "id", "status"]}
        rowActions={(r) => [
          { label: "View timeline" },
          { label: "Approve", onClick: () => {} },
          { label: "Reject", tone: "destructive" },
        ]}
      />
    </>
  );
}
