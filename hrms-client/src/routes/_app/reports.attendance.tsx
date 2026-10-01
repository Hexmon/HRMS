import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportShell, type ReportFilters } from "@/components/reports/report-shell";
import { StatusBadge, type Column } from "@/components/ui-kit";
import { useEmployees } from "@/lib/employees-store";
import { daysAgo, inDateRange, isoToday } from "@/lib/reports/utils";
import { useAttendanceReport } from "@/domains/reports/queries";
import type { ReportParams } from "@/domains/reports/api";
import {
  ATTENDANCE_REPORTING_EVIDENCE_OPTIONS,
  attendanceReportingEvidenceLabel,
  type AttendanceReportingEvidenceCategory,
} from "@/domains/attendance/reporting-evidence";
import { asRecord, numberValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/attendance")({ component: AttendanceReports });

interface AttRow {
  id: string;
  date: string;
  employee: string;
  department: string;
  status: string;
  reportingEvidenceCategory: AttendanceReportingEvidenceCategory | null;
  inTime: string;
  outTime: string;
  hours: number;
  note?: string;
}

// Deterministic synth so values are stable across renders
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function buildAttendance(employees: { id: string; name: string; department: string }[]): AttRow[] {
  const out: AttRow[] = [];
  const today = new Date();
  for (let d = 0; d < 30; d++) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends
    const iso = day.toISOString().slice(0, 10);
    for (const e of employees) {
      const r = hash(e.id + iso) % 100;
      let status = "present";
      let reportingEvidenceCategory: AttendanceReportingEvidenceCategory = "verified";
      let inTime = "09:05";
      let outTime = "18:10";
      let hours = 9;
      if (r < 5) {
        status = "absent";
        reportingEvidenceCategory = "warning";
        inTime = "";
        outTime = "";
        hours = 0;
      } else if (r < 12) {
        status = "leave";
        reportingEvidenceCategory = "verified";
        inTime = "";
        outTime = "";
        hours = 0;
      } else if (r < 22) {
        status = "wfh";
        reportingEvidenceCategory = "provisional";
      } else if (r < 35) {
        status = "late";
        reportingEvidenceCategory = r % 2 === 0 ? "warning" : "review_required";
        const mins = (r % 50) + 15;
        inTime = `09:${mins.toString().padStart(2, "0")}`;
        hours = 8.5;
      }
      out.push({
        id: e.id + "-" + iso,
        date: iso,
        employee: e.name,
        department: e.department,
        status,
        reportingEvidenceCategory,
        inTime,
        outTime,
        hours,
        note: status === "late" ? `Late · ${(r % 50) + 15} min` : undefined,
      });
    }
  }
  return out;
}

