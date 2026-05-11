import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useHelpdesk } from "@/lib/helpdesk-store";
import { computeSla, type Ticket } from "@/lib/mock/helpdesk";
import { inDateRange } from "@/lib/reports/utils";

export const Route = createFileRoute("/_app/reports/helpdesk")({ component: HelpdeskReports });

function HelpdeskReports() {
  const { tickets } = useHelpdesk();

  const filter = (rows: Ticket[], f: { from: string; to: string; department: string; employee: string; status: string }) =>
    rows.filter((t) => {
      if (!inDateRange(t.createdAt.slice(0, 10), f.from, f.to)) return false;
      if (f.department !== "all" && (t.raisedByDept ?? "") !== f.department) return false;
      if (f.employee !== "all" && t.raisedBy !== f.employee) return false;
      if (f.status !== "all" && t.status !== f.status) return false;
      return true;
    });

  const cols: Column<Ticket>[] = [
    { key: "id", header: "Ticket", render: (t) => <span className="font-mono text-xs">{t.id}</span> },
    { key: "subject", header: "Subject", render: (t) => <span className="font-medium">{t.subject}</span> },
    { key: "category", header: "Category", render: (t) => <span className="text-sm">{t.category}</span> },
    { key: "priority", header: "Priority", render: (t) => <span className="text-sm">{t.priority}</span> },
    { key: "raisedBy", header: "Requester", render: (t) => <span className="text-sm">{t.raisedBy}</span> },
    { key: "assignee", header: "Assignee", render: (t) => <span className="text-sm">{t.assignee ?? "—"}</span> },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    { key: "createdAt", header: "Created", render: (t) => <span className="font-mono text-xs">{t.createdAt.slice(0, 10)}</span> },
  ];

  const statusOptions = ["new", "assigned", "in_progress", "on_hold", "resolved", "closed", "reopened", "escalated"].map((s) => ({ value: s, label: s }));
  const employeePool = Array.from(new Set(tickets.map((t) => t.raisedBy)));

  const agentRows = useMemo(() => {
    const m = new Map<string, { total: number; resolved: number; sumH: number; resolvedCount: number }>();
    for (const t of tickets) {
      if (!t.assignee) continue;
      const cur = m.get(t.assignee) ?? { total: 0, resolved: 0, sumH: 0, resolvedCount: 0 };
      cur.total += 1;
      if (t.resolvedAt) {
        cur.resolved += 1;
        cur.sumH += (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
        cur.resolvedCount += 1;
      }
      m.set(t.assignee, cur);
    }
    return Array.from(m.entries()).map(([agent, v]) => ({
      id: agent, agent, total: v.total, resolved: v.resolved,
      avgH: v.resolvedCount ? Math.round((v.sumH / v.resolvedCount) * 10) / 10 : 0,
    }));
  }, [tickets]);

  const categoryRows = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return Array.from(m.entries()).map(([category, count]) => ({ id: category, category, count }));
  }, [tickets]);

  const employeeRows = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) m.set(t.raisedBy, (m.get(t.raisedBy) ?? 0) + 1);
    return Array.from(m.entries()).map(([employee, count]) => ({ id: employee, employee, count }));
  }, [tickets]);

  const resolutionRows = useMemo(() =>
    tickets.filter((t) => t.resolvedAt).map((t) => ({
      id: t.id, ticket: t.id, subject: t.subject, category: t.category, priority: t.priority,
      assignee: t.assignee ?? "—", hours: Math.round(((new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000) * 10) / 10,
    })), [tickets]);

  return (
    <Tabs defaultValue="open">
      <TabsList className="flex-wrap">
        <TabsTrigger value="open">Open Tickets</TabsTrigger>
        <TabsTrigger value="sla">SLA Breach</TabsTrigger>
        <TabsTrigger value="agent">Agent Performance</TabsTrigger>
        <TabsTrigger value="cat">Category-wise</TabsTrigger>
        <TabsTrigger value="emp">Employee-wise</TabsTrigger>
        <TabsTrigger value="res">Resolution Time</TabsTrigger>
      </TabsList>

      <TabsContent value="open" className="mt-4">
        <ReportShell title="Open Tickets" description="All tickets currently open." facets={{ showDepartment: true, showEmployee: true, showStatus: true, statusOptions, employeePool }}
          build={(f) => filter(tickets.filter((t) => !["closed", "resolved"].includes(t.status)), f)} columns={cols} searchKeys={["id", "subject", "raisedBy"]} exportName="open-tickets" />
      </TabsContent>

      <TabsContent value="sla" className="mt-4">
        <ReportShell title="SLA Breach Report" description="Open tickets that have breached SLA."
          build={(f) => filter(tickets.filter((t) => !["closed", "resolved"].includes(t.status) && computeSla(t).worst === "breached"), f)}
          columns={cols} searchKeys={["id", "subject"]} exportName="sla-breach" />
      </TabsContent>

      <TabsContent value="agent" className="mt-4">
        <ReportShell title="Agent Performance" description="Volume, resolutions and average resolution time."
          build={() => agentRows}
          columns={[
            { key: "agent", header: "Agent", render: (r) => <span className="font-medium">{r.agent}</span> },
            { key: "total", header: "Total", render: (r) => <span className="font-mono">{r.total}</span> },
            { key: "resolved", header: "Resolved", render: (r) => <span className="font-mono">{r.resolved}</span> },
            { key: "avgH", header: "Avg time (h)", render: (r) => <span className="font-mono">{r.avgH}</span> },
          ]}
          searchKeys={["agent"]} exportName="agent-performance" />
      </TabsContent>

      <TabsContent value="cat" className="mt-4">
        <ReportShell title="Category-wise Tickets" description="Volume grouped by category."
          build={() => categoryRows}
          columns={[
            { key: "category", header: "Category", render: (r) => <span className="font-medium">{r.category}</span> },
            { key: "count", header: "Tickets", render: (r) => <span className="font-mono">{r.count}</span> },
          ]}
          searchKeys={["category"]} exportName="category-tickets" />
      </TabsContent>

      <TabsContent value="emp" className="mt-4">
        <ReportShell title="Employee-wise Tickets" description="Volume by requester."
          build={() => employeeRows}
          columns={[
            { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employee}</span> },
            { key: "count", header: "Tickets", render: (r) => <span className="font-mono">{r.count}</span> },
          ]}
          searchKeys={["employee"]} exportName="employee-tickets" />
      </TabsContent>

      <TabsContent value="res" className="mt-4">
        <ReportShell title="Resolution Time Report" description="Time-to-resolve per ticket."
          build={() => resolutionRows}
          columns={[
            { key: "ticket", header: "Ticket", render: (r) => <span className="font-mono text-xs">{r.ticket}</span> },
            { key: "subject", header: "Subject", render: (r) => <span className="text-sm">{r.subject}</span> },
            { key: "category", header: "Category", render: (r) => <span className="text-sm">{r.category}</span> },
            { key: "priority", header: "Priority", render: (r) => <span className="text-sm">{r.priority}</span> },
            { key: "assignee", header: "Assignee", render: (r) => <span className="text-sm">{r.assignee}</span> },
            { key: "hours", header: "Hours", render: (r) => <span className="font-mono">{r.hours}</span> },
          ]}
          searchKeys={["ticket", "subject"]} exportName="resolution-time" />
      </TabsContent>
    </Tabs>
  );
}
