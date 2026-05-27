import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mapApiSubmission, mapApiWorkSegment, timesheetsApi } from "@/domains/timesheets";
import { useAuth } from "@/lib/auth";
import { useEmployees } from "@/lib/employees-store";
import { useProjects } from "@/lib/projects-store";
import {
  asRecord,
  isUuid,
  pageItems,
  text,
  useApiRouteEnabled,
  withApiFallback,
} from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  TIMESHEET_ENTRIES,
  TIMESHEET_WEEKS,
  isoDate,
  startOfWeek,
  type TimesheetEntry,
  type TimesheetWeek,
  type TimesheetEntryStatus,
} from "./mock/timesheets";

const ENT_KEY = "hawkaii_timesheet_entries_v1";
const WK_KEY = "hawkaii_timesheet_weeks_v1";

interface Ctx {
  entries: TimesheetEntry[];
  weeks: TimesheetWeek[];
  loading: boolean;
  error: Error | null;
  isApiBacked: boolean;
  addEntry: (e: Omit<TimesheetEntry, "id">) => TimesheetEntry;
  saveWeekEntries: (
    entries: Array<Omit<TimesheetEntry, "id">>,
    scope?: { employeeId: string; weekStart: string },
  ) => Promise<void>;
  updateEntry: (id: string, patch: Partial<TimesheetEntry>) => void;
  removeEntry: (id: string) => void;
  ensureWeek: (
    employeeId: string,
    employeeName: string,
    department: string,
    weekStart: string,
  ) => TimesheetWeek;
  setWeekStatus: (
    weekId: string,
    status: TimesheetEntryStatus,
    decidedBy?: string,
    remarks?: string,
  ) => Promise<void>;
  reset: () => void;
}

const Ctx = React.createContext<Ctx | null>(null);

function load<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(v));
}

function cycleEnd(weekStart: string): string {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
}

function weekStartForDate(date: string): string {
  return isoDate(startOfWeek(new Date(`${date.slice(0, 10)}T00:00:00.000Z`)));
}

function workSegmentBody(entry: TimesheetEntry) {
  return {
    work_date: entry.date,
    project_code: entry.projectCode,
    task_code: entry.task,
    hours: entry.hours.toFixed(2),
    description: entry.description,
    billable: entry.billable,
  };
}

function decisionForStatus(status: TimesheetEntryStatus): "approve" | "reject" | "return" {
  if (status === "returned") return "return";
  if (status === "rejected") return "reject";
  return "approve";
}

