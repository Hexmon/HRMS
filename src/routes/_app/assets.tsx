import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ASSETS, type Asset } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/assets")({
  component: AssetsPage,
});

const columns: Column<Asset>[] = [
  { key: "id", header: "Asset ID", render: (r) => <span className="text-sm font-semibold">{r.id}</span> },
  { key: "name", header: "Name", render: (r) => <span className="text-sm">{r.name}</span> },
  { key: "category", header: "Category", render: (r) => <span className="text-sm text-muted-foreground">{r.category}</span> },
  { key: "serial", header: "Serial", render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.serial}</span> },
  { key: "assignedTo", header: "Assigned to", render: (r) => <span className="text-sm">{r.assignedTo}</span> },
  { key: "assignedOn", header: "Since", render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.assignedOn}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function AssetsPage() {
  return (
    <>
      <PageHeader
        title="Assets"
        description="Track and assign hardware, peripherals and IT inventory."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="mr-1.5 h-4 w-4" /> Register asset
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={ASSETS}
        searchKeys={["name", "serial", "assignedTo", "category"]}
        rowActions={() => [{ label: "Reassign" }, { label: "Mark for repair" }, { label: "Retire", tone: "destructive" }]}
      />
    </>
  );
}
