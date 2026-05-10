import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ATTENDANCE, type AttendanceRow } from "@/lib/mock-data";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendancePage,
});

const columns: Column<AttendanceRow>[] = [
  { key: "employee", header: "Employee", render: (r) => <span className="text-sm font-medium">{r.employee}</span> },
  { key: "date", header: "Date", render: (r) => <span className="text-sm text-muted-foreground">{r.date}</span> },
  { key: "checkIn", header: "Check-in", render: (r) => <span className="text-sm tabular-nums">{r.checkIn}</span> },
  { key: "checkOut", header: "Check-out", render: (r) => <span className="text-sm tabular-nums">{r.checkOut}</span> },
  { key: "hours", header: "Hours", render: (r) => <span className="text-sm font-semibold tabular-nums">{r.hours}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

const summary = [
  { label: "Present", value: 212, tone: "success" },
  { label: "On WFH", value: 22, tone: "info" },
  { label: "Late", value: 6, tone: "warning" },
  { label: "Absent", value: 8, tone: "destructive" },
];

function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daily attendance, work-from-home and time tracking across the org."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Clock className="mr-1.5 h-4 w-4" /> Check in
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.label} className="rounded-2xl border-border/60 p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>
      <DataTable columns={columns} rows={ATTENDANCE} searchKeys={["employee", "status"]} />
    </>
  );
}
