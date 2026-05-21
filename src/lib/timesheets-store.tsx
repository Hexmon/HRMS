import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mapApiSubmissions, mapApiWorkSegments, timesheetsApi } from "@/domains/timesheets";
import { isUuid, pageItems, useApiRouteEnabled, withApiFallback } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  TIMESHEET_ENTRIES,
  TIMESHEET_WEEKS,
  type TimesheetEntry,
  type TimesheetWeek,
  type TimesheetEntryStatus,
} from "./mock/timesheets";

const ENT_KEY = "hawkaii_timesheet_entries_v1";
const WK_KEY = "hawkaii_timesheet_weeks_v1";

interface Ctx {
  entries: TimesheetEntry[];
  weeks: TimesheetWeek[];
  addEntry: (e: Omit<TimesheetEntry, "id">) => TimesheetEntry;
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
  ) => void;
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

export function TimesheetsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled(["/dashboard", "/timesheet", "/reports"]);
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

  const apiEntriesQuery = useQuery({
    queryKey: queryKeys.list("timesheets", "work-segments", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await timesheetsApi.listWorkSegments({ page_size: 100 });
          return mapApiWorkSegments(pageItems(response), entries);
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
          return mapApiSubmissions(pageItems(response), weeks);
        },
        () => weeks,
      ),
    enabled: apiEnabled,
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
    }: {
      weekId: string;
      status: TimesheetEntryStatus;
      remarks?: string;
    }) =>
      timesheetsApi.approveSubmissionPartial(weekId, {
        decision: status === "returned" ? "return" : status === "rejected" ? "reject" : "approve",
        remarks,
        expected_version: 1,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("timesheets") }),
  });

  const visibleEntries = apiEntriesQuery.data ?? entries;
  const visibleWeeks = apiWeeksQuery.data ?? weeks;

  const addEntry: Ctx["addEntry"] = (e) => {
    const id = "te_" + Math.random().toString(36).slice(2, 10);
    const created: TimesheetEntry = { ...e, id };
    persistEntries([created, ...entries]);
    if (apiEnabled) createSegmentMutation.mutate(created);
    return created;
  };
  const updateEntry: Ctx["updateEntry"] = (id, patch) =>
    persistEntries(entries.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeEntry: Ctx["removeEntry"] = (id) =>
    persistEntries(entries.filter((x) => x.id !== id));

  const ensureWeek: Ctx["ensureWeek"] = (employeeId, employeeName, department, weekStart) => {
    const found = weeks.find((w) => w.employeeId === employeeId && w.weekStart === weekStart);
    if (found) return found;
    const created: TimesheetWeek = {
      id: `tw_${employeeId}_${weekStart}`,
      employeeId,
      employeeName,
      department,
      weekStart,
      status: "draft",
    };
    persistWeeks([created, ...weeks]);
    return created;
  };

  const setWeekStatus: Ctx["setWeekStatus"] = (weekId, status, decidedBy, remarks) => {
    persistWeeks(
      weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              status,
              ...(status === "submitted" || status === "pending"
                ? { submittedAt: new Date().toISOString() }
                : {}),
              ...(status === "approved" || status === "rejected" || status === "returned"
                ? { decidedAt: new Date().toISOString(), decidedBy, remarks }
                : {}),
            }
          : w,
      ),
    );
    const week = visibleWeeks.find((item) => item.id === weekId);
    if (apiEnabled && week && (status === "submitted" || status === "pending")) {
      createSubmissionMutation.mutate(week);
    }
    if (apiEnabled && isUuid(weekId) && ["approved", "rejected", "returned"].includes(status)) {
      decisionMutation.mutate({ weekId, status, remarks });
    }
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
        addEntry,
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