function AttendanceReports() {
  const { departments, employees } = useEmployees();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const [filters, setFilters] = useState<ReportFilters>({
    from: daysAgo(90),
    to: isoToday(),
    department: "all",
    employee: "all",
    status: "all",
    evidenceCategory: "all",
    managerUserId: "all",
  });
  const reportParams = useMemo(
    () => reportParamsFromFilters(filters, { departments, employees }),
    [departments, employees, filters],
  );
  const reportQuery = useAttendanceReport(apiMode, reportParams);
  const localRows = useMemo(
    () =>
      buildAttendance(employees.map((e) => ({ id: e.id, name: e.name, department: e.department }))),
    [employees],
  );
  const all = apiMode ? (reportQuery.data?.items ?? []).map(attendanceFromApi) : localRows;

  if (apiMode && reportQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading attendance reports...</div>;
  }

  if (apiMode && reportQuery.error instanceof Error) {
    return <div className="p-6 text-sm text-destructive">{reportQuery.error.message}</div>;
  }

  const baseFilter = (rows: AttRow[], f: ReportFilters) =>
    rows.filter((r) => {
      if (!inDateRange(r.date, f.from, f.to)) return false;
      if (f.department !== "all" && r.department !== f.department) return false;
      if (f.employee !== "all" && r.employee !== f.employee) return false;
      if (f.status !== "all" && r.status !== f.status) return false;
      if (f.evidenceCategory !== "all" && r.reportingEvidenceCategory !== f.evidenceCategory) {
        return false;
      }
      return true;
    });

  const cols: Column<AttRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="font-mono text-xs">{r.date}</span>,
    },
    {
      key: "employee",
      header: "Employee",
      render: (r) => <span className="font-medium">{r.employee}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (r) => <span className="text-sm">{r.department}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "reportingEvidenceCategory",
      header: "Evidence state",
      render: (r) =>
        r.reportingEvidenceCategory ? (
          <StatusBadge
            status={r.reportingEvidenceCategory}
            label={attendanceReportingEvidenceLabel(r.reportingEvidenceCategory)}
          />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "inTime",
      header: "In",
      render: (r) => <span className="font-mono text-sm">{r.inTime || "—"}</span>,
    },
    {
      key: "outTime",
      header: "Out",
      render: (r) => <span className="font-mono text-sm">{r.outTime || "—"}</span>,
    },
    {
      key: "hours",
      header: "Hours",
      render: (r) => <span className="font-mono text-sm">{r.hours.toFixed(1)}</span>,
    },
    {
      key: "note",
      header: "Note",
      render: (r) => <span className="text-xs text-muted-foreground">{r.note ?? "—"}</span>,
    },
  ];

  const statusOptions = ["present", "late", "absent", "wfh", "leave"].map((s) => ({
    value: s,
    label: s,
  }));
  const evidenceCounts = evidenceCategoryCounts(reportQuery.data?.evidence_categories, all);
  const teamOptions = employees.map((employee) => ({
    value: employee.id,
    label: employee.name,
  }));

  return (
    <Tabs defaultValue="daily">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="daily">Daily Attendance</TabsTrigger>
        <TabsTrigger value="late">Late Arrivals</TabsTrigger>
        <TabsTrigger value="early">Early Departures</TabsTrigger>
        <TabsTrigger value="absent">Absenteeism</TabsTrigger>
        <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
        <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
      </TabsList>

      <TabsContent value="daily" className="mt-4">
        <ReportShell
          title="Daily Attendance"
          description="Day-wise attendance with in/out times and worked hours."
          facets={{
            showDepartment: true,
            showEmployee: true,
            showStatus: true,
            showEvidenceCategory: true,
            showTeam: true,
            statusOptions,
            teamOptions,
          }}
          filters={filters}
          onFiltersChange={setFilters}
          summary={[
            { label: "Records", value: all.length, tone: "info" },
            {
              label: "Verified",
              value: evidenceCounts.verified,
              tone: "success",
            },
            {
              label: "Warning",
              value: evidenceCounts.warning,
              tone: "warning",
            },
            {
              label: "Provisional",
              value: evidenceCounts.provisional,
              tone: "warning",
            },
            {
              label: "Review required",
              value: evidenceCounts.review_required,
              tone: "warning",
            },
            {
              label: "Rejected",
              value: evidenceCounts.rejected,
              tone: "destructive",
            },
          ]}
          build={(f) => baseFilter(all, f)}
          columns={cols}
          searchKeys={["employee", "department"]}
          exportName="daily-attendance"
        />
      </TabsContent>

      <TabsContent value="late" className="mt-4">
        <ReportShell
          title="Late Arrivals"
          description="Employees who clocked in after 09:15."
          facets={{ showDepartment: true, showEmployee: true, showEvidenceCategory: true }}
          filters={filters}
          onFiltersChange={setFilters}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.status === "late"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="late-arrivals"
        />
      </TabsContent>

      <TabsContent value="early" className="mt-4">
        <ReportShell
          title="Early Departures"
          description="Employees who logged off before 17:30."
          facets={{ showDepartment: true, showEmployee: true, showEvidenceCategory: true }}
          filters={filters}
          onFiltersChange={setFilters}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.hours > 0 && r.hours < 8),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="early-departures"
        />
      </TabsContent>

      <TabsContent value="absent" className="mt-4">
        <ReportShell
          title="Absenteeism Report"
          description="Unplanned absences without leave approval."
          facets={{ showDepartment: true, showEmployee: true, showEvidenceCategory: true }}
          filters={filters}
          onFiltersChange={setFilters}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.status === "absent"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="absenteeism"
        />
      </TabsContent>

      <TabsContent value="monthly" className="mt-4">
        <MonthlySummary all={all} />
      </TabsContent>

      <TabsContent value="exceptions" className="mt-4">
        <ReportShell
          title="Attendance Exceptions"
          description="Late arrivals, missed punches and partial days."
          facets={{ showDepartment: true, showEmployee: true, showEvidenceCategory: true }}
          filters={filters}
          onFiltersChange={setFilters}
          build={(f) =>
            baseFilter(
              all.filter((r) => r.status === "late" || r.status === "absent"),
              f,
            )
          }
          columns={cols}
          searchKeys={["employee"]}
          exportName="attendance-exceptions"
        />
      </TabsContent>
    </Tabs>
  );
}

function attendanceFromApi(value: unknown): AttRow {
  const record = asRecord(value);
  return {
    id: text(record.id),
    date: text(record.date),
    employee: text(record.employee),
    department: text(record.department, "—"),
    status: text(record.status, "present") as AttRow["status"],
    reportingEvidenceCategory: reportingEvidenceCategory(record.reporting_evidence_category),
    inTime: text(record.in_time),
    outTime: text(record.out_time),
    hours: numberValue(record.hours),
    note: text(record.note),
  };
}

