import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useLeave, LEAVE_TYPE_LABEL, HOLIDAYS, LEAVE_BALANCES, type LeaveRequest, type Holiday } from "@/lib/leave-store";
import { inDateRange } from "@/lib/reports/utils";

export const Route = createFileRoute("/_app/reports/leave")({ component: LeaveReports });

function LeaveReports() {
  const { requests } = useLeave();

  const filter = (rows: LeaveRequest[], f: { from: string; to: string; department: string; employee: string; status: string }, kind?: "leave" | "wfh") =>
    rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!inDateRange(r.fromDate, f.from, f.to)) return false;
      if (f.department !== "all" && r.department !== f.department) return false;
      if (f.employee !== "all" && r.employee !== f.employee) return false;
      if (f.status !== "all" && r.status !== f.status) return false;
      return true;
    });

  const cols: Column<LeaveRequest>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employee}</span> },
    { key: "department", header: "Department", render: (r) => <span className="text-sm">{r.department}</span> },
    { key: "leaveType", header: "Type", render: (r) => <span className="text-sm">{r.leaveType ? LEAVE_TYPE_LABEL[r.leaveType] : "WFH"}</span> },
    { key: "fromDate", header: "From", render: (r) => <span className="font-mono text-xs">{r.fromDate}</span> },
    { key: "toDate", header: "To", render: (r) => <span className="font-mono text-xs">{r.toDate}</span> },
    { key: "duration", header: "Days", render: (r) => <span className="font-mono">{r.duration}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const statusOptions = ["draft", "submitted", "pending_manager", "approved", "rejected", "cancelled"]
    .map((s) => ({ value: s, label: s.replace("_", " ") }));

  const balanceRows = LEAVE_BALANCES.map((b) => ({
    id: b.type, type: LEAVE_TYPE_LABEL[b.type], used: b.used, total: b.total, remaining: b.total - b.used,
  }));

  return (
    <Tabs defaultValue="balance">
      <TabsList className="flex-wrap">
        <TabsTrigger value="balance">Leave Balance</TabsTrigger>
        <TabsTrigger value="applied">Leave Applied</TabsTrigger>
        <TabsTrigger value="decisions">Approved / Rejected</TabsTrigger>
        <TabsTrigger value="wfh">WFH Report</TabsTrigger>
        <TabsTrigger value="holidays">Holiday Calendar</TabsTrigger>
      </TabsList>

      <TabsContent value="balance" className="mt-4">
        <ReportShell
          title="Leave Balance"
          description="Per-type leave balances for the current cycle."
          build={() => balanceRows}
          columns={[
            { key: "type", header: "Leave type", render: (r) => <span className="font-medium">{r.type}</span> },
            { key: "used", header: "Used", render: (r) => <span className="font-mono">{r.used}</span> },
            { key: "total", header: "Total", render: (r) => <span className="font-mono">{r.total}</span> },
            { key: "remaining", header: "Remaining", render: (r) => <span className="font-mono text-success">{r.remaining}</span> },
          ]}
          searchKeys={["type"]}
          exportName="leave-balance"
        />
      </TabsContent>

      <TabsContent value="applied" className="mt-4">
        <ReportShell
          title="Leave Applied"
          description="Every leave application across the workforce."
          facets={{ showDepartment: true, showEmployee: true, showStatus: true, statusOptions, employeePool: Array.from(new Set(requests.map((r) => r.employee))) }}
          summary={[{ label: "Applications", value: requests.filter((r) => r.kind === "leave").length, tone: "info" }]}
          build={(f) => filter(requests, f, "leave")}
          columns={cols}
          searchKeys={["employee", "id"]}
          exportName="leave-applied"
        />
      </TabsContent>

      <TabsContent value="decisions" className="mt-4">
        <ReportShell
          title="Leave Approved / Rejected"
          description="Decision register for leave requests."
          facets={{ showDepartment: true, showEmployee: true, showStatus: true, statusOptions, employeePool: Array.from(new Set(requests.map((r) => r.employee))) }}
          summary={[
            { label: "Approved", value: requests.filter((r) => r.status === "approved").length, tone: "success" },
            { label: "Rejected", value: requests.filter((r) => r.status === "rejected").length, tone: "destructive" },
          ]}
          build={(f) => filter(requests.filter((r) => r.status === "approved" || r.status === "rejected"), f)}
          columns={cols}
          searchKeys={["employee", "id"]}
          exportName="leave-decisions"
        />
      </TabsContent>

      <TabsContent value="wfh" className="mt-4">
        <ReportShell
          title="WFH Report"
          description="Work-from-home applications by status."
          facets={{ showDepartment: true, showEmployee: true, showStatus: true, statusOptions, employeePool: Array.from(new Set(requests.map((r) => r.employee))) }}
          build={(f) => filter(requests, f, "wfh")}
          columns={cols}
          searchKeys={["employee", "id"]}
          exportName="wfh"
        />
      </TabsContent>

      <TabsContent value="holidays" className="mt-4">
        <ReportShell
          title="Holiday Calendar"
          description="Public and optional holidays for the year."
          build={() => HOLIDAYS as Holiday[]}
          columns={[
            { key: "name", header: "Holiday", render: (h) => <span className="font-medium">{h.name}</span> },
            { key: "date", header: "Date", render: (h) => <span className="font-mono text-xs">{h.date}</span> },
            { key: "region", header: "Region", render: (h) => <span className="text-sm">{h.region}</span> },
            { key: "optional", header: "Type", render: (h) => <StatusBadge status={h.optional ? "pending" : "active"} label={h.optional ? "Optional" : "Mandatory"} /> },
          ]}
          searchKeys={["name", "region"]}
          exportName="holidays"
        />
      </TabsContent>
    </Tabs>
  );
}
