import { randomUUID } from "node:crypto";
import type {
  AttendanceDayRecord,
  AttendancePunch,
  AttendancePunchEventType,
  AttendanceRegularizationRequest,
  AuthUser,
  CoreUser,
  UUID
} from "#shared";
import {
  AttendanceDayStatuses,
  AttendancePunchEventTypes,
  AttendanceRegularizationStatuses,
  EmploymentStatuses,
  Roles
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, missingRemarks, notFound } from "../../platform/errors.js";
import { CoreService } from "../core/service.js";
import { appendAttendanceOutboxEvent, attendanceEvents } from "./events.js";
import {
  assertCanDecideRegularization,
  assertCanSeeAttendanceUser,
  canSeeAllAttendance,
  canSeeAttendanceUser
} from "./policy.js";
import { AttendanceRepository } from "./repository.js";

export interface AttendancePageQuery {
  page: number;
  page_size: number;
  sort?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  month?: string;
  user_id?: UUID;
  department_id?: UUID;
  status?: string;
  exception_type?: string;
}

export interface AttendanceExportInput {
  filters?: Record<string, unknown>;
  columns?: string[];
  format?: "csv" | "xlsx" | "json";
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateFromIso(value: string): string {
  return value.slice(0, 10);
}

function monthRange(monthInput?: string): { month: string; from: string; to: string } {
  const month = monthInput && /^\d{4}-\d{2}$/u.test(monthInput) ? monthInput : todayDate().slice(0, 7);
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month, from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function dateRange(query: AttendancePageQuery): { from: string; to: string } {
  if (query.month) {
    const range = monthRange(query.month);
    return { from: range.from, to: range.to };
  }
  return {
    from: query.date_from ?? todayDate().slice(0, 7) + "-01",
    to: query.date_to ?? todayDate()
  };
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

function clockIso(workDate: string, hour: number, minute: number): string {
  return `${workDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function minutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function timeText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.slice(11, 16);
}

function userLabel(user: CoreUser | undefined): { employee_code: string; full_name: string } {
  return {
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee"
  };
}

function visibleUserPredicate(actor: AuthUser, user: CoreUser): boolean {
  return !user.deleted_at && canSeeAttendanceUser(actor, user);
}

export class AttendanceService {
  private readonly repository: AttendanceRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AttendanceRepository(store);
    this.core = new CoreService(store);
  }

  punch(
    actor: AuthUser,
    input: {
      event_type: AttendancePunchEventType;
      occurred_at?: string;
      work_mode: "office" | "remote" | "wfh" | "field";
      source: "web" | "mobile" | "kiosk" | "admin";
      metadata: Record<string, unknown>;
    }
  ) {
    const occurredAt = input.occurred_at ?? nowIso();
    const workDate = dateFromIso(occurredAt);
    const dayPunches = this.repository.listPunches(actor.id, workDate, workDate);
    const allowed = this.nextAllowedActions(dayPunches);
    if (!allowed.includes(input.event_type)) {
      throw conflict("Attendance punch is duplicate or out of sequence.", {
        next_allowed_actions: allowed,
        requested_action: input.event_type
      });
    }
    const punch = this.repository.addPunch({
      employee_user_id: actor.id,
      event_type: input.event_type,
      occurred_at: occurredAt,
      work_mode: input.work_mode,
      source: input.source,
      metadata: input.metadata
    });
    const day = this.recomputeDay(actor.id, workDate);
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: punch.id,
      eventType: attendanceEvents.Punched,
      payload: {
        punch_id: punch.id,
        employee_user_id: actor.id,
        event_type: punch.event_type,
        occurred_at: punch.occurred_at,
        work_date: workDate,
        day_status: day.status
      },
      idempotencyKey: `attendance.punched:${punch.id}`
    });
    return {
      punch_id: punch.id,
      punch,
      day_status: this.presentDay(day),
      next_allowed_actions: this.nextAllowedActions(this.repository.listPunches(actor.id, workDate, workDate)),
      next_allowed_action: this.nextAllowedActions(this.repository.listPunches(actor.id, workDate, workDate))[0] ?? null
    };
  }

  listMyPunches(actor: AuthUser, query: AttendancePageQuery) {
    const range = dateRange(query);
    const punches = this.repository.listPunches(actor.id, range.from, range.to).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return page(punches.map((punch) => this.presentPunch(punch)), query.page, query.page_size);
  }

  mySummary(actor: AuthUser, query: AttendancePageQuery) {
    const range = dateRange(query);
    const records = this.recordsForUsers(new Set([actor.id]), range.from, range.to);
    const today = this.getOrSynthesizeDay(actor.id, todayDate());
    const weekRecords = this.weekRecords(actor.id);
    const exceptionHistory = records
      .filter((record) => record.exception_type || record.regularization_status)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
      .slice(0, 10)
      .map((record) => ({
        date: record.work_date,
        reason: this.exceptionDetail(record),
        status: record.regularization_status ?? record.status
      }));
    return {
      generated_at: nowIso(),
      range,
      today: {
        ...this.presentDay(today),
        next_allowed_actions: this.nextAllowedActions(this.repository.listPunches(actor.id, today.work_date, today.work_date)),
        next_allowed_action: this.nextAllowedActions(this.repository.listPunches(actor.id, today.work_date, today.work_date))[0] ?? null
      },
      summary: this.daySummary(records),
      week_records: weekRecords.map((record) => this.presentDay(record)),
      exception_history: exceptionHistory
    };
  }

  teamSummary(actor: AuthUser, query: AttendancePageQuery) {
    const date = query.date_from ?? todayDate();
    const visibleUsers = this.visibleUsers(actor, query.department_id);
    const activeUsers = visibleUsers.filter((user) => user.employment_status === EmploymentStatuses.Active);
    const records = activeUsers.map((user) => this.getOrSynthesizeDay(user.id, date));
    const exceptions = this.exceptions(actor, { ...query, page: 1, page_size: 8, date_from: date, date_to: date }).items;
    return {
      generated_at: nowIso(),
      date,
      totals: this.teamTotals(records, activeUsers.length),
      department_summary: this.departmentSummary(records, activeUsers),
      exceptions
    };
  }

  monthlyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const range = monthRange(query.month);
    const user = query.user_id ? this.requireUser(query.user_id) : this.requireUser(actor.id);
    assertCanSeeAttendanceUser(actor, user);
    const days = new Date(`${range.to}T00:00:00.000Z`).getUTCDate();
    const calendarDays = Array.from({ length: days }, (_, index) => {
      const date = `${range.month}-${String(index + 1).padStart(2, "0")}`;
      return this.presentDay(this.getOrSynthesizeDay(user.id, date));
    });
    return {
      generated_at: nowIso(),
      month: range.month,
      user: userLabel(user),
      calendar_days: calendarDays,
      summary: this.daySummary(calendarDays)
    };
  }

  dailyCalendar(actor: AuthUser, query: AttendancePageQuery) {
    const date = query.date ?? query.date_from ?? todayDate();
    const users = query.user_id ? [this.requireUser(query.user_id)] : this.visibleUsers(actor, query.department_id);
    for (const user of users) {
      assertCanSeeAttendanceUser(actor, user);
    }
    const activeUsers = users.filter((user) => user.employment_status === EmploymentStatuses.Active);
    const userIds = new Set(activeUsers.map((user) => user.id));
    const records = activeUsers.map((user) => this.getOrSynthesizeDay(user.id, date));
    const regularizations = this.repository.listRegularizations({
      userIds,
      dateFrom: date,
      dateTo: date
    });
    const regularizationByUser = new Map(regularizations.map((request) => [request.employee_user_id, request]));
    const items = records
      .map((record) => {
        const user = activeUsers.find((candidate) => candidate.id === record.employee_user_id);
        const request = regularizationByUser.get(record.employee_user_id);
        return {
          ...this.presentDay(record),
          employee: userLabel(user),
          regularization: request ? this.presentRegularization(request) : null,
          regularization_pending: request?.status === AttendanceRegularizationStatuses.Pending,
          can_decide_regularization: Boolean(
            request &&
            request.status === AttendanceRegularizationStatuses.Pending &&
            actor.id !== request.employee_user_id &&
            (canSeeAllAttendance(actor) || request.current_approver_user_id === actor.id)
          )
        };
      })
      .sort((a, b) => a.employee.employee_code.localeCompare(b.employee.employee_code));
    return {
      ...page(items, query.page, query.page_size),
      generated_at: nowIso(),
      date,
      summary: this.daySummary(records),
      exceptions: this.exceptions(actor, { ...query, page: 1, page_size: 20, date_from: date, date_to: date }).items,
      totals: this.teamTotals(records, activeUsers.length)
    };
  }

  createRegularization(
    actor: AuthUser,
    input: {
      work_date: string;
      reason: string;
      requested_punches: Array<{ event_type: AttendancePunchEventType; occurred_at: string }>;
    }
  ) {
    const approver = this.core.resolveImmediateManager(actor.id) ?? this.adminFallback();
    const request = this.repository.addRegularization({
      employee_user_id: actor.id,
      work_date: input.work_date,
      reason: input.reason.trim(),
      requested_punches: input.requested_punches,
      status: AttendanceRegularizationStatuses.Pending,
      current_approver_user_id: approver?.id ?? null
    });
    const day = this.getOrSynthesizeDay(actor.id, input.work_date);
    day.regularization_status = AttendanceRegularizationStatuses.Pending;
    day.updated_at = nowIso();
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: request.id,
      eventType: attendanceEvents.RegularizationSubmitted,
      payload: {
        request_id: request.id,
        employee_user_id: actor.id,
        approver_user_id: request.current_approver_user_id,
        work_date: request.work_date,
        status: request.status
      },
      idempotencyKey: `attendance.regularization.submitted:${request.id}`
    });
    return this.presentRegularization(request);
  }

  myRegularizations(actor: AuthUser, query: AttendancePageQuery) {
    const range = dateRange(query);
    const requests = this.repository.listRegularizations({
      userIds: new Set([actor.id]),
      status: query.status,
      dateFrom: range.from,
      dateTo: range.to
    });
    return page(requests.map((request) => this.presentRegularization(request)), query.page, query.page_size);
  }

  managerRegularizationQueue(actor: AuthUser, query: AttendancePageQuery) {
    if (!canSeeAllAttendance(actor) && !this.hasVisibleSubordinates(actor)) {
      throw forbidden("Only managers, HR, Admin, or Auditor users can read attendance regularization queues.");
    }
    const range = dateRange(query);
    const visibleUsers = this.visibleUsers(actor, query.department_id).filter((user) => user.id !== actor.id);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const scoped = this.repository
      .listRegularizations({ userIds: visibleUserIds, dateFrom: range.from, dateTo: range.to })
      .filter((request) => canSeeAllAttendance(actor) || request.current_approver_user_id === actor.id);
    const status = query.status ?? AttendanceRegularizationStatuses.Pending;
    const filtered = scoped.filter((request) => !status || request.status === status);
    return {
      ...page(filtered.map((request) => this.presentRegularization(request)), query.page, query.page_size),
      queue_counts: this.regularizationQueueCounts(scoped)
    };
  }

  exceptions(actor: AuthUser, query: AttendancePageQuery) {
    const range = {
      from: query.date_from ?? todayDate().slice(0, 7) + "-01",
      to: query.date_to ?? todayDate()
    };
    const visibleUsers = this.visibleUsers(actor, query.department_id);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const regularizations = this.repository.listRegularizations({
      userIds: visibleUserIds,
      status: AttendanceRegularizationStatuses.Pending,
      dateFrom: range.from,
      dateTo: range.to
    });
    const regularizationByUserDate = new Map(
      regularizations.map((request) => [`${request.employee_user_id}:${request.work_date}`, request])
    );
    const dayExceptions = this.repository
      .listDayRecords({ userIds: visibleUserIds, dateFrom: range.from, dateTo: range.to })
      .filter((record) => record.exception_type || record.regularization_status === AttendanceRegularizationStatuses.Pending)
      .map((record) => this.presentException(record, regularizationByUserDate.get(`${record.employee_user_id}:${record.work_date}`), actor));
    const requestExceptions = regularizations
      .filter((request) => !dayExceptions.some((exception) => exception.request_id === request.id))
      .map((request) => this.presentException(this.getOrSynthesizeDay(request.employee_user_id, request.work_date), request, actor));
    const items = [...dayExceptions, ...requestExceptions]
      .filter((exception) => !query.exception_type || exception.exception_type === query.exception_type)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const result = page(items, query.page, query.page_size);
    return {
      ...result,
      totals: {
        late: items.filter((item) => item.exception_type === "late").length,
        missing_punch: items.filter((item) => item.exception_type === "missing_punch").length,
        absent: items.filter((item) => item.exception_type === "absent").length,
        correction: items.filter((item) => item.exception_type === "correction").length
      }
    };
  }

  decideRegularization(actor: AuthUser, id: UUID, input: { decision: "approve" | "reject" | "return"; remarks?: string; expected_version: number }) {
    const current = this.repository.findRegularization(id);
    if (current.version !== input.expected_version) {
      throw conflict("Attendance regularization request was modified by another actor.", {
        aggregate: "attendance_regularization",
        id
      });
    }
    assertCanDecideRegularization(actor, current);
    if (["reject", "return"].includes(input.decision) && !input.remarks?.trim()) {
      throw missingRemarks(input.decision);
    }
    const previousStatus = current.status;
    if (previousStatus !== AttendanceRegularizationStatuses.Pending) {
      throw conflict("Only pending attendance regularization requests can be decided.", {
        request_id: id,
        status: previousStatus
      });
    }
    const nextStatus =
      input.decision === "approve"
        ? AttendanceRegularizationStatuses.Approved
        : input.decision === "reject"
          ? AttendanceRegularizationStatuses.Rejected
          : AttendanceRegularizationStatuses.Returned;
    const request = this.repository.updateRegularizationVersioned(id, input.expected_version, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
      candidate.decision_remarks = input.remarks?.trim() ?? null;
      candidate.decided_by_user_id = actor.id;
      candidate.decided_at = nowIso();
    });
    if (input.decision === "approve" && request.requested_punches.length > 0) {
      this.applyApprovedPunches(request, actor.id);
    }
    const day = this.getOrSynthesizeDay(request.employee_user_id, request.work_date);
    day.regularization_status = nextStatus;
    if (nextStatus === AttendanceRegularizationStatuses.Approved && day.exception_type) {
      day.exception_type = null;
      day.status = day.work_mode === "wfh" ? AttendanceDayStatuses.Wfh : AttendanceDayStatuses.Present;
      day.note = "Regularized";
    }
    day.updated_at = nowIso();
    day.version += 1;
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: request.id,
      eventType: this.eventForDecision(input.decision),
      payload: {
        request_id: request.id,
        actor_user_id: actor.id,
        employee_user_id: request.employee_user_id,
        decision: input.decision,
        previous_status: previousStatus,
        next_status: nextStatus,
        version: request.version
      },
      idempotencyKey: `attendance.regularization.${input.decision}:${request.id}:${request.version}`
    });
    return {
      ...this.presentRegularization(request),
      previous_status: previousStatus,
      next_status: nextStatus,
      day_status: this.presentDay(day)
    };
  }

  createExportJob(actor: AuthUser, input: AttendanceExportInput) {
    if (!canSeeAllAttendance(actor)) {
      throw forbidden("Only HR, Admin, or Auditor users can export attendance data.");
    }
    const jobId = randomUUID();
    const format = input.format ?? "csv";
    const columns = input.columns?.length
      ? input.columns
      : ["employee_code", "employee", "date", "status", "in_time", "out_time", "hours"];
    const filters = input.filters ?? {};
    const createdAt = nowIso();
    appendAttendanceOutboxEvent(this.store, {
      aggregateId: jobId,
      eventType: attendanceEvents.ExportRequested,
      payload: {
        job_id: jobId,
        requested_by_user_id: actor.id,
        filters,
        columns,
        format,
        adapter: "outbox-queued-placeholder"
      },
      idempotencyKey: `attendance.export.requested:${jobId}`
    });
    return {
      job_id: jobId,
      status: "queued",
      format,
      filters,
      columns,
      requested_by_user_id: actor.id,
      created_at: createdAt,
      adapter: "outbox-queued-placeholder",
      download_document_id: null
    };
  }

  private nextAllowedActions(punches: AttendancePunch[]): AttendancePunchEventType[] {
    const active = punches.filter((punch) => !punch.deleted_at).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const last = active.at(-1);
    if (!last) {
      return [AttendancePunchEventTypes.CheckIn];
    }
    if (last.event_type === AttendancePunchEventTypes.CheckIn || last.event_type === AttendancePunchEventTypes.BreakEnd) {
      return [AttendancePunchEventTypes.BreakStart, AttendancePunchEventTypes.CheckOut];
    }
    if (last.event_type === AttendancePunchEventTypes.BreakStart) {
      return [AttendancePunchEventTypes.BreakEnd];
    }
    return [];
  }

  private recomputeDay(employeeUserId: UUID, workDate: string): AttendanceDayRecord {
    const punches = this.repository.listPunches(employeeUserId, workDate, workDate);
    const checkIns = punches.filter((punch) => punch.event_type === AttendancePunchEventTypes.CheckIn);
    const checkOuts = punches.filter((punch) => punch.event_type === AttendancePunchEventTypes.CheckOut);
    const firstCheckIn = checkIns[0]?.occurred_at ?? null;
    const lastCheckOut = checkOuts.at(-1)?.occurred_at ?? null;
    const workMode = punches.find((punch) => punch.work_mode)?.work_mode ?? null;
    const breakMinutes = this.breakMinutes(punches);
    const isPast = workDate < todayDate();
    const isFuture = workDate > todayDate();
    const lateMinutes = firstCheckIn ? Math.max(0, minutesBetween(clockIso(workDate, 9, 30), firstCheckIn)) : 0;
    const earlyOutMinutes = lastCheckOut && isPast ? Math.max(0, minutesBetween(lastCheckOut, clockIso(workDate, 17, 30))) : 0;
    const workEnd = lastCheckOut ?? (workDate === todayDate() ? nowIso() : firstCheckIn);
    const totalMinutes = firstCheckIn && workEnd ? Math.max(0, minutesBetween(firstCheckIn, workEnd) - breakMinutes) : 0;
    const missingPunch = Boolean(firstCheckIn && !lastCheckOut && isPast);
    const absent = !firstCheckIn && isPast && !isWeekend(workDate);
    const exceptionType = absent ? "absent" : missingPunch ? "missing_punch" : lateMinutes > 0 ? "late" : earlyOutMinutes > 0 ? "early_out" : null;
    const status =
      isFuture ? AttendanceDayStatuses.Future
        : isWeekend(workDate) && punches.length === 0 ? AttendanceDayStatuses.Weekend
          : absent ? AttendanceDayStatuses.Absent
            : workMode === "wfh" ? AttendanceDayStatuses.Wfh
              : lateMinutes > 0 ? AttendanceDayStatuses.Late
                : AttendanceDayStatuses.Present;
    return this.repository.upsertDayRecord({
      employee_user_id: employeeUserId,
      work_date: workDate,
      status,
      first_check_in: firstCheckIn,
      last_check_out: lastCheckOut,
      work_minutes: totalMinutes,
      break_minutes: breakMinutes,
      late_minutes: lateMinutes,
      early_out_minutes: earlyOutMinutes,
      work_mode: workMode,
      note: exceptionType ? this.exceptionDetail({ exception_type: exceptionType, late_minutes: lateMinutes, early_out_minutes: earlyOutMinutes, work_minutes: totalMinutes } as AttendanceDayRecord) : null,
      exception_type: exceptionType,
      regularization_status: this.repository.dayRecord(employeeUserId, workDate)?.regularization_status ?? null
    });
  }

  private breakMinutes(punches: AttendancePunch[]): number {
    let total = 0;
    let breakStartedAt: string | null = null;
    for (const punch of punches) {
      if (punch.event_type === AttendancePunchEventTypes.BreakStart) {
        breakStartedAt = punch.occurred_at;
      }
      if (punch.event_type === AttendancePunchEventTypes.BreakEnd && breakStartedAt) {
        total += minutesBetween(breakStartedAt, punch.occurred_at);
        breakStartedAt = null;
      }
    }
    return total;
  }

  private getOrSynthesizeDay(employeeUserId: UUID, workDate: string): AttendanceDayRecord {
    const existing = this.repository.dayRecord(employeeUserId, workDate);
    if (existing) {
      return existing;
    }
    const status =
      workDate > todayDate()
        ? AttendanceDayStatuses.Future
        : isWeekend(workDate)
          ? AttendanceDayStatuses.Weekend
          : AttendanceDayStatuses.Absent;
    return this.repository.upsertDayRecord({
      employee_user_id: employeeUserId,
      work_date: workDate,
      status,
      first_check_in: null,
      last_check_out: null,
      work_minutes: 0,
      break_minutes: 0,
      late_minutes: 0,
      early_out_minutes: 0,
      work_mode: null,
      note: status === AttendanceDayStatuses.Absent ? "No punch-in recorded" : null,
      exception_type: status === AttendanceDayStatuses.Absent ? "absent" : null,
      regularization_status: null
    });
  }

  private weekRecords(employeeUserId: UUID): AttendanceDayRecord[] {
    const today = new Date(`${todayDate()}T00:00:00.000Z`);
    const start = new Date(today);
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return this.getOrSynthesizeDay(employeeUserId, date.toISOString().slice(0, 10));
    });
  }

  private recordsForUsers(userIds: Set<UUID>, from: string, to: string): AttendanceDayRecord[] {
    const records = this.repository.listDayRecords({ userIds, dateFrom: from, dateTo: to });
    const output = [...records];
    for (const userId of userIds) {
      for (const date of datesInclusive(from, to)) {
        if (!output.some((record) => record.employee_user_id === userId && record.work_date === date)) {
          output.push(this.getOrSynthesizeDay(userId, date));
        }
      }
    }
    return output.sort((a, b) => a.work_date.localeCompare(b.work_date));
  }

  private daySummary(records: Array<AttendanceDayRecord | { status: string; work_minutes: number; late_minutes?: number; exception_type?: string | null }>) {
    return {
      present: records.filter((record) => record.status === AttendanceDayStatuses.Present).length,
      absent: records.filter((record) => record.status === AttendanceDayStatuses.Absent).length,
      late: records.filter((record) => record.status === AttendanceDayStatuses.Late).length,
      wfh: records.filter((record) => record.status === AttendanceDayStatuses.Wfh).length,
      leave: records.filter((record) => record.status === AttendanceDayStatuses.Leave).length,
      weekend: records.filter((record) => record.status === AttendanceDayStatuses.Weekend).length,
      future: records.filter((record) => record.status === AttendanceDayStatuses.Future).length,
      missing_punch: records.filter((record) => record.exception_type === "missing_punch").length,
      regularized: records.filter((record) => "regularization_status" in record && record.regularization_status === AttendanceRegularizationStatuses.Approved).length,
      work_minutes: records.reduce((total, record) => total + record.work_minutes, 0)
    };
  }

  private teamTotals(records: AttendanceDayRecord[], totalEmployees: number) {
    return {
      total: totalEmployees,
      present: records.filter((record) => record.status === AttendanceDayStatuses.Present || record.status === AttendanceDayStatuses.Late).length,
      absent: records.filter((record) => record.status === AttendanceDayStatuses.Absent).length,
      late: records.filter((record) => record.status === AttendanceDayStatuses.Late).length,
      early_out: records.filter((record) => record.early_out_minutes > 0).length,
      wfh: records.filter((record) => record.status === AttendanceDayStatuses.Wfh).length,
      on_leave: records.filter((record) => record.status === AttendanceDayStatuses.Leave).length
    };
  }

  private departmentSummary(records: AttendanceDayRecord[], users: CoreUser[]) {
    return this.store.departments
      .filter((department) => !department.deleted_at)
      .map((department) => {
        const members = users.filter((user) => user.department_id === department.id);
        const memberIds = new Set(members.map((user) => user.id));
        const departmentRecords = records.filter((record) => memberIds.has(record.employee_user_id));
        const present = departmentRecords.filter(
          (record) =>
            record.status === AttendanceDayStatuses.Present ||
            record.status === AttendanceDayStatuses.Late ||
            record.status === AttendanceDayStatuses.Wfh
        ).length;
        return {
          department_id: department.id,
          department_code: department.department_code,
          name: department.name,
          present,
          strength: members.length,
          attendance_percent: members.length > 0 ? Math.round((present / members.length) * 100) : 0
        };
      })
      .filter((row) => row.strength > 0);
  }

  private visibleUsers(actor: AuthUser, departmentId?: UUID): CoreUser[] {
    return this.store.users.filter((user) => {
      if (!visibleUserPredicate(actor, user)) {
        return false;
      }
      if (departmentId && user.department_id !== departmentId) {
        return false;
      }
      return true;
    });
  }

  private hasVisibleSubordinates(actor: AuthUser): boolean {
    return this.store.users.some(
      (user) =>
        user.id !== actor.id &&
        !user.deleted_at &&
        user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`)
    );
  }

