import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { TIMESHEETS, type TimesheetRow } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/timesheet")({
  component: TimesheetPage,
});

const columns: Column<TimesheetRow>[] = [
  { key: "id", header: "Entry", render: (r) => <span className="text-sm font-semibold">{r.id}</span> },
  { key: "employee", header: "Employee", render: (r) => <span className="text-sm">{r.employee}</span> },
  { key: "project", header: "Project", render: (r) => <span className="text-sm">{r.project}</span> },
  { key: "task", header: "Task", render: (r) => <span className="text-sm text-muted-foreground">{r.task}</span> },
  { key: "date", header: "Date", render: (r) => <span className="text-sm tabular-nums">{r.date}</span> },
  { key: "hours", header: "Hours", render: (r) => <span className="text-sm font-semibold tabular-nums">{r.hours.toFixed(1)}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function TimesheetPage() {
  return (
    <>
      <PageHeader
        title="Timesheet"
        description="Log time, submit weekly sheets and track approvals across projects."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="mr-1.5 h-4 w-4" /> Log time
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={TIMESHEETS}
        searchKeys={["employee", "project", "task", "id"]}
        rowActions={() => [{ label: "Edit entry" }, { label: "Submit" }, { label: "Delete", tone: "destructive" }]}
      />
    </>
  );
}
