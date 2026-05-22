import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column, StatusBadge, EmptyState, StatCard } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { useLeave, LEAVE_TYPE_LABEL, type LeaveRequest } from "@/lib/leave-store";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { Download, Eye, Filter, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_app/leave-wfh/monitor")({
  component: MonitorPage,
});

const ADMIN: Role[] = ["hr_admin", "main_admin"];

function MonitorPage() {
  const { activeRole } = useAuth();
  const { requests } = useLeave();

  const [dept, setDept] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const departments = useMemo(
    () => Array.from(new Set(requests.map((r) => r.department))),
    [requests],
  );

  const filtered = useMemo(
    () =>
      requests.filter(
        (r) =>
          (dept === "all" || r.department === dept) &&
          (status === "all" || r.status === status) &&
          (!from || r.fromDate >= from) &&
          (!to || r.toDate <= to),
      ),
    [requests, dept, status, from, to],
  );

  if (!activeRole || !ADMIN.includes(activeRole)) return <Navigate to="/leave-wfh" />;

  const exportCsv = () => {
    const head = [
      "ID",
      "Kind",
      "Employee",
      "Department",
      "Manager",
      "Type",
      "From",
      "To",
      "Duration",
      "Status",
      "Reason",
    ];
    const rows = filtered.map((r) => [
      r.id,
      r.kind,
      r.employee,
      r.department,
      r.manager,
      r.leaveType ?? "WFH",
      r.fromDate,
      r.toDate,
      r.duration,
      r.status,
      `"${r.reason.replace(/"/g, '""')}"`,
    ]);
    const csv = [head, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-wfh-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  const cols: Column<LeaveRequest>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "employee",
      header: "Employee",
      render: (r) => (
        <>
          <div className="font-medium">{r.employee}</div>
          <div className="text-xs text-muted-foreground">{r.department}</div>
        </>
      ),
    },
    { key: "manager", header: "Manager", render: (r) => <>{r.manager}</> },
    {
      key: "kind",
      header: "Kind",
      render: (r) => (
        <span className="capitalize">
          {r.kind === "wfh" ? "WFH" : LEAVE_TYPE_LABEL[r.leaveType!]}
        </span>
      ),
    },
    {
      key: "dates",
      header: "Dates",
      render: (r) => (
        <span className="text-sm">
          {r.fromDate} → {r.toDate}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      render: (r) => <span className="tabular-nums">{r.duration}d</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status === "pending_manager" ? "pending" : r.status} />,
    },
    {
      key: "a",
      header: "",
      render: () => (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-full"
          onClick={() => toast("Detail opened")}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total requests"
          value={requests.length}
          icon={CalendarDays}
          tone="primary"
        />
        <StatCard
          label="Pending"
          value={requests.filter((r) => r.status === "pending_manager").length}
          tone="warning"
        />
        <StatCard
          label="Approved"
          value={requests.filter((r) => r.status === "approved").length}
          tone="success"
        />
        <StatCard
          label="Rejected"
          value={requests.filter((r) => r.status === "rejected").length}
          tone="destructive"
        />
      </div>

      <Card className="rounded-2xl border-border/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          <div className="min-w-[160px]">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending_manager">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="submitted">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[160px]"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[160px]"
          />
          <div className="ml-auto">
            <Button size="sm" className="rounded-full" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="No requests match filters" description="Try widening your selection." />
      ) : (
        <DataTable rows={filtered} columns={cols} searchKeys={["employee", "manager", "reason"]} />
      )}
    </div>
  );
}
