import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ReportShell,
  type FacetOptions,
  type ReportFilters,
} from "@/components/reports/report-shell";
import { DataCard, StatusBadge, type Column } from "@/components/ui-kit";
import { useEmployees } from "@/lib/employees-store";
import { daysAgo, inDateRange, isoToday } from "@/lib/reports/utils";
import { useAttendanceReport } from "@/domains/reports/queries";
import { useAttendanceDailyCalendar } from "@/domains/attendance";
import { authApi } from "@/domains/auth";
import type { ReportParams } from "@/domains/reports/api";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  ATTENDANCE_REPORTING_EVIDENCE_OPTIONS,
  attendanceReportingEvidenceLabel,
  type AttendanceReportingEvidenceCategory,
} from "@/domains/attendance/reporting-evidence";
import { asArray, asRecord, numberValue, text, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/reports/attendance")({ component: AttendanceReports });

interface AttRow {
  id: string;
  employeeUserId: string;
  date: string;
  employee: string;
  department: string;
  status: string;
  reportingEvidenceCategory: AttendanceReportingEvidenceCategory | null;
  attendanceChannels: string[];
  sourceCategories: string[];
  workSiteId: string[];
  workSiteName: string[];
  workSiteType: string[];
  approvalState: string;
  geoOutcome: string[];
  geoAction: string[];
  reviewType: string[];
  reasonCodes: string[];
  reviewRequired: boolean;
  reviewOutcome: string[];
  inTime: string;
  outTime: string;
  hours: number;
  note?: string;
}

const ATTENDANCE_SOURCE_CATEGORY_OPTIONS = [
  { value: "geo", label: "Geo evidence" },
  { value: "manual", label: "Manual evidence" },
  { value: "mobile", label: "Mobile" },
  { value: "web", label: "Web" },
  { value: "kiosk", label: "Kiosk" },
  { value: "system", label: "System" },
];

const GEO_OUTCOME_OPTIONS = [
  { value: "inside_confident", label: "Inside fence" },
  { value: "outside_confident", label: "Outside fence" },
  { value: "boundary_uncertain", label: "Boundary uncertain" },
  { value: "stale_evidence", label: "Stale location" },
  { value: "accuracy_exceeded", label: "Accuracy exceeded" },
  { value: "missing", label: "Missing location" },
  { value: "permission_denied", label: "Permission denied" },
  { value: "location_unavailable", label: "Location unavailable" },
  { value: "fence_not_configured", label: "Fence not configured" },
  { value: "not_required", label: "Not required" },
];

const REVIEW_TYPE_OPTIONS = [
  { value: "manual_fallback", label: "Manual fallback" },
  { value: "geo_decision", label: "Geo decision" },
];

const REASON_CODE_OPTIONS = [
  { value: "geo_outside_fence", label: "Outside fence" },
  { value: "geo_permission_denied", label: "Location permission denied" },
  { value: "geo_location_unavailable", label: "Location unavailable" },
  { value: "geo_accuracy_exceeded", label: "Accuracy exceeded" },
  { value: "geo_stale_evidence", label: "Stale location" },
  { value: "offline_sync.accepted_unverified", label: "Offline accepted unverified" },
  { value: "offline_sync.review_required", label: "Offline review required" },
  { value: "offline_sync.sequence_gap", label: "Offline sequence gap" },
  { value: "offline_sync.changed_body_conflict", label: "Offline changed-body conflict" },
  { value: "mobile_registered_device_required", label: "Registered device required" },
  { value: "regularization.pending", label: "Correction pending" },
  { value: "regularization.approved", label: "Correction approved" },
  { value: "regularization.returned", label: "Correction returned" },
  { value: "regularization.rejected", label: "Correction rejected" },
];

const APPROVAL_STATE_OPTIONS = [
  { value: "not_required", label: "Not required" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "returned", label: "Returned" },
  { value: "rejected", label: "Rejected" },
  { value: "mixed", label: "Mixed" },
  { value: "unknown", label: "Unknown" },
];

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
        employeeUserId: e.id,
        date: iso,
        employee: e.name,
        department: e.department,
        status,
        reportingEvidenceCategory,
        attendanceChannels: ["Web"],
        sourceCategories: ["web"],
        workSiteId: [],
        workSiteName: [],
        workSiteType: [],
        approvalState: "not_required",
        geoOutcome: [],
        geoAction: [],
        reviewType: [],
        reasonCodes: [],
        reviewRequired: reportingEvidenceCategory === "review_required",
        reviewOutcome: reportingEvidenceCategory === "review_required" ? ["pending"] : [],
        inTime,
        outTime,
        hours,
        note: status === "late" ? `Late · ${(r % 50) + 15} min` : undefined,
      });
    }
  }
  return out;
}

