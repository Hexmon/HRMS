import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useTimesheets } from "@/lib/timesheets-store";
import { useTimesheetProductivitySummary, useTimesheetProjectSummary } from "@/domains/timesheets";
import { asArray, asRecord, isApiEnabled, numberValue, pageItems, text } from "@/shared/api";
import {
  TIMESHEET_STATUS_LABEL,
  type TimesheetEntry,
  type TimesheetWeek,
} from "@/lib/mock/timesheets";
import { inDateRange } from "@/lib/reports/utils";

export const Route = createFileRoute("/_app/reports/timesheet")({ component: TimesheetReports });

function TimesheetReports() {
  const { entries, weeks } = useTimesheets();
  const apiMode = isApiEnabled();
  const productivityQuery = useTimesheetProductivitySummary(
    { date_from: "2026-01-01", date_to: "2026-12-31", group_by: "employee" },
    apiMode,
  );
  const projectSummaryQuery = useTimesheetProjectSummary(
    { page: 1, page_size: 100, date_from: "2026-01-01", date_to: "2026-12-31" },
    apiMode,
  );

  const filterEntries = (
    f: { from: string; to: string; department: string; employee: string; status: string },
    status?: string[],
  ) =>
    entries.filter((e) => {
      if (!inDateRange(e.date, f.from, f.to)) return false;
      if (f.employee !== "all" && e.employeeName !== f.employee) return false;
      const week = weeks.find((w) => w.employeeId === e.employeeId && w.weekStart === e.weekStart);
      if (status && week && !status.includes(week.status)) return false;
      if (f.department !== "all" && week && week.department !== f.department) return false;
      return true;
    });

  const entryCols: Column<TimesheetEntry>[] = [
    {
      key: "date",
      header: "Date",
      render: (e) => <span className="font-mono text-xs">{e.date}</span>,
    },
    {
      key: "employeeName",
      header: "Employee",
      render: (e) => <span className="font-medium">{e.employeeName}</span>,
    },
    {
      key: "projectCode",
      header: "Project",
      render: (e) => (
        <span className="text-sm">
          {e.projectCode} · {e.projectName}
        </span>
      ),
    },
    { key: "task", header: "Task", render: (e) => <span className="text-sm">{e.task}</span> },
    {
      key: "hours",
      header: "Hours",
      render: (e) => <span className="font-mono">{e.hours.toFixed(1)}</span>,
    },
    {
      key: "billable",
      header: "Billable",
      render: (e) => <StatusBadge status={e.billable ? "billable" : "non_billable"} />,
    },
  ];

  const weekCols: Column<TimesheetWeek>[] = [
    {
      key: "weekStart",
      header: "Week of",
      render: (w) => <span className="font-mono text-xs">{w.weekStart}</span>,
    },
    {
      key: "employeeName",
      header: "Employee",
      render: (w) => <span className="font-medium">{w.employeeName}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (w) => <span className="text-sm">{w.department}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (w) => <StatusBadge status={w.status} label={TIMESHEET_STATUS_LABEL[w.status]} />,
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (w) => <span className="text-xs text-muted-foreground">{w.submittedAt ?? "—"}</span>,
    },
    {
      key: "remarks",
      header: "Remarks",
      render: (w) => <span className="text-xs text-muted-foreground">{w.remarks ?? "—"}</span>,
    },
  ];

  const productivity = useMemo(() => {
    if (apiMode && productivityQuery.data) {
      return asArray(asRecord(productivityQuery.data).breakdown).map((value) => {
        const row = asRecord(value);
        const hours = numberValue(row.total_hours, 0);
        const billable = numberValue(row.billable_hours, 0);
        return {
          id: text(row.id, text(row.label, "employee")),
          employee: text(row.label, "Employee"),
          hours,
          billable,
          util: numberValue(row.billable_percent, hours ? Math.round((billable / hours) * 100) : 0),
        };
      });
    }
    const m = new Map<string, { hours: number; billable: number }>();
    for (const e of entries) {
      const cur = m.get(e.employeeName) ?? { hours: 0, billable: 0 };
      cur.hours += e.hours;
      if (e.billable) cur.billable += e.hours;
      m.set(e.employeeName, cur);
    }
    return Array.from(m.entries()).map(([emp, v]) => ({
      id: emp,
      employee: emp,
      hours: v.hours,
      billable: v.billable,
      util: v.hours ? Math.round((v.billable / v.hours) * 100) : 0,
    }));
  }, [apiMode, entries, productivityQuery.data]);

  const projectHours = useMemo(() => {
    if (apiMode && projectSummaryQuery.data) {
      return pageItems(projectSummaryQuery.data).map((value) => {
        const row = asRecord(value);
        const project = asRecord(row.project);
        const totals = asRecord(row.totals);
        return {
          id: text(project.project_code, text(project.id, "project")),
          code: text(project.project_code, "PROJECT"),
          project: text(project.name, "Project"),
          hours: numberValue(totals.total_hours, 0),
          billable: numberValue(totals.billable_hours, 0),
        };
      });
    }
    const m = new Map<string, { hours: number; billable: number; project: string }>();
    for (const e of entries) {
      const k = e.projectCode;
      const cur = m.get(k) ?? { hours: 0, billable: 0, project: e.projectName };
      cur.hours += e.hours;
      if (e.billable) cur.billable += e.hours;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([code, v]) => ({
      id: code,
      code,
      project: v.project,
      hours: v.hours,
      billable: v.billable,
    }));
  }, [apiMode, entries, projectSummaryQuery.data]);

  const statusOptions = Object.entries(TIMESHEET_STATUS_LABEL).map(([value, label]) => ({
    value,
    label,
  }));
  const employeePool = Array.from(new Set(entries.map((e) => e.employeeName)));

  return (
    <Tabs defaultValue="missing">
      <TabsList className="flex-wrap">
        <TabsTrigger value="missing">Missing</TabsTrigger>
        <TabsTrigger value="submitted">Submitted Hours</TabsTrigger>
        <TabsTrigger value="approved">Approved Hours</TabsTrigger>
        <TabsTrigger value="rejected">Rejected</TabsTrigger>
        <TabsTrigger value="prod">Productivity</TabsTrigger>
        <TabsTrigger value="proj">Project-wise</TabsTrigger>
      </TabsList>

      <TabsContent value="missing" className="mt-4">
        <ReportShell
          title="Missing Timesheet"
          description="Weeks where the timesheet is still in draft."
          facets={{
            showDepartment: true,
            showEmployee: true,
            employeePool: Array.from(new Set(weeks.map((w) => w.employeeName))),
          }}
          build={(f) =>
            weeks.filter(
              (w) =>
                w.status === "draft" &&
                (f.department === "all" || w.department === f.department) &&
                (f.employee === "all" || w.employeeName === f.employee),
            )
          }
          columns={weekCols}
          searchKeys={["employeeName", "department"]}
          exportName="missing-timesheets"
        />
      </TabsContent>

      <TabsContent value="submitted" className="mt-4">
        <ReportShell
          title="Submitted Hours"
          description="Entries belonging to submitted or pending weeks."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            statusOptions,
            employeePool,
          }}
          build={(f) => filterEntries(f, ["submitted", "pending"])}
          columns={entryCols}
          searchKeys={["employeeName", "projectCode", "task"]}
          exportName="submitted-hours"
        />
      </TabsContent>

      <TabsContent value="approved" className="mt-4">
        <ReportShell
          title="Approved Hours"
          description="Approved entries by employee and project."
          facets={{ showDepartment: true, showEmployee: true, employeePool }}
          build={(f) => filterEntries(f, ["approved"])}
          columns={entryCols}
          searchKeys={["employeeName", "projectCode"]}
          exportName="approved-hours"
        />
      </TabsContent>

      <TabsContent value="rejected" className="mt-4">
        <ReportShell
          title="Rejected Timesheets"
          description="Weeks rejected or returned by managers."
          facets={{ showDepartment: true }}
          build={(f) =>
            weeks.filter(
              (w) =>
                (w.status === "rejected" || w.status === "returned") &&
                (f.department === "all" || w.department === f.department),
            )
          }
          columns={weekCols}
          searchKeys={["employeeName"]}
          exportName="rejected-timesheets"
        />
      </TabsContent>

      <TabsContent value="prod" className="mt-4">
        <ReportShell
          title="Employee Productivity"
          description="Hours logged and billable share."
          build={() => productivity}
          columns={[
            {
              key: "employee",
              header: "Employee",
              render: (r) => <span className="font-medium">{r.employee}</span>,
            },
            {
              key: "hours",
              header: "Hours",
              render: (r) => <span className="font-mono">{r.hours.toFixed(1)}</span>,
            },
            {
              key: "billable",
              header: "Billable",
              render: (r) => <span className="font-mono">{r.billable.toFixed(1)}</span>,
            },
            {
              key: "util",
              header: "Billable %",
              render: (r) => <span className="font-mono text-success">{r.util}%</span>,
            },
          ]}
          searchKeys={["employee"]}
          exportName="productivity"
        />
      </TabsContent>

      <TabsContent value="proj" className="mt-4">
        <ReportShell
          title="Project-wise Hours"
          description="Total and billable hours by project."
          build={() => projectHours}
          columns={[
            {
              key: "code",
              header: "Code",
              render: (r) => <span className="font-mono text-xs">{r.code}</span>,
            },
            {
              key: "project",
              header: "Project",
              render: (r) => <span className="font-medium">{r.project}</span>,
            },
            {
              key: "hours",
              header: "Hours",
              render: (r) => <span className="font-mono">{r.hours.toFixed(1)}</span>,
            },
            {
              key: "billable",
              header: "Billable",
              render: (r) => <span className="font-mono">{r.billable.toFixed(1)}</span>,
            },
          ]}
          searchKeys={["project", "code"]}
          exportName="project-hours"
        />
      </TabsContent>
    </Tabs>
  );
}
