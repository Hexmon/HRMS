import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EMPLOYEES, type Employee } from "@/lib/mock-data";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

const columns: Column<Employee>[] = [
  {
    key: "name",
    header: "Employee",
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary-soft text-primary text-xs font-semibold">
            {r.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.id} · {r.email}</p>
        </div>
      </div>
    ),
  },
  { key: "designation", header: "Designation", render: (r) => <span className="text-sm">{r.designation}</span> },
  { key: "department", header: "Department", render: (r) => <span className="text-sm text-muted-foreground">{r.department}</span> },
  { key: "manager", header: "Reporting to", render: (r) => <span className="text-sm">{r.manager}</span> },
  { key: "location", header: "Location", render: (r) => <span className="text-sm text-muted-foreground">{r.location}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function EmployeesPage() {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Directory of everyone in the organisation. Search, filter, and manage profiles."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Invite employee
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={EMPLOYEES}
        searchKeys={["name", "email", "department", "designation", "id"]}
        rowActions={(r) => [
          { label: "View profile" },
          { label: "Edit details" },
          { label: r.status === "active" ? "Deactivate" : "Reactivate", tone: r.status === "active" ? "destructive" : "default" },
        ]}
      />
    </>
  );
}