function dateInTimeZone(timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (kind: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === kind)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function AttendanceReports() {
  const { departments, employees } = useEmployees();
  const apiMode = useApiRouteEnabled(["/reports"]);
  const sessionQuery = useQuery({
    queryKey: queryKeys.detail("auth", "session", "me"),
    queryFn: () => authApi.getSession(),
    enabled: apiMode,
    staleTime: queryTimings.realtimeStaleMs,
  });
  const companyToday = dateInTimeZone(text(asRecord(sessionQuery.data?.company).timezone));
  const initialDates = useMemo(() => ({ from: daysAgo(90), to: isoToday() }), []);
  const [selectedAttendanceRow, setSelectedAttendanceRow] = useState<AttRow | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    from: initialDates.from,
    to: initialDates.to,
    department: "all",
    employee: "all",
    status: "all",
    evidenceCategory: "all",
    sourceCategory: "all",
    siteId: "all",
    approvalState: "all",
    geoOutcome: "all",
    reviewType: "all",
    reasonCode: "all",
    managerUserId: "all",
  });
  useEffect(() => {
    if (!companyToday) return;
    const [year, month, day] = companyToday.split("-").map(Number);
    const from = new Date(Date.UTC(year, month - 1, day - 90)).toISOString().slice(0, 10);
    setFilters((current) => ({
      ...current,
      from: current.from === initialDates.from ? from : current.from,
      to: current.to === initialDates.to ? companyToday : current.to,
    }));
  }, [companyToday, initialDates]);
  const reportParams = useMemo(
    () => reportParamsFromFilters(filters, { departments, employees }),
    [departments, employees, filters],
  );
  const reportQuery = useAttendanceReport(apiMode, reportParams);
  const selectedDailyQuery = useAttendanceDailyCalendar(
    selectedAttendanceRow?.employeeUserId
      ? {
          date: selectedAttendanceRow.date,
          user_id: selectedAttendanceRow.employeeUserId,
          page: 1,
          page_size: 1,
        }
      : {},
    apiMode && Boolean(selectedAttendanceRow?.employeeUserId),
  );
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
      if (f.sourceCategory !== "all" && !r.sourceCategories.includes(f.sourceCategory)) {
        return false;
      }
      if (f.siteId !== "all" && !r.workSiteId.includes(f.siteId)) return false;
      if (f.approvalState !== "all" && r.approvalState !== f.approvalState) return false;
      if (f.geoOutcome !== "all" && !r.geoOutcome.includes(f.geoOutcome)) return false;
      if (f.reviewType !== "all" && !r.reviewType.includes(f.reviewType)) return false;
      if (f.reasonCode !== "all" && !r.reasonCodes.includes(f.reasonCode)) return false;
      return true;
    });

  const cols: Column<AttRow>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <span className="break-words font-medium">{r.employee}</span>,
    },
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="font-mono text-xs">{r.date}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (r) => <span className="break-words text-sm">{r.department}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusBadge status={r.status} className="max-w-full whitespace-normal break-words" />
      ),
    },
    {
      key: "reportingEvidenceCategory",
      header: "Evidence state",
      render: (r) =>
        r.reportingEvidenceCategory ? (
          <StatusBadge
            status={r.reportingEvidenceCategory}
            label={attendanceReportingEvidenceLabel(r.reportingEvidenceCategory)}
            className="max-w-full whitespace-normal break-words"
          />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "attendanceChannels",
      header: "Channel",
      render: (r) => <ValueList values={r.attendanceChannels} />,
    },
    {
      key: "workSiteName",
      header: "Site",
      render: (r) => <SiteCell row={r} />,
    },
    {
      key: "geoOutcome",
      header: "Geo",
      render: (r) => <GeoCell row={r} />,
    },
    {
      key: "reviewOutcome",
      header: "Review",
      render: (r) => <ReviewCell row={r} />,
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
      render: (r) => (
        <span className="break-words text-xs text-muted-foreground">{r.note ?? "—"}</span>
      ),
    },
  ];

  const statusOptions = ["present", "late", "absent", "wfh", "leave"].map((s) => ({
    value: s,
    label: s,
  }));
  const evidenceCounts = evidenceCategoryCounts(reportQuery.data?.evidence_categories, all);
  const sourceCounts = sourceCategoryCounts(reportQuery.data?.source_categories, all);
  const siteOptions = siteOptionsFromReport(reportQuery.data?.site_options, all);
  const teamOptions = employees.map((employee) => ({
    value: employee.id,
    label: employee.name,
  }));
  const attendanceFacets = {
    showDepartment: true,
    showEmployee: true,
    showEvidenceCategory: true,
    showSourceCategory: true,
    showSite: true,
    showApprovalState: true,
    showGeoOutcome: true,
    showReviewType: true,
    showReasonCode: true,
    sourceCategoryOptions: ATTENDANCE_SOURCE_CATEGORY_OPTIONS,
    siteOptions,
    approvalStateOptions: APPROVAL_STATE_OPTIONS,
    geoOutcomeOptions: GEO_OUTCOME_OPTIONS,
    reviewTypeOptions: REVIEW_TYPE_OPTIONS,
    reasonCodeOptions: REASON_CODE_OPTIONS,
  };

  return (
    <Tabs defaultValue="daily">
      <TabsList className="-mx-1 h-auto w-[calc(100%+0.5rem)] justify-start overflow-x-auto px-1 py-1 sm:mx-0 sm:w-full">
        <TabsTrigger value="daily" className="min-h-9 shrink-0 whitespace-nowrap">
          Daily Attendance
        </TabsTrigger>
        <TabsTrigger value="late" className="min-h-9 shrink-0 whitespace-nowrap">
          Late Arrivals
        </TabsTrigger>
        <TabsTrigger value="early" className="min-h-9 shrink-0 whitespace-nowrap">
          Early Departures
        </TabsTrigger>
        <TabsTrigger value="absent" className="min-h-9 shrink-0 whitespace-nowrap">
          Absenteeism
        </TabsTrigger>
        <TabsTrigger value="monthly" className="min-h-9 shrink-0 whitespace-nowrap">
          Monthly Summary
        </TabsTrigger>
        <TabsTrigger value="exceptions" className="min-h-9 shrink-0 whitespace-nowrap">
          Exceptions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="daily" className="mt-4">
        <div className="space-y-4">
          <ReportShell
            title="Daily Attendance"
            description="Day-wise attendance with in/out times and worked hours."
            facets={{
              ...attendanceFacets,
              showStatus: true,
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
              {
                label: "Geo",
                value: sourceCounts.geo,
                tone: "info",
              },
              {
                label: "Manual",
                value: sourceCounts.manual,
                tone: "default",
              },
            ]}
            build={(f) => baseFilter(all, f)}
            columns={cols}
            searchKeys={["employee", "department"]}
            exportName="daily-attendance"
            exportMode="daily"
            onRowClick={setSelectedAttendanceRow}
          />
          <OfflineEvidenceDetail row={selectedAttendanceRow} query={selectedDailyQuery} />
        </div>
      </TabsContent>

      <TabsContent value="late" className="mt-4">
        <ReportShell
          title="Late Arrivals"
          description="Employees who clocked in after 09:15."
          facets={attendanceFacets}
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
          exportMode="late"
        />
      </TabsContent>

      <TabsContent value="early" className="mt-4">
        <ReportShell
          title="Early Departures"
          description="Employees who logged off before 17:30."
          facets={attendanceFacets}
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
          exportMode="early"
        />
      </TabsContent>

      <TabsContent value="absent" className="mt-4">
        <ReportShell
          title="Absenteeism Report"
          description="Unplanned absences without leave approval."
          facets={attendanceFacets}
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
          exportMode="absent"
        />
      </TabsContent>

      <TabsContent value="monthly" className="mt-4">
        <MonthlySummary
          all={all}
          filters={filters}
          onFiltersChange={setFilters}
          baseFilter={baseFilter}
          facets={attendanceFacets}
        />
      </TabsContent>

      <TabsContent value="exceptions" className="mt-4">
        <ReportShell
          title="Attendance Exceptions"
          description="Late arrivals, missed punches and partial days."
          facets={attendanceFacets}
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
          exportMode="exceptions"
        />
      </TabsContent>
    </Tabs>
  );
}