export function TimesheetsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user, activeRole } = useAuth();
  const { employees } = useEmployees();
  const { projects } = useProjects();
  const apiEnabled = useApiRouteEnabled(["/dashboard", "/timesheet", "/reports"]);
  const canLoadApprovalQueue =
    activeRole === "main_admin" ||
    activeRole === "hr_admin" ||
    activeRole === "manager" ||
    activeRole === "project_manager";
  const [entries, setEntries] = React.useState<TimesheetEntry[]>(TIMESHEET_ENTRIES);
  const [weeks, setWeeks] = React.useState<TimesheetWeek[]>(TIMESHEET_WEEKS);

  React.useEffect(() => {
    setEntries(load(ENT_KEY, TIMESHEET_ENTRIES));
    setWeeks(load(WK_KEY, TIMESHEET_WEEKS));
  }, []);

  const persistEntries = (next: TimesheetEntry[]) => {
    setEntries(next);
    save(ENT_KEY, next);
  };
  const persistWeeks = (next: TimesheetWeek[]) => {
    setWeeks(next);
    save(WK_KEY, next);
  };

  const currentEmployee = React.useMemo(
    () =>
      employees.find((employee) => employee.email === user?.email) ??
      employees.find((employee) => employee.id === "EMP-1042") ??
      employees[0],
    [employees, user],
  );

  const employeeForApiUserId = React.useCallback(
    (apiUserId: string) =>
      employees.find((employee) => employee.apiId === apiUserId || employee.id === apiUserId),
    [employees],
  );

  const fallbackForWorkSegment = React.useCallback(
    (value: unknown): Partial<TimesheetEntry> => {
      const row = asRecord(value);
      const workDate = text(row.work_date ?? row.date, new Date().toISOString()).slice(0, 10);
      const employee =
        employeeForApiUserId(text(row.employee_user_id ?? row.user_id)) ?? currentEmployee;
      const projectCode = text(row.project_code, "PROJECT");
      const project = projects.find(
        (candidate) => candidate.code === projectCode || candidate.id === projectCode,
      );
      return {
        employeeId: employee?.id ?? text(row.employee_user_id, "self"),
        employeeName: employee?.name ?? "Employee",
        weekStart: weekStartForDate(workDate),
        date: workDate,
        projectId: project?.id ?? projectCode,
        projectCode,
        projectName: project?.name ?? projectCode,
        task: text(row.task_code, "General"),
      };
    },
    [currentEmployee, employeeForApiUserId, projects],
  );

  const fallbackForSubmission = React.useCallback(
    (value: unknown): Partial<TimesheetWeek> => {
      const row = asRecord(value);
      const employeeSummary = asRecord(row.employee ?? row.member);
      const employee =
        employees.find(
          (candidate) =>
            candidate.id === text(employeeSummary.employee_code) ||
            candidate.apiId === text(row.employee_user_id) ||
            candidate.email === text(employeeSummary.email),
        ) ?? employeeForApiUserId(text(row.employee_user_id));
      const department = asRecord(employeeSummary.department);
      return {
        employeeId:
          employee?.id ?? text(employeeSummary.employee_code ?? row.employee_user_id, "self"),
        employeeName: employee?.name ?? text(employeeSummary.full_name, "Employee"),
        department: employee?.department ?? text(department.name, "General"),
      };
    },
    [employeeForApiUserId, employees],
  );

  const replaceLocalWeekEntries = (
    nextEntries: TimesheetEntry[],
    scope?: { employeeId: string; weekStart: string },
  ) => {
    const first = nextEntries[0];
    const employeeId = first?.employeeId ?? scope?.employeeId;
    const weekStart = first?.weekStart ?? scope?.weekStart;
    if (!employeeId || !weekStart) return;
    persistEntries([
      ...nextEntries,
      ...entries.filter(
        (entry) => entry.employeeId !== employeeId || entry.weekStart !== weekStart,
      ),
    ]);
  };

  const apiEntriesQuery = useQuery({
    queryKey: queryKeys.list("timesheets", "work-segments", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await timesheetsApi.listWorkSegments({ page_size: 100 });
          return pageItems(response).map((item) =>
            mapApiWorkSegment(item, fallbackForWorkSegment(item)),
          );
        },
        () => entries,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const apiWeeksQuery = useQuery({
    queryKey: queryKeys.list("timesheets", "my-submissions", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await timesheetsApi.listMySubmissions({ page_size: 100 });
          return pageItems(response).map((item) =>
            mapApiSubmission(item, fallbackForSubmission(item)),
          );
        },
        () => weeks,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const apiApprovalQueueQuery = useQuery({
    queryKey: queryKeys.list("timesheets", "approver-queue", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await timesheetsApi.approverQueue({ page_size: 100 });
          return pageItems(response).map((item) =>
            mapApiSubmission(item, fallbackForSubmission(item)),
          );
        },
        () => weeks.filter((week) => week.status === "pending" || week.status === "submitted"),
      ),
    enabled: apiEnabled && canLoadApprovalQueue,
    staleTime: queryTimings.listStaleMs,
  });

  const createSegmentMutation = useMutation({
    mutationFn: (entry: TimesheetEntry) => timesheetsApi.createWorkSegment(workSegmentBody(entry)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("timesheets") }),
  });

  const createSubmissionMutation = useMutation({
    mutationFn: (week: TimesheetWeek) =>
      timesheetsApi.createSubmission({
        cycle_start: week.weekStart,
        cycle_end: cycleEnd(week.weekStart),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("timesheets") }),
  });

  const decisionMutation = useMutation({
    mutationFn: ({
      weekId,
      status,
      remarks,
      expectedVersion,
    }: {
      weekId: string;
      status: TimesheetEntryStatus;
      remarks?: string;
      expectedVersion: number;
    }) =>
      timesheetsApi.decideSubmission(weekId, {
        decision: decisionForStatus(status),
        remarks,
        expected_version: expectedVersion,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("timesheets") }),
  });

  const hasApiEntriesResult = apiEntriesQuery.data !== undefined;
  const hasApiWeeksResult = apiWeeksQuery.data !== undefined;
  const hasApiQueueResult = !canLoadApprovalQueue || apiApprovalQueueQuery.data !== undefined;
  const visibleEntries = React.useMemo(() => {
    if (!apiEnabled) return entries;
    if (!hasApiEntriesResult) return [];
    return apiEntriesQuery.data ?? [];
  }, [apiEnabled, apiEntriesQuery.data, entries, hasApiEntriesResult]);
  const visibleWeeks = React.useMemo(() => {
    if (!apiEnabled) return weeks;
    if (!hasApiWeeksResult && !hasApiQueueResult) return [];
    const byId = new Map<string, TimesheetWeek>();
    const queueWeeks = canLoadApprovalQueue ? (apiApprovalQueueQuery.data ?? []) : [];
    for (const week of [...(apiWeeksQuery.data ?? []), ...queueWeeks]) {
      byId.set(week.id, week);
    }
    return Array.from(byId.values());
  }, [
    apiApprovalQueueQuery.data,
    canLoadApprovalQueue,
    apiEnabled,
    apiWeeksQuery.data,
    hasApiQueueResult,
    hasApiWeeksResult,
    weeks,
  ]);

  const loading =
    apiEnabled &&
    ((!hasApiEntriesResult && apiEntriesQuery.isLoading) ||
      (!hasApiWeeksResult && apiWeeksQuery.isLoading) ||
      (canLoadApprovalQueue && !hasApiQueueResult && apiApprovalQueueQuery.isLoading));
  const apiError =
    apiEntriesQuery.error instanceof Error
      ? apiEntriesQuery.error
      : apiWeeksQuery.error instanceof Error
        ? apiWeeksQuery.error
        : canLoadApprovalQueue && apiApprovalQueueQuery.error instanceof Error
          ? apiApprovalQueueQuery.error
          : null;
  const isApiBacked =
    apiEnabled &&
    (hasApiEntriesResult || hasApiWeeksResult || (canLoadApprovalQueue && hasApiQueueResult));

  const addEntry: Ctx["addEntry"] = (e) => {
    const id = "te_" + Math.random().toString(36).slice(2, 10);
    const created: TimesheetEntry = { ...e, id };
    persistEntries([created, ...entries]);
    if (apiEnabled) createSegmentMutation.mutate(created);
    return created;
  };

  const saveWeekEntries: Ctx["saveWeekEntries"] = async (inputEntries, scope) => {
    const created = inputEntries.map((entry) => ({
      ...entry,
      id: "te_" + Math.random().toString(36).slice(2, 10),
    }));
    const persistLocal = () => {
      replaceLocalWeekEntries(created, scope);
    };

    if (!apiEnabled) {
      persistLocal();
      return;
    }

    await withApiFallback(
      async () => {
        for (const entry of created) {
          await createSegmentMutation.mutateAsync(entry);
        }
      },
      () => {
        persistLocal();
      },
    );
  };

  const updateEntry: Ctx["updateEntry"] = (id, patch) =>
    persistEntries(entries.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeEntry: Ctx["removeEntry"] = (id) =>
    persistEntries(entries.filter((x) => x.id !== id));

  const ensureWeek: Ctx["ensureWeek"] = (employeeId, employeeName, department, weekStart) => {
    const source = apiEnabled ? visibleWeeks : weeks;
    const found = source.find((w) => w.employeeId === employeeId && w.weekStart === weekStart);
    if (found) return found;
    const created: TimesheetWeek = {
      id: `tw_${employeeId}_${weekStart}`,
      employeeId,
      employeeName,
      department,
      weekStart,
      status: "draft",
    };
    if (apiEnabled) return created;
    persistWeeks([created, ...weeks]);
    return created;
  };

  const setWeekStatus: Ctx["setWeekStatus"] = async (weekId, status, decidedBy, remarks) => {
    const week =
      visibleWeeks.find((item) => item.id === weekId) ?? weeks.find((item) => item.id === weekId);
    const inferredWeekStart = weekId.match(/_(\d{4}-\d{2}-\d{2})$/u)?.[1];
    const applyLocal = () => {
      const patchWeek = (w: TimesheetWeek): TimesheetWeek => ({
        ...w,
        status,
        ...(status === "submitted" || status === "pending"
          ? { submittedAt: new Date().toISOString() }
          : {}),
        ...(status === "approved" || status === "rejected" || status === "returned"
          ? { decidedAt: new Date().toISOString(), decidedBy, remarks }
          : {}),
      });
      if (!weeks.some((w) => w.id === weekId) && week) {
        persistWeeks([patchWeek(week), ...weeks]);
        return;
      }
      persistWeeks(weeks.map((w) => (w.id === weekId ? patchWeek(w) : w)));
    };

    if (!apiEnabled) {
      applyLocal();
      return;
    }

    await withApiFallback(
      async () => {
        if (status === "submitted" || status === "pending") {
          const submissionWeek =
            week ??
            (inferredWeekStart
              ? ({
                  id: weekId,
                  employeeId: "self",
                  employeeName: "Employee",
                  department: "General",
                  weekStart: inferredWeekStart,
                  status: "draft",
                } satisfies TimesheetWeek)
              : null);
          if (submissionWeek) await createSubmissionMutation.mutateAsync(submissionWeek);
          return;
        }
        if (isUuid(weekId) && ["approved", "rejected", "returned"].includes(status)) {
          await decisionMutation.mutateAsync({
            weekId,
            status,
            remarks,
            expectedVersion: week?.version ?? 1,
          });
        }
      },
      () => {
        applyLocal();
      },
    );
  };

  const reset = () => {
    persistEntries(TIMESHEET_ENTRIES);
    persistWeeks(TIMESHEET_WEEKS);
  };

  return (
    <Ctx.Provider
      value={{
        entries: visibleEntries,
        weeks: visibleWeeks,
        loading,
        error: apiError,
        isApiBacked,
        addEntry,
        saveWeekEntries,
        updateEntry,
        removeEntry,
        ensureWeek,
        setWeekStatus,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTimesheets() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useTimesheets must be used within TimesheetsProvider");
  return c;
}
