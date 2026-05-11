import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  UserAvatar,
  DataTable,
  type Column,
  ActionButton,
} from "@/components/ui-kit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees } from "@/lib/employees-store";
import { useAuth } from "@/lib/auth";
import { DEPARTMENTS } from "@/lib/mock/departments";
import { type Employee } from "@/lib/mock/employees";
import { EmployeeFormDrawer } from "@/components/employees/employee-form-drawer";
import { EmployeeProfileDrawer } from "@/components/employees/employee-profile-drawer";
import {
  Users,
  UserCheck,
  UserMinus,
  Sparkles,
  Plus,
  Download,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees")({
  head: () => ({ meta: [{ title: "Employees — Hawkaii HRMS" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const { employees, setStatus } = useEmployees();
  const { activeRole } = useAuth();
  const canEdit = activeRole === "main_admin" || activeRole === "hr_admin";

  const [dept, setDept] = useState<string>("all");
  const [status, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (dept !== "all" && e.department !== dept) return false;
      if (status !== "all" && e.status !== status) return false;
      return true;
    });
  }, [employees, dept, status]);

  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.status === "active").length;
    const onLeave = employees.filter((e) => e.status === "on_leave").length;
    const newJoiners = employees.filter((e) => {
      const d = new Date(e.joinedAt);
      return Date.now() - d.getTime() < 1000 * 60 * 60 * 24 * 90;
    }).length;
    return { total, active, onLeave, newJoiners };
  }, [employees]);

  const openProfile = (e: Employee) => {
    setSelected(e);
    setProfileOpen(true);
  };
  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setProfileOpen(false);
    setFormOpen(true);
  };

  const handleExport = () => {
    const headers = ["ID", "Name", "Email", "Department", "Designation", "Manager", "Location", "Status", "Joined"];
    const rows = filtered.map((e) =>
      [e.id, e.name, e.email, e.department, e.designation, e.manager, e.location, e.status, e.joinedAt]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkaii-employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported", { description: `${filtered.length} employees exported as CSV.` });
  };

  const columns: Column<Employee>[] = [
    {
      key: "name",
      header: "Employee",
      render: (e) => (
        <button onClick={() => openProfile(e)} className="text-left">
          <UserAvatar
            name={e.name}
            email={e.email}
            tone={e.avatarTone ?? "primary"}
            showMeta
            subtitle={e.email}
          />
        </button>
      ),
    },
    {
      key: "designation",
      header: "Job",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{e.designation}</p>
          <p className="truncate text-xs text-muted-foreground">{e.department}</p>
        </div>
      ),
    },
    { key: "manager", header: "Manager", render: (e) => <span className="text-sm text-muted-foreground">{e.manager}</span> },
    { key: "location", header: "Location", render: (e) => <span className="text-sm text-muted-foreground">{e.location}</span> },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status === "on_leave" ? "on_hold" : e.status} label={e.status === "on_leave" ? "On leave" : undefined} /> },
    { key: "id", header: "ID", className: "text-muted-foreground", render: (e) => <span className="text-xs">{e.id}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="The single source of truth for everyone in your workspace."
        actions={
          <>
            <ActionButton variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
              Export
            </ActionButton>
            {canEdit && (
              <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                Add employee
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total employees" value={stats.total} icon={Users} tone="primary" hint="Across the workspace" />
        <StatCard label="Active" value={stats.active} icon={UserCheck} tone="success" hint="Currently working" />
        <StatCard label="On leave" value={stats.onLeave} icon={UserMinus} tone="warning" hint="Out today" />
        <StatCard label="New joiners" value={stats.newJoiners} icon={Sparkles} tone="info" hint="Joined in last 90 days" />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        searchKeys={["name", "email", "designation", "department", "location", "id"]}
        emptyTitle="No employees match these filters"
        emptyDescription="Try adjusting your search or clearing filters."
        toolbarRight={
          <div className="flex items-center gap-2">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-9 w-[160px] rounded-full">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On leave</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        rowActions={(e) => {
          const actions: { label: string; onClick?: () => void; tone?: "default" | "destructive" }[] = [
            { label: "View profile", onClick: () => openProfile(e) },
          ];
          if (canEdit) {
            actions.push({ label: "Edit details", onClick: () => openEdit(e) });
            if (e.status === "active") {
              actions.push({
                label: "Deactivate",
                tone: "destructive",
                onClick: () => {
                  setStatus(e.id, "inactive");
                  toast.success("Employee deactivated", { description: e.name });
                },
              });
            } else {
              actions.push({
                label: "Reactivate",
                onClick: () => {
                  setStatus(e.id, "active");
                  toast.success("Employee reactivated", { description: e.name });
                },
              });
            }
          }
          return actions;
        }}
      />

      <EmployeeFormDrawer open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <EmployeeProfileDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        employee={selected}
        canEdit={canEdit}
        onEdit={() => selected && openEdit(selected)}
      />
    </>
  );
}
