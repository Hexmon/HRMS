import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useHelpdesk } from "@/lib/helpdesk-store";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import { SlaBadge, PriorityBadge } from "@/components/helpdesk/badges";
import { fmtRelative } from "@/lib/mock/helpdesk";
import type { Ticket } from "@/lib/mock/helpdesk";

export const Route = createFileRoute("/_app/helpdesk/my")({ component: MyTicketsScreen });

function MyTicketsScreen() {
  const { user } = useAuth();
  const { tickets } = useHelpdesk();
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      tickets
        .filter((t) => t.raisedBy === user?.name)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [tickets, user],
  );

  const cols: Column<Ticket>[] = [
    {
      key: "id",
      header: "Ticket",
      render: (t) => (
        <button
          onClick={() => navigate({ to: "/helpdesk/$id", params: { id: t.id } })}
          className="text-left"
        >
          <p className="font-mono text-xs font-semibold text-primary">{t.id}</p>
          <p className="mt-0.5 truncate text-sm font-medium">{t.subject}</p>
        </button>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (t) => <span className="text-sm">{t.category}</span>,
    },
    { key: "priority", header: "Priority", render: (t) => <PriorityBadge priority={t.priority} /> },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "assignee",
      header: "Assigned",
      render: (t) => <span className="text-sm">{t.assignee ?? "—"}</span>,
    },
    { key: "sla", header: "SLA", render: (t) => <SlaBadge ticket={t} /> },
    {
      key: "created",
      header: "Created",
      render: (t) => (
        <span className="text-xs text-muted-foreground">{fmtRelative(t.createdAt)}</span>
      ),
    },
    {
      key: "updated",
      header: "Last update",
      render: (t) => (
        <span className="text-xs text-muted-foreground">{fmtRelative(t.updatedAt)}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={cols}
      rows={rows}
      searchKeys={["subject", "id", "category", "assignee"] as (keyof Ticket)[]}
      emptyTitle="You haven't raised any tickets"
      emptyDescription="Use the Raise ticket button up top to get started."
      rowActions={(t) => [
        {
          label: "Open ticket",
          onClick: () => navigate({ to: "/helpdesk/$id", params: { id: t.id } }),
        },
      ]}
    />
  );
}
