import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, StatusBadge, EmptyState, StatCard } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { AlarmClock, LogOut, ClipboardX, Wrench, Check, X } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/exceptions")({
  component: ExceptionsPage,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

interface Row { id: string; employee: string; date: string; detail: string; status: string; }

const LATE: Row[] = [
  { id: "L-101", employee: "Olu Adeyemi", date: "Today", detail: "In at 09:47 (late 47 min)", status: "pending" },
  { id: "L-102", employee: "Mei Lin", date: "Today", detail: "In at 10:02 (late 62 min)", status: "pending" },
  { id: "L-103", employee: "Carlos Mendes", date: "Yesterday", detail: "In at 09:36 (late 36 min)", status: "approved" },
];
const MISSING: Row[] = [
  { id: "M-201", employee: "Daniel Park", date: "Yesterday", detail: "Punched in 09:08, no punch-out", status: "pending" },
  { id: "M-202", employee: "Aryan Mehta", date: "08 May", detail: "Punched in 09:18, no punch-out", status: "pending" },
];
const ABSENT: Row[] = [
  { id: "A-301", employee: "Carlos Mendes", date: "Today", detail: "No leave applied", status: "pending" },
];
const CORRECTIONS: Row[] = [
  { id: "C-401", employee: "Fatima Noor", date: "07 May", detail: "Forgot to punch out — requested 18:30", status: "pending" },
  { id: "C-402", employee: "Jacob Owens", date: "06 May", detail: "WFH not auto-detected", status: "pending" },
];

function Queue({ rows, kind }: { rows: Row[]; kind: string }) {
  const [data, setData] = useState(rows);
  const act = (id: string, ok: boolean) => {
    setData((d) => d.filter((r) => r.id !== id));
    toast.success(`${kind} ${ok ? "approved" : "rejected"}`);
  };
  const cols: Column<Row>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employee}</span> },
    { key: "date", header: "Date", render: (r) => <>{r.date}</> },
    { key: "detail", header: "Detail", render: (r) => <span className="text-muted-foreground">{r.detail}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "Actions", render: (r) => (
      <div className="flex gap-2">
        <Button size="sm" className="h-7 rounded-full" onClick={() => act(r.id, true)}><Check className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => act(r.id, false)}><X className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];
  if (data.length === 0) return <EmptyState title="All clear" description={`No ${kind.toLowerCase()} pending.`} />;
  return <DataTable rows={data} columns={cols} searchKeys={["employee","detail"]} />;
}

function ExceptionsPage() {
  const { activeRole } = useAuth();
  if (!activeRole || !ADMIN_ROLES.includes(activeRole)) return <Navigate to="/attendance" />;

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Late arrivals" value={LATE.length} icon={AlarmClock} tone="warning" />
        <StatCard label="Missing punch-out" value={MISSING.length} icon={LogOut} tone="warning" />
        <StatCard label="Absent w/o leave" value={ABSENT.length} icon={ClipboardX} tone="destructive" />
        <StatCard label="Manual corrections" value={CORRECTIONS.length} icon={Wrench} tone="info" />
      </div>

      <Tabs defaultValue="late">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="late">Late</TabsTrigger>
          <TabsTrigger value="missing">Missing punch-out</TabsTrigger>
          <TabsTrigger value="absent">Absent</TabsTrigger>
          <TabsTrigger value="correction">Corrections</TabsTrigger>
        </TabsList>
        <TabsContent value="late" className="mt-4"><Queue rows={LATE} kind="Late" /></TabsContent>
        <TabsContent value="missing" className="mt-4"><Queue rows={MISSING} kind="Missing punch-out" /></TabsContent>
        <TabsContent value="absent" className="mt-4"><Queue rows={ABSENT} kind="Absence" /></TabsContent>
        <TabsContent value="correction" className="mt-4"><Queue rows={CORRECTIONS} kind="Correction" /></TabsContent>
      </Tabs>
    </div>
  );
}
