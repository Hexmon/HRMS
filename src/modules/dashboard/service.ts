import type { AuthUser, CoreUser, ExpenseTicket, TimesheetSubmission, UUID } from "#shared";
import { AssetStatuses, AttendanceDayStatuses, EmploymentStatuses, ExpenseStatuses, Roles, TimesheetStatuses } from "#shared";
import type { MemoryDataStore, WorkSegment } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";

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
    document_verification_pending: number;
  };
  operations: {
    assets_total: number;
    assets_assigned: number;
    assets_recovery_pending: number;
    notifications_pending: number;
    outbox_pending: number;
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

  summary(actor: AuthUser): DashboardSummary {
    const visibleUsers = this.visibleUsers(actor);
    const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
    const visibleTickets = this.visibleTickets(actor, visibleUserIds);
    const visibleSubmissions = this.visibleTimesheetSubmissions(actor, visibleUserIds);
    const visibleSegments = this.visibleWorkSegments(actor, visibleUserIds);
    const visibleAttendance = this.visibleAttendanceDays(actor, visibleUserIds);
    const visibleAssets = this.visibleAssets(actor, visibleUserIds);
    const pendingManagerExpenses = visibleTickets.filter((ticket) => this.isManagerPendingFor(actor, ticket)).length;
    const pendingFinanceExpenses = visibleTickets.filter((ticket) => this.isFinancePendingFor(actor, ticket)).length;
    const pendingTimesheets = visibleSubmissions.filter((submission) => this.isTimesheetPendingFor(actor, submission)).length;
    const pendingDocuments = this.pendingDocumentVerificationCount(actor, visibleTickets, visibleUserIds);
    const operations = {
      assets_total: visibleAssets.length,
      assets_assigned: visibleAssets.filter((asset) => asset.status === AssetStatuses.Assigned).length,
      assets_recovery_pending: this.store.assetRecoveryTickets.filter(
        (ticket) => visibleUserIds.has(ticket.employee_user_id) && ticket.status !== "closed"
      ).length,
      notifications_pending: this.store.notifications.filter((notification) => this.isNotificationVisible(actor, visibleUserIds, notification.target_user_id) && notification.status === "pending").length,
      outbox_pending: this.canSeeSystemWide(actor) ? this.store.outbox.filter((event) => event.status === "pending" || event.status === "retry").length : 0
    };
    const workload = {
      work_segments_total: visibleSegments.length,
      submitted_hours_total: sumDecimal(visibleSegments.map((segment) => segment.hours)),
      timesheet_submissions_total: visibleSubmissions.length,
      timesheet_submissions_approved: visibleSubmissions.filter((submission) => submission.status === TimesheetStatuses.Approved).length,
      timesheet_submissions_returned: visibleSubmissions.filter((submission) => submission.status === TimesheetStatuses.Returned).length
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
        departments: this.departmentHeadcount(visibleUsers)
      },
      approvals: {
        expense_manager_pending: pendingManagerExpenses,
        expense_finance_pending: pendingFinanceExpenses,
        expense_total_pending: expensePending,
        timesheet_pending: pendingTimesheets,
        document_verification_pending: pendingDocuments
      },
      operations,
      workload,
      attention: [
        metric("pending_expense_approvals", "Expense approvals waiting", expensePending, "count", "expenses"),
        metric("pending_timesheet_approvals", "Timesheets waiting", pendingTimesheets, "count", "timesheets"),
        metric("attendance_exceptions", "Attendance exceptions", this.attendanceExceptionCount(visibleAttendance), "count", "attendance"),
        metric("asset_recovery_pending", "Asset recoveries pending", operations.assets_recovery_pending, "count", "assets"),
        metric("outbox_pending", "Integration events pending", operations.outbox_pending, "count", "outbox")
      ].filter((item) => Number(item.value) > 0),
      unavailable_features: [
        {
          key: "leave_wfh_holidays",
          label: "Leave, WFH, and holidays",
          status: "not_implemented",
          notes: "Leave/WFH/holiday workflows are scheduled for Phase 3 and are not counted in this dashboard yet."
        },
        {
          key: "helpdesk",
          label: "Helpdesk",
          status: "not_implemented",
          notes: "Helpdesk workflows are scheduled for Phase 4 and are not counted in this dashboard yet."
        },
        {
          key: "projects_utilization",
          label: "Projects and utilization",
          status: "not_implemented",
          notes: "Projects/utilization APIs are scheduled for Phase 4; current timesheet project codes remain lightweight metadata."
        }
      ]
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

  private visibleUsers(actor: AuthUser): CoreUser[] {
    const users = this.store.users.filter((user) => !user.deleted_at);
    if (this.canSeeSystemWide(actor)) {
      return users;
    }
    return users.filter((user) => user.id === actor.id || user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`));
  }

  private visibleTickets(actor: AuthUser, visibleUserIds: Set<UUID>): ExpenseTicket[] {
    const tickets = this.store.tickets.filter((ticket) => !ticket.deleted_at);
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

  private visibleTimesheetSubmissions(actor: AuthUser, visibleUserIds: Set<UUID>): TimesheetSubmission[] {
    const submissions = this.store.timesheetSubmissions.filter((submission) => !submission.deleted_at);
    if (this.canSeeSystemWide(actor)) {
      return submissions;
    }
    return submissions.filter((submission) => visibleUserIds.has(submission.employee_user_id) || submission.current_approver_user_id === actor.id);
  }

  private visibleWorkSegments(actor: AuthUser, visibleUserIds: Set<UUID>): WorkSegment[] {
    const segments = this.store.workSegments.filter((segment) => !segment.deleted_at);
    if (this.canSeeSystemWide(actor)) {
      return segments;
    }
    return segments.filter((segment) => visibleUserIds.has(segment.employee_user_id));
  }

  private visibleAttendanceDays(actor: AuthUser, visibleUserIds: Set<UUID>) {
    const days = this.store.attendanceDayRecords.filter((record) => !record.deleted_at);
    if (this.canSeeSystemWide(actor)) {
      return days;
    }
    return days.filter((record) => visibleUserIds.has(record.employee_user_id));
  }

  private attendanceExceptionCount(records: Array<{ exception_type: string | null; status: string }>): number {
    return records.filter(
      (record) =>
        record.exception_type ||
        record.status === AttendanceDayStatuses.Absent ||
        record.status === AttendanceDayStatuses.Late
    ).length;
  }

  private visibleAssets(actor: AuthUser, visibleUserIds: Set<UUID>) {
    const assets = this.store.assets.filter((asset) => !asset.deleted_at);
    if (this.canSeeSystemWide(actor)) {
      return assets;
    }
    return assets.filter((asset) => asset.current_assigned_user_id && visibleUserIds.has(asset.current_assigned_user_id));
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

  private isTimesheetPendingFor(actor: AuthUser, submission: TimesheetSubmission): boolean {
    return (
      submission.status === TimesheetStatuses.PendingApproval &&
      (submission.current_approver_user_id === actor.id || this.canSeeSystemWide(actor))
    );
  }

  private pendingDocumentVerificationCount(actor: AuthUser, visibleTickets: ExpenseTicket[], visibleUserIds: Set<UUID>): number {
    const visibleTicketIds = new Set(visibleTickets.map((ticket) => ticket.id));
    return this.store.expenseDocuments.filter((document) => {
      if (document.verification_status !== "pending") {
        return false;
      }
      if (visibleTicketIds.has(document.ticket_id)) {
        return true;
      }
      return visibleUserIds.has(document.uploaded_by) || this.canSeeFinance(actor) || this.canSeeSystemWide(actor);
    }).length;
  }

  private isNotificationVisible(actor: AuthUser, visibleUserIds: Set<UUID>, targetUserId: UUID | null): boolean {
    return this.canSeeSystemWide(actor) || targetUserId === actor.id || (targetUserId ? visibleUserIds.has(targetUserId) : false);
  }

  private departmentHeadcount(users: CoreUser[]): DashboardSummary["workforce"]["departments"] {
    const activeUsers = users.filter((user) => user.employment_status === EmploymentStatuses.Active);
    return this.store.departments
      .filter((department) => !department.deleted_at)
      .map((department) => ({
        department_id: department.id,
        department_code: department.department_code,
        name: department.name,
        active_employees: activeUsers.filter((user) => user.department_id === department.id).length
      }))
      .filter((department) => department.active_employees > 0)
      .sort((left, right) => left.department_code.localeCompare(right.department_code));
  }
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

function sumDecimal(values: string[]): string {
  const total = values.reduce((sum, value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  return total.toFixed(2);
}
