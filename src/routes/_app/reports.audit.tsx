import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { type Column } from "@/components/ui-kit";
import { useEmployees } from "@/lib/employees-store";
import { useExpenses } from "@/lib/expenses-store";
import { useAssets } from "@/lib/assets-store";
import { AUDIT_LOGS, type AuditLogEntry } from "@/lib/mock/audit-logs";
import { inDateRange } from "@/lib/reports/utils";

export const Route = createFileRoute("/_app/reports/audit")({ component: AuditReports });

interface FlatAudit { id: string; at: string; actor: string; action: string; module: string; target: string; remarks?: string; }

function AuditReports() {
  const { employees } = useEmployees();
  const { tickets } = useExpenses();
  const { assets } = useAssets();

  const profileChanges: FlatAudit[] = useMemo(() => employees.flatMap((e) =>
    e.audit.map((a) => ({ id: e.id + "-" + a.id, at: a.at, actor: a.actor, action: a.action, module: "Employees", target: e.name, remarks: a.remarks }))
  ), [employees]);

  const roleChanges: FlatAudit[] = useMemo(() => employees.flatMap((e) =>
    e.roleHistory.map((rh, i) => ({ id: e.id + "-r-" + i, at: rh.at, actor: rh.actor, action: `Role: ${rh.from.join(",") || "—"} → ${rh.to.join(",")}`, module: "Roles", target: e.name, remarks: rh.remarks }))
  ), [employees]);

  const approvalEvents: FlatAudit[] = useMemo(() => tickets.flatMap((t) =>
    t.approvals.map((a, i) => ({ id: t.id + "-a-" + i, at: a.at, actor: a.by, action: `${a.action} (${a.status})`, module: "Approvals", target: t.id, remarks: a.remark }))
  ), [tickets]);

  const expenseAudit: FlatAudit[] = useMemo(() => tickets.flatMap((t) =>
    t.audit.map((a, i) => ({ id: t.id + "-au-" + i, at: a.at, actor: a.by, action: a.what, module: "Expenses", target: t.id }))
  ), [tickets]);

  const assetAudit: FlatAudit[] = useMemo(() => assets.flatMap((a) =>
    a.audit.map((x) => ({ id: a.id + "-" + x.id, at: x.at, actor: x.actor, action: x.action, module: "Assets", target: a.id, remarks: x.remarks }))
  ), [assets]);

  const filter = (rows: FlatAudit[], f: { from: string; to: string }) =>
    rows.filter((r) => inDateRange(r.at.slice(0, 10), f.from, f.to))
      .sort((a, b) => (a.at < b.at ? 1 : -1));

  const cols: Column<FlatAudit>[] = [
    { key: "at", header: "When", render: (r) => <span className="font-mono text-xs">{r.at.slice(0, 16).replace("T", " ")}</span> },
    { key: "actor", header: "Actor", render: (r) => <span className="font-medium">{r.actor}</span> },
    { key: "action", header: "Action", render: (r) => <span className="text-sm">{r.action}</span> },
    { key: "module", header: "Module", render: (r) => <span className="text-sm">{r.module}</span> },
    { key: "target", header: "Target", render: (r) => <span className="font-mono text-xs">{r.target}</span> },
    { key: "remarks", header: "Remarks", render: (r) => <span className="text-xs text-muted-foreground">{r.remarks ?? "—"}</span> },
  ];

  const loginCols: Column<AuditLogEntry>[] = [
    { key: "at", header: "When", render: (r) => <span className="font-mono text-xs">{r.at}</span> },
    { key: "actor", header: "User", render: (r) => <span className="font-medium">{r.actor}</span> },
    { key: "action", header: "Action", render: (r) => <span className="text-sm">{r.action}</span> },
    { key: "module", header: "Module", render: (r) => <span className="text-sm">{r.module}</span> },
    { key: "target", header: "Target", render: (r) => <span className="font-mono text-xs">{r.target}</span> },
    { key: "ip", header: "IP", render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
  ];

  return (
    <Tabs defaultValue="login">
      <TabsList className="flex-wrap">
        <TabsTrigger value="login">Login Audit</TabsTrigger>
        <TabsTrigger value="role">Role Change</TabsTrigger>
        <TabsTrigger value="profile">Profile Change</TabsTrigger>
        <TabsTrigger value="approval">Approval Audit</TabsTrigger>
        <TabsTrigger value="expense">Expense Audit</TabsTrigger>
        <TabsTrigger value="asset">Asset Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="login" className="mt-4">
        <ReportShell title="Login Audit" description="System access events from the audit log."
          build={() => AUDIT_LOGS} columns={loginCols} searchKeys={["actor", "module", "target", "action"]} exportName="login-audit" />
      </TabsContent>

      <TabsContent value="role" className="mt-4">
        <ReportShell title="Role Change Audit" description="Every change to an employee's system roles."
          build={(f) => filter(roleChanges, f)} columns={cols} searchKeys={["actor", "target", "action"]} exportName="role-change-audit" />
      </TabsContent>

      <TabsContent value="profile" className="mt-4">
        <ReportShell title="Profile Change Audit" description="Updates to employee profile data."
          build={(f) => filter(profileChanges, f)} columns={cols} searchKeys={["actor", "target", "action"]} exportName="profile-audit" />
      </TabsContent>

      <TabsContent value="approval" className="mt-4">
        <ReportShell title="Approval Audit" description="Approval events across expense workflows."
          build={(f) => filter(approvalEvents, f)} columns={cols} searchKeys={["actor", "target"]} exportName="approval-audit" />
      </TabsContent>

      <TabsContent value="expense" className="mt-4">
        <ReportShell title="Expense Audit" description="Audit trail across expense tickets."
          build={(f) => filter(expenseAudit, f)} columns={cols} searchKeys={["actor", "target"]} exportName="expense-audit" />
      </TabsContent>

      <TabsContent value="asset" className="mt-4">
        <ReportShell title="Asset Audit" description="Lifecycle events across all assets."
          build={(f) => filter(assetAudit, f)} columns={cols} searchKeys={["actor", "target"]} exportName="asset-audit" />
      </TabsContent>
    </Tabs>
  );
}
