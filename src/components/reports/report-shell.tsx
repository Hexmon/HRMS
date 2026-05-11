import { ReactNode, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Filter } from "lucide-react";
import { DataTable, type Column } from "@/components/ui-kit";
import { exportCsv, daysAgo, isoToday } from "@/lib/reports/utils";
import { useEmployees } from "@/lib/employees-store";

export interface ReportFilters {
  from: string;
  to: string;
  department: string;
  employee: string;
  status: string;
}

interface FacetOptions {
  showDepartment?: boolean;
  showEmployee?: boolean;
  showStatus?: boolean;
  statusOptions?: { value: string; label: string }[];
  employeePool?: string[];
}

interface Props<T extends { id: string }> {
  title: string;
  description?: string;
  defaultFrom?: string;
  defaultTo?: string;
  facets?: FacetOptions;
  summary?: { label: string; value: ReactNode; tone?: "default" | "success" | "warning" | "destructive" | "info" }[];
  build: (filters: ReportFilters) => T[];
  columns: Column<T>[];
  searchKeys?: (keyof T)[];
  exportName?: string;
  emptyTitle?: string;
}

const TONE: Record<string, string> = {
  default: "border-border/60",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/40 bg-warning/5",
  destructive: "border-destructive/30 bg-destructive/5",
  info: "border-info/30 bg-info/5",
};

export function ReportShell<T extends { id: string }>({
  title, description, defaultFrom, defaultTo, facets, summary, build, columns, searchKeys, exportName, emptyTitle,
}: Props<T>) {
  const { departments, employees } = useEmployees();
  const [from, setFrom] = useState(defaultFrom ?? daysAgo(90));
  const [to, setTo] = useState(defaultTo ?? isoToday());
  const [department, setDepartment] = useState("all");
  const [employee, setEmployee] = useState("all");
  const [status, setStatus] = useState("all");

  const f: ReportFilters = { from, to, department, employee, status };
  const rows = build(f);

  const employeePool = facets?.employeePool ?? employees.map((e) => e.name);

  const handleExport = () => {
    const flat = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const c of columns) {
        const value = (r as unknown as Record<string, unknown>)[c.key];
        out[c.header] = typeof value === "object" ? JSON.stringify(value) : value ?? "";
      }
      return out;
    });
    exportCsv(`${exportName ?? title.toLowerCase().replace(/\s+/g, "-")}-${isoToday()}.csv`, flat);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <Card className="rounded-2xl border-border/60 p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-[11px]">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          {facets?.showDepartment && (
            <div className="space-y-1">
              <Label className="text-[11px]">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {facets?.showEmployee && (
            <div className="space-y-1">
              <Label className="text-[11px]">Employee</Label>
              <Select value={employee} onValueChange={setEmployee}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All employees</SelectItem>
                  {employeePool.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {facets?.showStatus && (
            <div className="space-y-1">
              <Label className="text-[11px]">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(facets.statusOptions ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {summary.map((s, i) => (
            <Card key={i} className={`rounded-2xl p-4 ${TONE[s.tone ?? "default"]}`}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        searchKeys={searchKeys}
        emptyTitle={emptyTitle ?? "No matching rows"}
        emptyDescription="Try adjusting filters or expanding the date range."
      />
    </div>
  );
}
