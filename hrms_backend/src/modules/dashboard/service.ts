import type { AttendanceDayRecord, AuthUser, CoreUser, ExpenseTicket, UUID } from "#shared";
import { AttendanceEvidenceStates, AttendancePresenceStates, AttendancePunctualityStates, EmploymentStatuses, ExpenseStatuses, Roles } from "#shared";
import { validTimeZoneOrUtc } from "#shared";
import type { DashboardSummaryProjection, MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import {
  countAttendanceReportingEvidenceCategories,
  emptyAttendanceReportingEvidenceCounts,
  type AttendanceReportingEvidenceCounts,
} from "../attendance/reporting-evidence.js";
import {
  buildAttendanceReportEvidenceIndex,
  countAttendanceReportSourceCategories,
  emptyAttendanceReportSourceCategoryCounts,
  type AttendanceReportSourceCategoryCounts,
} from "../attendance/reporting-projection.js";

export interface DashboardMetric {
  key: string;
  label: string;
  value: number | string;
  unit: "count" | "money" | "hours" | "status";
  source:
    | "core"
    | "expenses"
    | "documents"
    | "assets"
    | "timesheets"
    | "attendance"
    | "leave_wfh"
    | "notifications"
    | "outbox"
    | "system";
}

export interface DashboardSummary {
  generated_at: string;
  scope: {
    actor_user_id: UUID;
    employee_code: string;
    primary_role: string;
    roles: string[];
    visibility: "all" | "self_and_descendants";
  };
  cards: DashboardMetric[];
  workforce: {
    visible_employees: number;
    active_employees: number;
    inactive_employees: number;
    new_joiners_30d: number;
    departments: Array<{ department_id: UUID; department_code: string; name: string; active_employees: number }>;
  };
  approvals: {
    expense_manager_pending: number;
    expense_finance_pending: number;
    expense_total_pending: number;
    timesheet_pending: number;
    leave_pending: number;
    wfh_pending: number;
    document_verification_pending: number;
  };
  operations: {
    assets_total: number;
    assets_assigned: number;
    assets_recovery_pending: number;
    notifications_pending: number;
    outbox_pending: number;
  };
  attendance: {
    window: {
      date_from: string;
      date_to: string;
      max_months: 12;
    };
    evidence_categories: AttendanceReportingEvidenceCounts;
    source_categories: AttendanceReportSourceCategoryCounts;
  };
  workload: {
    work_segments_total: number;
    submitted_hours_total: string;
    timesheet_submissions_total: number;
    timesheet_submissions_approved: number;
    timesheet_submissions_returned: number;
  };
  attention: DashboardMetric[];
  unavailable_features: Array<{ key: string; label: string; status: "not_implemented"; notes: string }>;
}

const FINANCE_PENDING_STATUSES = new Set<string>([
  ExpenseStatuses.ManagerVerified,
  ExpenseStatuses.FinanceHold,
  ExpenseStatuses.ClarificationRequired,
  ExpenseStatuses.FinanceApproved,
  ExpenseStatuses.PaymentReleased,
  ExpenseStatuses.BillsSubmitted,
  ExpenseStatuses.PendingAdjustment
]);

export class DashboardService {
  constructor(private readonly store: MemoryDataStore) {}

  summaryFromProjection(
    actor: AuthUser,
    activeRole: AuthUser["roles"][number],
    projection: DashboardSummaryProjection,
  ): DashboardSummary {
    const expensePending = projection.approvals.expense_manager_pending
      + projection.approvals.expense_finance_pending;
    const leaveWfhPending = projection.approvals.leave_pending
      + projection.approvals.wfh_pending;
    const operations = projection.operations;
    const workload = projection.workload;
    return {
      generated_at: nowIso(),
      scope: {
        actor_user_id: actor.id,
        employee_code: actor.employee_code,
        primary_role: activeRole,
        roles: [...actor.roles],
        visibility: this.canSeeSystemWide(actor) ? "all" : "self_and_descendants",
      },
      cards: [
        metric("active_employees", "Active employees", projection.workforce.active_employees, "count", "core"),
        metric("pending_expense_approvals", "Pending expense approvals", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Pending timesheet approvals", projection.approvals.timesheet_pending, "count", "timesheets"),
        metric("pending_leave_wfh_approvals", "Pending Leave/WFH approvals", leaveWfhPending, "count", "leave_wfh"),
        metric("attendance_exceptions", "Attendance exceptions", projection.attendance.exceptions, "count", "attendance"),
        metric("assigned_assets", "Assigned assets", operations.assets_assigned, "count", "assets"),
        metric("documents_pending_verification", "Documents pending verification", projection.approvals.document_verification_pending, "count", "documents"),
        metric("submitted_hours", "Submitted hours", workload.submitted_hours_total, "hours", "timesheets"),
      ],
      workforce: projection.workforce,
      approvals: {
        ...projection.approvals,
        expense_total_pending: expensePending,
      },
      operations,
      attendance: {
        window: projection.attendance.window,
        evidence_categories: projection.attendance.evidence_categories,
        source_categories: projection.attendance.source_categories,
      },
      workload,
      attention: [
        metric("pending_expense_approvals", "Expense approvals waiting", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Timesheets waiting", projection.approvals.timesheet_pending, "count", "timesheets"),
        metric("pending_leave_wfh_approvals", "Leave/WFH approvals waiting", leaveWfhPending, "count", "leave_wfh"),
        metric("attendance_exceptions", "Attendance exceptions", projection.attendance.exceptions, "count", "attendance"),
        metric("asset_recovery_pending", "Asset recoveries pending", operations.assets_recovery_pending, "count", "assets"),
        metric("outbox_pending", "Integration events pending", operations.outbox_pending, "count", "outbox"),
      ].filter((item) => Number(item.value) > 0),
      unavailable_features: dashboardSqlUnavailableFeatures(),
    };
  }

  summary(actor: AuthUser): DashboardSummary {
    const visibleUsers = this.visibleUsers(actor);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const currentCompany = this.store.companyProfiles.find(
      (company) => company.id === this.companyIdForUser(actor.id),
    );
    const currentCompanyDate = dateInTimeZone(currentCompany?.timezone ?? "UTC");
    const attendanceWindow = {
      date_from: monthsBeforeDate(currentCompanyDate, 12),
      date_to: currentCompanyDate,
      max_months: 12 as const,
    };
    const visibleTickets = this.visibleTickets(actor, visibleUserIds);
    const visibleAttendance = this.visibleAttendanceDays(actor, visibleUserIds).filter(
      (day) => day.work_date >= attendanceWindow.date_from
        && day.work_date <= attendanceWindow.date_to,
    );
    const canSeeAttendance = this.canSeeAttendanceReporting(actor, visibleUsers);
    const attendanceEvidence = canSeeAttendance
      ? this.attendanceEvidenceSummaries(visibleAttendance)
      : [];
    const pendingManagerExpenses = visibleTickets.filter((ticket) => this.isManagerPendingFor(actor, ticket)).length;
    const pendingFinanceExpenses = visibleTickets.filter((ticket) => this.isFinancePendingFor(actor, ticket)).length;
    const pendingTimesheets = 0;
    const pendingLeaves = 0;
    const pendingWfh = 0;
    const pendingDocuments = this.pendingDocumentVerificationCount(visibleTickets);
    const operations = {
      assets_total: 0,
      assets_assigned: 0,
      assets_recovery_pending: 0,
      notifications_pending: 0,
      outbox_pending: this.visibleOutboxEvents(actor).filter((event) => event.status === "pending" || event.status === "retry").length
    };
    const workload = {
      work_segments_total: 0,
      submitted_hours_total: "0.00",
      timesheet_submissions_total: 0,
      timesheet_submissions_approved: 0,
      timesheet_submissions_returned: 0
    };
    const activeEmployees = visibleUsers.filter((user) => user.employment_status === EmploymentStatuses.Active).length;
    const expensePending = pendingManagerExpenses + pendingFinanceExpenses;
    return {
      generated_at: nowIso(),
      scope: {
        actor_user_id: actor.id,
        employee_code: actor.employee_code,
        primary_role: actor.roles[0] ?? Roles.Employee,
        roles: [...actor.roles],
        visibility: this.canSeeSystemWide(actor) ? "all" : "self_and_descendants"
      },
      cards: [
        metric("active_employees", "Active employees", activeEmployees, "count", "core"),
        metric("pending_expense_approvals", "Pending expense approvals", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Pending timesheet approvals", pendingTimesheets, "count", "timesheets"),
        metric("pending_leave_wfh_approvals", "Pending Leave/WFH approvals", pendingLeaves + pendingWfh, "count", "leave_wfh"),
        metric("attendance_exceptions", "Attendance exceptions", this.attendanceExceptionCount(visibleAttendance), "count", "attendance"),
        metric("assigned_assets", "Assigned assets", operations.assets_assigned, "count", "assets"),
        metric("documents_pending_verification", "Documents pending verification", pendingDocuments, "count", "documents"),
        metric("submitted_hours", "Submitted hours", workload.submitted_hours_total, "hours", "timesheets")
      ],
      workforce: {
        visible_employees: visibleUsers.length,
        active_employees: activeEmployees,
        inactive_employees: visibleUsers.filter((user) => user.employment_status !== EmploymentStatuses.Active).length,
        new_joiners_30d: visibleUsers.filter((user) => user.joined_on && user.joined_on >= daysAgoDate(30)).length,
        departments: this.departmentHeadcount(actor, visibleUsers)
      },
      approvals: {
        expense_manager_pending: pendingManagerExpenses,
        expense_finance_pending: pendingFinanceExpenses,
        expense_total_pending: expensePending,
        timesheet_pending: pendingTimesheets,
        leave_pending: pendingLeaves,
        wfh_pending: pendingWfh,
        document_verification_pending: pendingDocuments
      },
      operations,
      attendance: {
        window: attendanceWindow,
        evidence_categories: canSeeAttendance
          ? countAttendanceReportingEvidenceCategories(
              attendanceEvidence.map((evidence) => evidence.reporting_evidence_category),
            )
          : emptyAttendanceReportingEvidenceCounts(),
        source_categories: canSeeAttendance
          ? countAttendanceReportSourceCategories(
              attendanceEvidence.map((evidence) => evidence.source_categories),
            )
          : emptyAttendanceReportSourceCategoryCounts()
      },
      workload,
      attention: [
        metric("pending_expense_approvals", "Expense approvals waiting", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Timesheets waiting", pendingTimesheets, "count", "timesheets"),
        metric("pending_leave_wfh_approvals", "Leave/WFH approvals waiting", pendingLeaves + pendingWfh, "count", "leave_wfh"),
        metric("attendance_exceptions", "Attendance exceptions", this.attendanceExceptionCount(visibleAttendance), "count", "attendance"),
        metric("asset_recovery_pending", "Asset recoveries pending", operations.assets_recovery_pending, "count", "assets"),
        metric("outbox_pending", "Integration events pending", operations.outbox_pending, "count", "outbox")
      ].filter((item) => Number(item.value) > 0),
      unavailable_features: dashboardSqlUnavailableFeatures(),
    };
  }

  private canSeeSystemWide(actor: AuthUser): boolean {
    const systemWideRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.HRManager, Roles.AssetManager];
    return actor.roles.some((role) => systemWideRoles.includes(role));
  }

  private canSeeFinance(actor: AuthUser): boolean {
    const financeRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.FinanceManager];
    return actor.roles.some((role) => financeRoles.includes(role));
  }

  private canSeeAttendanceReporting(actor: AuthUser, visibleUsers: CoreUser[]): boolean {
    return this.canSeeSystemWide(actor) || visibleUsers.some((user) => user.id !== actor.id);
  }

  private visibleUsers(actor: AuthUser): CoreUser[] {
    const users = this.store.users.filter((user) => !user.deleted_at && this.isInActorCompany(actor, user));
    if (this.canSeeSystemWide(actor)) {
      return users;
    }
    return users.filter((user) => user.id === actor.id || user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`));
  }

  private visibleTickets(actor: AuthUser, visibleUserIds: Set<UUID>): ExpenseTicket[] {
    const actorCompanyId = this.companyIdForUser(actor.id);
    const tickets = this.store.tickets
      .filter((ticket) => !ticket.deleted_at)
      .filter((ticket) =>
        actorCompanyId == null || ticket.company_id === actorCompanyId
      );
    if (this.canSeeSystemWide(actor) || this.canSeeFinance(actor)) {
      return tickets;
    }
    return tickets.filter(
      (ticket) =>
        visibleUserIds.has(ticket.requester_user_id) ||
        ticket.manager_verifier_id === actor.id ||
        ticket.manager_backup_user_id === actor.id ||
        ticket.finance_approver_id === actor.id
    );
  }

  private visibleAttendanceDays(actor: AuthUser, visibleUserIds: Set<UUID>) {
    const actorCompanyId = this.companyIdForUser(actor.id);
    const days = this.store.attendanceDayRecords
      .filter((record) => !record.deleted_at)
      .filter((record) => actorCompanyId == null || record.company_id === actorCompanyId);
    if (this.canSeeSystemWide(actor)) {
      return days;
    }
    return days.filter((record) => visibleUserIds.has(record.employee_user_id));
  }

  private attendanceExceptionCount(
    records: Array<Pick<AttendanceDayRecord, "exception_type" | "evidence_state" | "presence_state" | "punctuality_state">>,
  ): number {
    return records.filter(
      (record) =>
        record.exception_type ||
        record.evidence_state === AttendanceEvidenceStates.Missing ||
        record.evidence_state === AttendanceEvidenceStates.Partial ||
        record.evidence_state === AttendanceEvidenceStates.Disputed ||
        record.presence_state === AttendancePresenceStates.Absent ||
        record.punctuality_state === AttendancePunctualityStates.Late ||
        record.punctuality_state === AttendancePunctualityStates.LateAndEarlyDeparture
    ).length;
  }

  private attendanceEvidenceSummaries(records: AttendanceDayRecord[]) {
    const evidenceIndex = buildAttendanceReportEvidenceIndex(this.store, records);
    return records.map((record) => evidenceIndex.summaryFor(record));
  }

  private isManagerPendingFor(actor: AuthUser, ticket: ExpenseTicket): boolean {
    return (
      ticket.status === ExpenseStatuses.PendingManagerVerification &&
      (ticket.manager_verifier_id === actor.id || ticket.manager_backup_user_id === actor.id || this.canSeeSystemWide(actor))
    );
  }

  private isFinancePendingFor(actor: AuthUser, ticket: ExpenseTicket): boolean {
    return FINANCE_PENDING_STATUSES.has(ticket.status) && (ticket.finance_approver_id === actor.id || this.canSeeFinance(actor));
  }

  private pendingDocumentVerificationCount(visibleTickets: ExpenseTicket[]): number {
    const visibleTicketIds = new Set(visibleTickets.map((ticket) => ticket.id));
    return this.store.expenseDocuments.filter(
      (document) => document.verification_status === "pending"
        && visibleTicketIds.has(document.ticket_id),
    ).length;
  }

  private visibleOutboxEvents(actor: AuthUser) {
    if (!this.canSeeSystemWide(actor)) {
      return [];
    }
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return [];
    }
    const ticketCompanyById = new Map(
      this.store.tickets.map((ticket) => [ticket.id, ticket.company_id]),
    );
    return this.store.outbox.filter((event) =>
      event.aggregate_type === "expense_ticket"
        ? ticketCompanyById.get(event.aggregate_id) === actorCompanyId
        : event.payload.company_id === actorCompanyId,
    );
  }

  private companyIdForUser(userId: UUID): UUID | null {
    return this.store.userSessionPreferences.find((preference) => preference.user_id === userId)?.company_id ?? null;
  }

  private isInActorCompany(actor: AuthUser, user: CoreUser): boolean {
    const actorCompanyId = this.companyIdForUser(actor.id);
    if (!actorCompanyId) {
      return true;
    }
    return user.id === actor.id || this.companyIdForUser(user.id) === actorCompanyId;
  }

  private departmentHeadcount(actor: AuthUser, users: CoreUser[]): DashboardSummary["workforce"]["departments"] {
    const actorCompanyId = this.companyIdForUser(actor.id);
    const activeUsers = users.filter((user) => user.employment_status === EmploymentStatuses.Active);
    return this.store.departments
      .filter((department) => !department.deleted_at && department.status === "active")
      .filter((department) => actorCompanyId ? department.company_id === actorCompanyId : department.company_id === null)
      .map((department) => ({
        department_id: department.id,
        department_code: department.department_code,
        name: department.name,
        active_employees: activeUsers.filter((user) => user.department_id === department.id).length
      }))
      .sort((left, right) => left.department_code.localeCompare(right.department_code));
  }
}

function dashboardSqlUnavailableFeatures(): DashboardSummary["unavailable_features"] {
  return [
    {
      key: "timesheets_historical_ownership",
      label: "Timesheet and work-segment metrics",
      status: "not_implemented",
      notes: "Hidden until timesheet and work-segment rows have immutable company ownership; current membership is not historical ownership evidence.",
    },
    {
      key: "leave_wfh_historical_ownership",
      label: "Leave and WFH metrics",
      status: "not_implemented",
      notes: "Hidden until leave and WFH rows have immutable company ownership; transferred users must not reassign history.",
    },
    {
      key: "assets_historical_ownership",
      label: "Asset and recovery metrics",
      status: "not_implemented",
      notes: "Hidden until asset assignment and recovery history has immutable company ownership.",
    },
    {
      key: "notifications_historical_ownership",
      label: "Notification metrics",
      status: "not_implemented",
      notes: "Hidden until dashboard notification history has a trusted company owner independent of current user membership.",
    },
    ...dashboardUnavailableFeatures(),
  ];
}

function dashboardUnavailableFeatures(): DashboardSummary["unavailable_features"] {
  return [
    {
      key: "helpdesk",
      label: "Helpdesk",
      status: "not_implemented",
      notes: "Helpdesk workflows are scheduled for Phase 4 and are not counted in this dashboard yet.",
    },
    {
      key: "projects_utilization",
      label: "Projects and utilization",
      status: "not_implemented",
      notes: "Projects/utilization APIs are scheduled for Phase 4; current timesheet project codes remain lightweight metadata.",
    },
  ];
}

function metric(
  key: string,
  label: string,
  value: number | string,
  unit: DashboardMetric["unit"],
  source: DashboardMetric["source"]
): DashboardMetric {
  return { key, label, value, unit, source };
}

function daysAgoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function monthsBeforeDate(currentDate: string, months: number): string {
  const current = new Date(`${currentDate}T00:00:00.000Z`);
  const targetMonthStart = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth() - months,
    1,
  ));
  const lastDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(current.getUTCDate(), lastDay));
  return targetMonthStart.toISOString().slice(0, 10);
}

function dateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZoneOrUtc(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