  private regularizationQueueCounts(requests: AttendanceRegularizationRequest[]) {
    return {
      total: requests.length,
      pending: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Pending).length,
      approved: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Approved).length,
      returned: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Returned).length,
      rejected: requests.filter((request) => request.status === AttendanceRegularizationStatuses.Rejected).length
    };
  }

  private requireUser(userId: UUID): CoreUser {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    if (!user) {
      throw notFound("User not found", { id: userId });
    }
    return user;
  }

  private adminFallback(): CoreUser | null {
    return this.store.users.find((user) => user.roles.includes(Roles.Admin) && user.employment_status === EmploymentStatuses.Active && !user.deleted_at) ?? null;
  }

  private applyApprovedPunches(request: AttendanceRegularizationRequest, actorUserId: UUID): void {
    for (const requested of request.requested_punches) {
      const date = dateFromIso(requested.occurred_at);
      if (date !== request.work_date) {
        throw badRequest("Requested punch timestamps must fall on the regularization work_date.");
      }
      this.repository.addPunch({
        employee_user_id: request.employee_user_id,
        event_type: requested.event_type,
        occurred_at: requested.occurred_at,
        work_mode: "office",
        source: "admin",
        metadata: { regularization_request_id: request.id, decided_by_user_id: actorUserId }
      });
    }
    this.recomputeDay(request.employee_user_id, request.work_date);
  }

  private presentPunch(punch: AttendancePunch) {
    return {
      ...punch,
      work_date: dateFromIso(punch.occurred_at),
      time: timeText(punch.occurred_at)
    };
  }

  private presentDay(day: AttendanceDayRecord) {
    return {
      ...day,
      in_time: timeText(day.first_check_in),
      out_time: timeText(day.last_check_out),
      hours: minutesToHours(day.work_minutes),
      break_hours: minutesToHours(day.break_minutes),
      detail: this.exceptionDetail(day)
    };
  }

  private presentRegularization(request: AttendanceRegularizationRequest) {
    const user = this.store.users.find((candidate) => candidate.id === request.employee_user_id);
    const approver = request.current_approver_user_id
      ? this.store.users.find((candidate) => candidate.id === request.current_approver_user_id)
      : undefined;
    return {
      ...request,
      employee: userLabel(user),
      approver: approver ? userLabel(approver) : null
    };
  }

  private presentException(record: AttendanceDayRecord, request: AttendanceRegularizationRequest | undefined, actor: AuthUser) {
    const user = this.store.users.find((candidate) => candidate.id === record.employee_user_id);
    const exceptionType = request ? "correction" : record.exception_type;
    return {
      id: request?.id ?? record.id,
      request_id: request?.id ?? null,
      employee_user_id: record.employee_user_id,
      employee: userLabel(user).full_name,
      employee_code: userLabel(user).employee_code,
      date: record.work_date,
      exception_type: exceptionType,
      detail: request?.reason ?? this.exceptionDetail(record),
      status: request?.status ?? record.regularization_status ?? "pending",
      expected_version: request?.version ?? record.version,
      can_decide: Boolean(request && request.status === AttendanceRegularizationStatuses.Pending && actor.id !== request.employee_user_id && (canSeeAllAttendance(actor) || request.current_approver_user_id === actor.id)),
      record: this.presentDay(record),
      request: request ? this.presentRegularization(request) : null
    };
  }

  private exceptionDetail(record: Pick<AttendanceDayRecord, "exception_type" | "late_minutes" | "early_out_minutes" | "work_minutes" | "note">): string {
    if (record.note) {
      return record.note;
    }
    if (record.exception_type === "late") {
      return `Late by ${record.late_minutes} min`;
    }
    if (record.exception_type === "missing_punch") {
      return "Missing punch-out";
    }
    if (record.exception_type === "absent") {
      return "No punch-in recorded";
    }
    if (record.exception_type === "early_out") {
      return `Early out by ${record.early_out_minutes} min`;
    }
    return record.work_minutes > 0 ? minutesToHours(record.work_minutes) : "No attendance for this day";
  }

  private eventForDecision(decision: "approve" | "reject" | "return") {
    if (decision === "approve") {
      return attendanceEvents.RegularizationApproved;
    }
    if (decision === "reject") {
      return attendanceEvents.RegularizationRejected;
    }
    return attendanceEvents.RegularizationReturned;
  }
}

function datesInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
