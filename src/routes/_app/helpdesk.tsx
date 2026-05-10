import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { TICKETS, type Ticket } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk")({
  component: HelpdeskPage,
});

const priorityCls: Record<Ticket["priority"], string> = {
  Low: "bg-muted text-muted-foreground",
  Medium: "bg-info/15 text-info",
  High: "bg-warning/15 text-warning-foreground",
  Critical: "bg-destructive/15 text-destructive",
};

const columns: Column<Ticket>[] = [
  { key: "id", header: "Ticket", render: (r) => <span className="text-sm font-semibold">{r.id}</span> },
  { key: "title", header: "Subject", render: (r) => <div><p className="text-sm font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.category}</p></div> },
  { key: "raisedBy", header: "Raised by", render: (r) => <span className="text-sm">{r.raisedBy}</span> },
  { key: "assignee", header: "Assignee", render: (r) => <span className="text-sm">{r.assignee}</span> },
  { key: "priority", header: "Priority", render: (r) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityCls[r.priority]}`}>{r.priority}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "createdAt", header: "Created", render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.createdAt}</span> },
];

function HelpdeskPage() {
  return (
    <>
      <PageHeader
        title="Helpdesk"
        description="Raise IT, HR, finance and facilities tickets — track resolution and SLAs."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="mr-1.5 h-4 w-4" /> New ticket
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={TICKETS}
        searchKeys={["title", "raisedBy", "assignee", "id", "category"]}
        rowActions={() => [{ label: "Open" }, { label: "Reassign" }, { label: "Close", tone: "destructive" }]}
      />
    </>
  );
}
