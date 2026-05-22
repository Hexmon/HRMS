import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui-kit";
import { useAdminSettings } from "@/lib/admin-settings-store";
import type { AuditLogEntry } from "@/lib/mock/audit-logs";

export const Route = createFileRoute("/_app/admin-settings/audit")({ component: AuditScreen });

function AuditScreen() {
  const { audit } = useAdminSettings();

  const cols: Column<AuditLogEntry>[] = [
    {
      key: "at",
      header: "Timestamp",
      render: (r) => <span className="font-mono text-xs">{r.at}</span>,
    },
    {
      key: "actor",
      header: "Actor",
      render: (r) => <span className="text-sm font-medium">{r.actor}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (r) => <span className="font-mono text-xs">{r.action}</span>,
    },
    {
      key: "target",
      header: "Entity / Change",
      render: (r) => <span className="text-sm">{r.target}</span>,
    },
    {
      key: "module",
      header: "Module",
      render: (r) => (
        <Badge variant="outline" className="text-[10px]">
          {r.module}
        </Badge>
      ),
    },
    {
      key: "ip",
      header: "IP / Device",
      render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.ip}</span>,
    },
  ];

  return (
    <Card className="rounded-2xl border-border/60 p-0">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <p className="text-sm font-semibold">Audit log</p>
          <p className="text-xs text-muted-foreground">
            Append-only record of admin and workflow actions across the workspace.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {audit.length} entries
        </Badge>
      </div>
      <DataTable
        columns={cols}
        rows={audit}
        searchKeys={["actor", "action", "target", "module", "ip"]}
        emptyTitle="No audit entries yet"
      />
    </Card>
  );
}