function OfflineEvidenceDetail({
  row,
  query,
}: {
  row: AttRow | null;
  query: {
    data?: unknown;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
  };
}) {
  if (!row || !row.employeeUserId) return null;
  if (query.isLoading) {
    return (
      <DataCard
        title="Offline / provisional evidence"
        description={`${row.employee} - ${row.date}`}
      >
        <p className="text-sm text-muted-foreground">Loading offline evidence...</p>
      </DataCard>
    );
  }
  if (query.isError) {
    return (
      <DataCard
        title="Offline / provisional evidence"
        description={`${row.employee} - ${row.date}`}
      >
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Offline evidence could not load."}
        </p>
      </DataCard>
    );
  }

  const evidence = offlineEvidenceFromDaily(query.data);
  const warnings = mobileEvidenceWarningsFromDaily(query.data);
  if (evidence.length === 0 && warnings.length === 0) return null;

  return (
    <DataCard title="Mobile evidence details" description={`${row.employee} - ${row.date}`}>
      <div className="space-y-4">
        {evidence.length > 0 && (
          <section className="space-y-2" data-testid="manager-offline-evidence">
            <div>
              <h3 className="text-sm font-semibold">Offline / provisional evidence</h3>
              <p className="text-xs text-muted-foreground">
                Offline sync visibility is informational and not payroll-final.
              </p>
            </div>
            {evidence.map((item) => (
              <div key={item.key} className="rounded-md border border-border/70 p-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-medium">
                      {item.eventLabel} · Mobile - captured offline
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This offline evidence is not payroll-final.
                    </p>
                  </div>
                  <StatusBadge
                    status={item.badgeStatus}
                    label={item.verificationLabel}
                    className="w-fit max-w-full whitespace-normal break-words sm:shrink-0"
                  />
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <EvidenceFact label="Captured offline" value={item.capturedLabel} />
                  <EvidenceFact label="Received by server" value={item.serverReceivedLabel} />
                  <EvidenceFact label="Sync state" value={item.syncLabel} />
                  {item.reason && <EvidenceFact label="Reason" value={item.reason} />}
                </div>
                {item.reasonCode && (
                  <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">
                    Reason code: {item.reasonCode}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
        {warnings.length > 0 && (
          <section className="space-y-2" data-testid="manager-mobile-evidence-warnings">
            <div>
              <h3 className="text-sm font-semibold">Mobile integrity / device evidence</h3>
              <p className="text-xs text-muted-foreground">
                Rejected attempts and replay conflicts are shown without device IDs or coordinates.
              </p>
            </div>
            {warnings.map((item) => (
              <div key={item.key} className="rounded-md border border-border/70 p-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-medium">
                      {item.eventLabel} · {item.categoryLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.sourceLabel}</p>
                  </div>
                  <StatusBadge
                    status={item.badgeStatus}
                    label={item.statusLabel}
                    className="w-fit max-w-full whitespace-normal break-words sm:shrink-0"
                  />
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <EvidenceFact label="Captured" value={item.capturedLabel} />
                  <EvidenceFact label="Received by server" value={item.serverReceivedLabel} />
                  {item.workModeLabel && (
                    <EvidenceFact label="Work mode" value={item.workModeLabel} />
                  )}
                  <EvidenceFact label="Reason" value={item.reason} />
                </div>
                <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">
                  Reason code: {item.reasonCode}
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
    </DataCard>
  );
}

interface OfflineEvidenceDisplay {
  key: string;
  eventLabel: string;
  capturedLabel: string;
  serverReceivedLabel: string;
  syncLabel: string;
  verificationLabel: string;
  badgeStatus: string;
  reasonCode: string | null;
  reason: string | null;
}

interface MobileEvidenceWarningDisplay {
  key: string;
  eventLabel: string;
  categoryLabel: string;
  statusLabel: string;
  badgeStatus: string;
  sourceLabel: string;
  workModeLabel: string | null;
  capturedLabel: string;
  serverReceivedLabel: string;
  reasonCode: string;
  reason: string;
}

function offlineEvidenceFromDaily(value: unknown): OfflineEvidenceDisplay[] {
  const item = asArray(asRecord(value).items).map(asRecord)[0];
  return asArray(item?.offline_evidence).map((entry, index) => {
    const record = asRecord(entry);
    const offline = asRecord(record.offline);
    const verificationStatus = safeToken(offline.verification_status);
    const syncStatus = safeToken(offline.sync_status);
    const reasonCode = nullableText(offline.reason_code);
    return {
      key: `${text(record.occurred_at, "offline")}:${index}`,
      eventLabel: eventLabel(text(record.event_type)),
      capturedLabel: formatDateTime(text(record.occurred_at)),
      serverReceivedLabel: formatDateTime(text(offline.server_received_at)),
      syncLabel: syncLabel(syncStatus),
      verificationLabel: verificationLabel(verificationStatus),
      badgeStatus: verificationBadgeStatus(verificationStatus),
      reasonCode,
      reason: nullableText(offline.reason) ?? (reasonCode ? offlineReason(reasonCode) : null),
    };
  });
}

function mobileEvidenceWarningsFromDaily(value: unknown): MobileEvidenceWarningDisplay[] {
  const item = asArray(asRecord(value).items).map(asRecord)[0];
  return asArray(item?.mobile_evidence_warnings).map((entry, index) => {
    const record = asRecord(entry);
    const reasonCode = text(record.reason_code);
    const status = safeToken(record.evidence_status);
    const category = safeToken(record.category);
    const source = safeToken(record.source);
    return {
      key: `${text(record.server_received_at, "warning")}:${index}`,
      eventLabel: eventLabel(text(record.event_type)),
      categoryLabel: mobileWarningCategoryLabel(category),
      statusLabel: mobileWarningStatusLabel(status),
      badgeStatus: mobileWarningBadgeStatus(status),
      sourceLabel: sourceLabel(source),
      workModeLabel: nullableText(record.work_mode) ? humanize(text(record.work_mode)) : null,
      capturedLabel: nullableText(record.captured_at)
        ? formatDateTime(text(record.captured_at))
        : "Capture time unavailable",
      serverReceivedLabel: formatDateTime(text(record.server_received_at)),
      reasonCode,
      reason: nullableText(record.reason) ?? mobileWarningReason(reasonCode),
    };
  });
}

function EvidenceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 px-2 py-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-semibold">{value}</p>
    </div>
  );
}

function ValueList({
  values,
  fallback = "—",
  mono = false,
}: {
  values: string[];
  fallback?: string;
  mono?: boolean;
}) {
  if (values.length === 0) {
    return <span className="text-sm text-muted-foreground">{fallback}</span>;
  }
  return (
    <span className={mono ? "break-words font-mono text-xs" : "break-words text-sm"}>
      {values.join("; ")}
    </span>
  );
}

function SiteCell({ row }: { row: AttRow }) {
  if (row.workSiteName.length === 0 && row.workSiteType.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      <ValueList values={row.workSiteName} />
      {row.workSiteType.length > 0 && (
        <p className="break-words text-xs text-muted-foreground">
          {row.workSiteType.map(humanize).join("; ")}
        </p>
      )}
    </div>
  );
}

function GeoCell({ row }: { row: AttRow }) {
  if (row.geoOutcome.length === 0 && row.geoAction.length === 0 && row.reasonCodes.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      <ValueList values={row.geoOutcome.map(humanize)} />
      {row.geoAction.length > 0 && (
        <p className="break-words text-xs text-muted-foreground">
          {row.geoAction.map(humanize).join("; ")}
        </p>
      )}
      {row.reasonCodes.length > 0 && <ValueList values={row.reasonCodes} mono />}
    </div>
  );
}

function ReviewCell({ row }: { row: AttRow }) {
  if (!row.reviewRequired && row.reviewOutcome.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="min-w-0 space-y-1 text-sm">
      {row.reviewRequired && (
        <StatusBadge
          status="review_required"
          label="Required"
          className="max-w-full whitespace-normal break-words"
        />
      )}
      {row.reviewOutcome.length > 0 && (
        <p className="break-words text-xs text-muted-foreground">
          {row.reviewOutcome.map(humanize).join("; ")}
        </p>
      )}
    </div>
  );
}

function attendanceFromApi(value: unknown): AttRow {
  const record = asRecord(value);
  return {
    id: text(record.id),
    employeeUserId: text(record.employee_user_id),
    date: text(record.date),
    employee: text(record.employee),
    department: text(record.department, "—"),
    status: text(record.status, "present") as AttRow["status"],
    reportingEvidenceCategory: reportingEvidenceCategory(record.reporting_evidence_category),
    attendanceChannels: stringList(record.attendance_channels),
    sourceCategories: stringList(record.source_categories),
    workSiteId: stringList(record.work_site_id),
    workSiteName: stringList(record.work_site_name),
    workSiteType: stringList(record.work_site_type),
    approvalState: text(record.approval_state, "not_required"),
    geoOutcome: stringList(record.geo_outcome),
    geoAction: stringList(record.geo_action),
    reviewType: stringList(record.review_type),
    reasonCodes: stringList(record.reason_codes),
    reviewRequired: Boolean(record.review_required),
    reviewOutcome: stringList(record.review_outcome),
    inTime: text(record.in_time),
    outTime: text(record.out_time),
    hours: numberValue(record.hours),
    note: text(record.note),
  };
}

function stringList(value: unknown): string[] {
  const source =
    Array.isArray(value) && value.length > 0
      ? asArray(value)
      : typeof value === "string"
        ? value.split(";")
        : [];
  return Array.from(new Set(source.map((item) => text(item).trim()).filter(Boolean)));
}

function reportingEvidenceCategory(value: unknown): AttendanceReportingEvidenceCategory | null {
  return ATTENDANCE_REPORTING_EVIDENCE_OPTIONS.some((option) => option.value === value)
    ? (value as AttendanceReportingEvidenceCategory)
    : null;
}

function eventLabel(value: string): string {
  if (value === "check_in") return "Check-in";
  if (value === "break_start") return "Break start";
  if (value === "break_end") return "Break end";
  if (value === "check_out") return "Check-out";
  return humanize(value) || "Attendance event";
}

function verificationLabel(value: string): string {
  if (value === "review_required") return "Review required";
  if (value === "rejected") return "Rejected";
  return "Provisional";
}

function verificationBadgeStatus(value: string): string {
  if (value === "review_required") return "review_required";
  if (value === "rejected") return "rejected";
  return "provisional";
}

function syncLabel(value: string): string {
  if (value === "accepted") return "Synced";
  if (value === "deferred") return "Deferred";
  if (value === "replayed") return "Already synced";
  if (value === "conflict") return "Conflict";
  if (value === "rejected") return "Sync rejected";
  return humanize(value) || "Sync status unavailable";
}

function offlineReason(reasonCode: string): string {
  if (reasonCode === "offline_sync.accepted_unverified") {
    return "Offline attendance evidence was received and is awaiting verification.";
  }
  if (reasonCode === "offline_sync.sequence_gap") {
    return "Offline attendance evidence was received out of sequence and requires review.";
  }
  if (reasonCode === "offline_sync.sequence_out_of_order") {
    return "Offline attendance evidence arrived out of order and requires review.";
  }
  if (reasonCode === "offline_sync.review_required") {
    return "Offline attendance evidence requires review because verification could not be completed.";
  }
  if (reasonCode === "offline_sync.processing_deferred") {
    return "Offline attendance evidence was deferred for review.";
  }
  if (reasonCode === "offline_sync.validation_failed") {
    return "Offline attendance evidence could not be validated.";
  }
  if (reasonCode === "offline_sync.changed_body_conflict") {
    return "Offline attendance evidence conflicted with a previously received event.";
  }
  if (reasonCode === "offline_sync.duplicate_sequence") {
    return "Offline attendance evidence reused a device sequence and was not accepted.";
  }
  if (reasonCode === "offline_sync.replayed") {
    return "Offline attendance evidence was already synced.";
  }
  return "Offline attendance evidence was received.";
}

function mobileWarningCategoryLabel(value: string): string {
  if (value === "replay_warning") return "Replay integrity warning";
  if (value === "device_eligibility") return "Device eligibility warning";
  return humanize(value) || "Mobile warning";
}

function mobileWarningStatusLabel(value: string): string {
  if (value === "integrity_conflict") return "Integrity conflict";
  if (value === "duplicate_sequence") return "Duplicate sequence";
  if (value === "registered_device_required") return "Device required";
  if (value === "device_revoked") return "Device revoked";
  if (value === "device_suspended") return "Device suspended";
  if (value === "device_unavailable") return "Device unavailable";
  return humanize(value) || "Warning";
}

function mobileWarningBadgeStatus(value: string): string {
  if (
    value === "device_revoked" ||
    value === "device_suspended" ||
    value === "device_unavailable" ||
    value === "registered_device_required"
  ) {
    return "rejected";
  }
  return "warning";
}

function mobileWarningReason(reasonCode: string): string {
  if (reasonCode === "mobile_replay.changed_body_conflict") {
    return "The same mobile attendance event was retried with changed request content.";
  }
  if (reasonCode === "offline_sync.changed_body_conflict") {
    return "The same offline event was submitted again with different content.";
  }
  if (reasonCode === "offline_sync.duplicate_sequence") {
    return "A device sequence value was reused by another offline event.";
  }
  if (reasonCode === "mobile_registered_device_required") {
    return "Attendance was attempted without a registered mobile device.";
  }
  if (reasonCode === "mobile_registered_device_revoked") {
    return "Attendance was attempted from a revoked registered device.";
  }
  if (reasonCode === "mobile_registered_device_suspended") {
    return "Attendance was attempted from a suspended registered device.";
  }
  if (reasonCode === "mobile_registered_device_unavailable") {
    return "Attendance was attempted from a registered device that is unavailable for this employee.";
  }
  return "Mobile evidence requires review.";
}

function sourceLabel(value: string): string {
  if (value === "mobile_offline") return "Mobile - offline sync";
  if (value === "mobile_foreground") return "Mobile - foreground";
  if (value === "mobile") return "Mobile";
  return humanize(value) || "Mobile evidence";
}

function nullableText(value: unknown): string | null {
  const parsed = text(value).trim();
  return parsed || null;
}

function safeToken(value: unknown): string {
  return text(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/gu, "")
    .slice(0, 80);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "Time unavailable";
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanize(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
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
  if (filters.sourceCategory !== "all") params.source_category = filters.sourceCategory;
  if (filters.siteId !== "all") params.work_site_id = filters.siteId;
  if (filters.approvalState !== "all") params.approval_state = filters.approvalState;
  if (filters.geoOutcome !== "all") params.geo_outcome = filters.geoOutcome;
  if (filters.reviewType !== "all")
    params.review_type = filters.reviewType as ReportParams["review_type"];
  if (filters.reasonCode !== "all") params.reason_code = filters.reasonCode;
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

function sourceCategoryCounts(value: unknown, rows: AttRow[]) {
  const record = asRecord(value);
  const categories = ["web", "geo", "mobile", "manual", "kiosk", "system"] as const;
  if (Object.keys(record).length > 0) {
    return Object.fromEntries(
      categories.map((category) => [category, numberValue(record[category])]),
    ) as Record<(typeof categories)[number], number>;
  }
  return Object.fromEntries(
    categories.map((category) => [
      category,
      rows.filter((row) => row.sourceCategories.includes(category)).length,
    ]),
  ) as Record<(typeof categories)[number], number>;
}

function siteOptionsFromReport(
  value: unknown,
  rows: AttRow[],
): Array<{ value: string; label: string }> {
  const apiOptions = asArray(value)
    .map(asRecord)
    .map((record) => {
      const id = text(record.id).trim();
      const label = text(record.label, id).trim();
      const typeLabel = nullableText(record.type);
      return id
        ? {
            value: id,
            label: typeLabel ? `${label} (${humanize(typeLabel)})` : label,
          }
        : null;
    })
    .filter((option): option is { value: string; label: string } => Boolean(option));
  if (apiOptions.length > 0) return apiOptions;

  const options = new Map<string, string>();
  for (const row of rows) {
    row.workSiteId.forEach((id, index) => {
      if (!id || options.has(id)) return;
      const label = row.workSiteName[index] ?? row.workSiteName[0] ?? id;
      const typeLabel =
        row.workSiteType[index] ?? (row.workSiteType.length === 1 ? row.workSiteType[0] : "");
      options.set(id, typeLabel ? `${label} (${humanize(typeLabel)})` : label);
    });
  }
  return [...options.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function AttendancePercentage({ value }: { value: number }) {
  const isLowAttendance = value < 80;

  return (
    <span
      aria-label={`${value}% attendance`}
      className="inline-flex items-center gap-1.5 font-mono font-semibold text-foreground"
      data-testid={
        isLowAttendance
          ? "attendance-monthly-percentage-destructive"
          : "attendance-monthly-percentage-success"
      }
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${isLowAttendance ? "bg-destructive" : "bg-success"}`}
      />
      {value}%
    </span>
  );
}

function MonthlySummary({
  all,
  filters,
  onFiltersChange,
  baseFilter,
  facets,
}: {
  all: AttRow[];
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  baseFilter: (rows: AttRow[], filters: ReportFilters) => AttRow[];
  facets: FacetOptions;
}) {
  const summary = useMemo(() => {
    const m = new Map<
      string,
      { present: number; late: number; absent: number; wfh: number; leave: number; total: number }
    >();
    for (const r of baseFilter(all, filters)) {
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
  }, [all, baseFilter, filters]);

  return (
    <ReportShell
      title="Monthly Attendance Summary"
      description="Per-employee attendance percentage over the last 30 days."
      facets={facets}
      filters={filters}
      onFiltersChange={onFiltersChange}
      build={() => summary}
      columns={[
        {
          key: "employee",
          header: "Employee",
          render: (r) => <span className="break-words font-medium">{r.employee}</span>,
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
          render: (r) => <AttendancePercentage value={r.attendance} />,
        },
      ]}
      searchKeys={["employee"]}
      exportName="monthly-attendance"
      exportMode="monthly_summary"
    />
  );
}

interface MonthlySummaryRow {
  id: string;
  employee: string;
  present: number;
  late: number;
  absent: number;
  wfh: number;
  leave: number;
  total: number;
  attendance: number;
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