function reportingEvidenceCategory(value: unknown): AttendanceReportingEvidenceCategory | null {
  return ATTENDANCE_REPORTING_EVIDENCE_OPTIONS.some((option) => option.value === value)
    ? (value as AttendanceReportingEvidenceCategory)
    : null;
}

function reportParamsFromFilters(
  filters: ReportFilters,
  context: {
    departments: { id: string; name: string }[];
    employees: { id: string; name: string }[];
  },
): ReportParams {
  const params: ReportParams = {
    page: 1,
    page_size: 100,
    date_from: filters.from,
    date_to: filters.to,
  };
  if (filters.status !== "all") params.status = filters.status;
  if (filters.evidenceCategory !== "all") params.evidence_category = filters.evidenceCategory;
  if (filters.managerUserId !== "all") params.manager_user_id = filters.managerUserId;
  if (filters.department !== "all") {
    const department = context.departments.find((item) => item.name === filters.department);
    if (department) params.department_id = department.id;
  }
  if (filters.employee !== "all") {
    const employee = context.employees.find((item) => item.name === filters.employee);
    if (employee) {
      params.user_id = employee.id;
      params.employee_user_id = employee.id;
    }
  }
  return params;
}

function evidenceCategoryCounts(value: unknown, rows: AttRow[]) {
  const record = asRecord(value);
  if (Object.keys(record).length > 0) {
    return {
      verified: numberValue(record.verified),
      warning: numberValue(record.warning),
      provisional: numberValue(record.provisional),
      review_required: numberValue(record.review_required),
      rejected: numberValue(record.rejected),
    };
  }
  return {
    verified: rows.filter((row) => row.reportingEvidenceCategory === "verified").length,
    warning: rows.filter((row) => row.reportingEvidenceCategory === "warning").length,
    provisional: rows.filter((row) => row.reportingEvidenceCategory === "provisional").length,
    review_required: rows.filter((row) => row.reportingEvidenceCategory === "review_required")
      .length,
    rejected: rows.filter((row) => row.reportingEvidenceCategory === "rejected").length,
  };
}

function MonthlySummary({ all }: { all: AttRow[] }) {
  const summary = useMemo(() => {
    const m = new Map<
      string,
      { present: number; late: number; absent: number; wfh: number; leave: number; total: number }
    >();
    for (const r of all) {
      const cur = m.get(r.employee) ?? {
        present: 0,
        late: 0,
        absent: 0,
        wfh: 0,
        leave: 0,
        total: 0,
      };
      if (isMonthlyAttendanceStatus(r.status)) {
        cur[r.status] += 1;
      }
      cur.total += 1;
      m.set(r.employee, cur);
    }
    return Array.from(m.entries()).map(([emp, v]) => ({
      id: emp,
      employee: emp,
      ...v,
      attendance: Math.round(((v.present + v.late + v.wfh) / Math.max(1, v.total)) * 100),
    }));
  }, [all]);

  return (
    <ReportShell
      title="Monthly Attendance Summary"
      description="Per-employee attendance percentage over the last 30 days."
      build={() => summary}
      columns={[
        {
          key: "employee",
          header: "Employee",
          render: (r) => <span className="font-medium">{r.employee}</span>,
        },
        {
          key: "present",
          header: "Present",
          render: (r) => <span className="font-mono">{r.present}</span>,
        },
        { key: "late", header: "Late", render: (r) => <span className="font-mono">{r.late}</span> },
        {
          key: "absent",
          header: "Absent",
          render: (r) => <span className="font-mono">{r.absent}</span>,
        },
        { key: "wfh", header: "WFH", render: (r) => <span className="font-mono">{r.wfh}</span> },
        {
          key: "leave",
          header: "Leave",
          render: (r) => <span className="font-mono">{r.leave}</span>,
        },
        {
          key: "attendance",
          header: "Attendance %",
          render: (r) => (
            <span
              className={`font-mono ${r.attendance < 80 ? "text-destructive" : "text-success"}`}
            >
              {r.attendance}%
            </span>
          ),
        },
      ]}
      searchKeys={["employee"]}
      exportName="monthly-attendance"
    />
  );
}

function isMonthlyAttendanceStatus(
  status: string,
): status is "present" | "late" | "absent" | "wfh" | "leave" {
  return (
    status === "present" ||
    status === "late" ||
    status === "absent" ||
    status === "wfh" ||
    status === "leave"
  );
}
