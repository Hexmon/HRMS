import { randomUUID } from "node:crypto";
import type { AuthUser, CoreUser, TimesheetSubmission, UUID } from "#shared";
import { addMoney, Roles, TimesheetStatuses } from "#shared";
import type { MemoryDataStore, WorkSegment } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, missingRemarks } from "../../platform/errors.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { CoreService } from "../core/service.js";
import { timesheetEvents } from "./events.js";
import { assertCurrentApprover, assertTimesheetOwner } from "./policy.js";
import { TimesheetRepository } from "./repository.js";
import { assertTimesheetTransition } from "./state-machine.js";

export interface TimesheetQueueQuery {
  page: number;
  page_size: number;
  sort?: string;
  status?: string;
  employee_user_id?: UUID;
  cycle_start?: string;
  cycle_end?: string;
  project_code?: string;
  billable?: boolean;
}

type TimesheetActionRecord = MemoryDataStore["timesheetActions"][number];

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function toFixedHours(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function decimal(value: string | null | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function dateUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function daysInclusive(start: string, end: string): number {
  const from = dateUtc(start);
  const to = dateUtc(end);
  if (to < from) {
    return 0;
  }
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function workdaysInclusive(start: string, end: string): number {
  let days = 0;
  const cursor = dateUtc(start);
  const to = dateUtc(end);
  while (cursor <= to) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export class TimesheetService {
  private readonly repository: TimesheetRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new TimesheetRepository(store);
    this.core = new CoreService(store);
  }

  createSegment(actor: AuthUser, input: { work_date: string; project_code?: string; task_code?: string; hours: string; description?: string; billable: boolean }) {
    assertTimesheetOwner(actor, actor.id);
    if (Number(input.hours) <= 0 || Number(input.hours) > 24) {
      throw badRequest("Work segment hours must be between 0 and 24");
    }
    return this.repository.addSegment({
      employee_user_id: actor.id,
      work_date: input.work_date,
      project_code: input.project_code ?? null,
      task_code: input.task_code ?? null,
      hours: input.hours,
      description: input.description ?? null,
      billable: input.billable
    });
  }

  listSegments(actor: AuthUser, pageNumber: number, pageSize: number) {
    const items = this.store.workSegments.filter((segment) => segment.employee_user_id === actor.id && !segment.deleted_at);
    return page(items, pageNumber, pageSize);
  }

  submit(actor: AuthUser, input: { cycle_start: string; cycle_end: string }): TimesheetSubmission {
    if (input.cycle_end < input.cycle_start) {
      throw badRequest("Cycle end cannot be before cycle start");
    }
    const workflow = this.repository.activeWorkflow();
    const segments = this.repository.segmentsForCycle(actor.id, input.cycle_start, input.cycle_end);
    if (segments.length === 0) {
      throw badRequest("At least one work segment is required for submission");
    }
    const manager = this.core.resolveImmediateManager(actor.id);
    if (!manager) {
      throw badRequest("Unable to infer approver from Core hierarchy");
    }
    const now = nowIso();
    const submission: TimesheetSubmission = {
      id: randomUUID(),
      employee_user_id: actor.id,
      cycle_start: input.cycle_start,
      cycle_end: input.cycle_end,
      status: TimesheetStatuses.PendingApproval,
      total_hours: addMoney(segments.map((segment) => segment.hours)),
      workflow_definition_id: workflow.id,
      workflow_snapshot: {
        workflow_definition_id: workflow.id,
        workflow_version: workflow.version,
        approver_strategy: workflow.definition.approver_strategy,
        require_billable_review: workflow.definition.require_billable_review,
        approver_user_id: manager.id
      },
      current_approver_user_id: manager.id,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.repository.addSubmission(submission);
    this.store.timesheetActions.push({
      id: randomUUID(),
      submission_id: submission.id,
      actor_user_id: actor.id,
      decision: "submitted",
      remarks: null,
      created_at: now
    });
    appendOutboxEvent(this.store, {
      aggregateType: "timesheet_submission",
      aggregateId: submission.id,
      eventType: timesheetEvents.Submitted,
      payload: {
        submission_id: submission.id,
        employee_user_id: actor.id,
        approver_user_id: manager.id,
        status: submission.status,
        total_hours: submission.total_hours
      },
      idempotencyKey: `timesheet.submitted:${submission.id}`
    });
    return submission;
  }

  mySubmissions(actor: AuthUser, pageNumber: number, pageSize: number) {
    return page(
      this.store.timesheetSubmissions
        .filter((submission) => submission.employee_user_id === actor.id && !submission.deleted_at)
        .map((submission) => this.presentSubmission(submission, actor)),
      pageNumber,
      pageSize
    );
  }

  approverQueue(actor: AuthUser, queryOrPage: TimesheetQueueQuery | number, maybePageSize?: number) {
    const query = typeof queryOrPage === "number"
      ? { page: queryOrPage, page_size: maybePageSize ?? 25 }
      : queryOrPage;
    const visible = this.store.timesheetSubmissions.filter((submission) => {
      if (submission.deleted_at) {
        return false;
      }
      if (!actor.roles.includes(Roles.Admin) && submission.current_approver_user_id !== actor.id) {
        return false;
      }
      if (!this.matchesQueueFilters(submission, query)) {
        return false;
      }
      if (!query.status && submission.status !== TimesheetStatuses.PendingApproval) {
        return false;
      }
      return true;
    });
    const sorted = this.sortQueue(visible, query.sort);
    const result = page(
      sorted.map((submission) => ({
        ...this.presentSubmission(submission, actor),
        queue_context: this.queueContext(submission, actor),
        decision_history: this.decisionHistory(submission.id),
        last_decision: this.lastDecision(submission.id)
      })),
      query.page,
      query.page_size
    );
    return {
      ...result,
      summary: {
        total_pending: visible.filter((submission) => submission.status === TimesheetStatuses.PendingApproval).length,
        total_returned: visible.filter((submission) => submission.status === TimesheetStatuses.Returned).length,
        total_rejected: visible.filter((submission) => submission.status === TimesheetStatuses.Rejected).length,
        admin_override_view: actor.roles.includes(Roles.Admin),
        filters_applied: this.appliedQueueFilters(query),
        sort: query.sort ?? "cycle_start"
      }
    };
  }

  decide(actor: AuthUser, id: UUID, decision: "approve" | "reject" | "return", remarks: string | undefined, expectedVersion: number) {
    const current = this.repository.findSubmission(id);
    if (current.version !== expectedVersion) {
      throw conflict("Timesheet submission was modified by another actor.", {
        aggregate: "timesheet_submission",
        id
      });
    }
    assertCurrentApprover(actor, current);
    const normalizedRemarks = remarks?.trim();
    if (["reject", "return"].includes(decision) && !normalizedRemarks) {
      throw missingRemarks(decision);
    }
    const nextStatus =
      decision === "approve"
        ? TimesheetStatuses.Approved
        : decision === "reject"
          ? TimesheetStatuses.Rejected
          : TimesheetStatuses.Returned;
    const previousStatus = current.status;
    assertTimesheetTransition(previousStatus, nextStatus);
    const submission = this.repository.updateVersioned(id, expectedVersion, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
    });
    const action: TimesheetActionRecord = {
      id: randomUUID(),
      submission_id: id,
      actor_user_id: actor.id,
      decision,
      remarks: normalizedRemarks ?? null,
      created_at: nowIso()
    };
    this.store.timesheetActions.push(action);
    appendOutboxEvent(this.store, {
      aggregateType: "timesheet_submission",
      aggregateId: id,
      eventType: this.eventForDecision(decision),
      payload: {
        submission_id: id,
        actor_user_id: actor.id,
        decision,
        previous_status: previousStatus,
        next_status: nextStatus,
        version: submission.version
      },
      idempotencyKey: `timesheet.${decision}:${id}:${action.id}`
    });
    return {
      ...this.presentSubmission(submission, actor),
      previous_status: previousStatus,
      next_status: nextStatus,
      decision,
      audit_event: this.presentAction(action),
      workflow_history: this.decisionHistory(id)
    };
  }

  workflows(pageNumber: number, pageSize: number) {
    return page(this.store.workflowDefinitions, pageNumber, pageSize);
  }

  upsertWorkflow(actor: AuthUser, input: { name: string; definition: { approver_strategy: "ltree_manager" | "project_manager" | "hr_manager"; require_billable_review: boolean } }) {
    const now = nowIso();
    const workflow = {
      id: randomUUID(),
      name: input.name,
      module: "timesheets" as const,
      definition: input.definition,
      version: 1,
      status: "active" as const,
      created_at: now,
      updated_at: now
    };
    for (const existing of this.store.workflowDefinitions) {
      existing.status = "inactive";
      existing.updated_at = now;
    }
    this.store.workflowDefinitions.push(workflow);
    this.store.timesheetActions.push({
      id: randomUUID(),
      submission_id: workflow.id,
      actor_user_id: actor.id,
      decision: "workflow_definition_created",
      remarks: null,
      created_at: now
    });
    return workflow;
  }

  private matchesQueueFilters(submission: TimesheetSubmission, query: TimesheetQueueQuery): boolean {
    if (query.status && submission.status !== query.status) {
      return false;
    }
    if (query.employee_user_id && submission.employee_user_id !== query.employee_user_id) {
      return false;
    }
    if (query.cycle_start && submission.cycle_start < query.cycle_start) {
      return false;
    }
    if (query.cycle_end && submission.cycle_end > query.cycle_end) {
      return false;
    }
    const segments = this.segmentsForSubmission(submission);
    if (query.project_code && !segments.some((segment) => segment.project_code === query.project_code)) {
      return false;
    }
    if (query.billable !== undefined && !segments.some((segment) => segment.billable === query.billable)) {
      return false;
    }
    return true;
  }

  private sortQueue(submissions: TimesheetSubmission[], sort = "cycle_start"): TimesheetSubmission[] {
    const descending = sort.startsWith("-");
    const key = descending ? sort.slice(1) : sort;
    const allowed = new Set(["cycle_start", "cycle_end", "created_at", "updated_at", "status", "employee_code", "total_hours", "submitted_hours", "expected_hours"]);
    const sortKey = allowed.has(key) ? key : "cycle_start";
    return [...submissions].sort((left, right) => {
      const leftValue = this.valueForSort(left, sortKey);
      const rightValue = this.valueForSort(right, sortKey);
      const compared = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return descending ? -compared : compared;
    });
  }

  private valueForSort(submission: TimesheetSubmission, key: string): string | number {
    if (key === "employee_code") {
      return this.userFor(submission.employee_user_id)?.employee_code ?? "";
    }
    if (key === "total_hours" || key === "submitted_hours") {
      return decimal(submission.total_hours);
    }
    if (key === "expected_hours") {
      return decimal(this.expectedHours(submission));
    }
    return String(submission[key as keyof TimesheetSubmission] ?? "");
  }

  private presentSubmission(submission: TimesheetSubmission, actor: AuthUser) {
    const segments = this.segmentsForSubmission(submission);
    const employee = this.userFor(submission.employee_user_id);
    const approver = submission.current_approver_user_id ? this.userFor(submission.current_approver_user_id) : null;
    const expectedHours = this.expectedHours(submission);
    const billableHours = addMoney(segments.filter((segment) => segment.billable).map((segment) => segment.hours));
    const nonBillableHours = addMoney(segments.filter((segment) => !segment.billable).map((segment) => segment.hours));
    return {
      ...submission,
      employee: this.userSummary(employee),
      member: {
        ...this.userSummary(employee),
        member_role: "Employee",
        manager: employee?.manager_user_id ? this.userSummary(this.userFor(employee.manager_user_id)) : null
      },
      cycle: {
        start: submission.cycle_start,
        end: submission.cycle_end,
        total_days: daysInclusive(submission.cycle_start, submission.cycle_end),
        expected_work_days: workdaysInclusive(submission.cycle_start, submission.cycle_end)
      },
      project_summary: this.projectSummary(segments),
      hours_summary: {
        submitted_hours: submission.total_hours,
        expected_hours: expectedHours,
        missing_hours: toFixedHours(Math.max(0, decimal(expectedHours) - decimal(submission.total_hours))),
        variance_hours: toFixedHours(decimal(submission.total_hours) - decimal(expectedHours)),
        billable_hours: billableHours,
        non_billable_hours: nonBillableHours,
        segment_count: segments.length
      },
      workflow_metadata: {
        workflow_definition_id: submission.workflow_definition_id,
        workflow_snapshot: submission.workflow_snapshot,
        current_approver: this.userSummary(approver),
        can_actor_decide: this.canActorDecide(actor, submission),
        expected_version: submission.version,
        allowed_decisions: submission.status === TimesheetStatuses.PendingApproval ? ["approve", "return", "reject"] : [],
        remarks_required_for: ["return", "reject"]
      }
    };
  }

  private queueContext(submission: TimesheetSubmission, actor: AuthUser) {
    const expectedHours = this.expectedHours(submission);
    return {
      action_required: this.canActorDecide(actor, submission),
      current_actor_is_admin_override: actor.roles.includes(Roles.Admin) && submission.current_approver_user_id !== actor.id,
      expected_version: submission.version,
      missing_submission_context: {
        expected_hours: expectedHours,
        submitted_hours: submission.total_hours,
        missing_hours: toFixedHours(Math.max(0, decimal(expectedHours) - decimal(submission.total_hours))),
        under_submitted: decimal(submission.total_hours) < decimal(expectedHours)
      }
    };
  }

  private projectSummary(segments: WorkSegment[]) {
    const projectCodes = unique(segments.map((segment) => segment.project_code));
    return {
      project_codes: projectCodes,
      task_codes: unique(segments.map((segment) => segment.task_code)),
      primary_project_code: projectCodes[0] ?? null,
      client_name: null,
      project_breakdown: projectCodes.map((projectCode) => {
        const scoped = segments.filter((segment) => segment.project_code === projectCode);
        return {
          project_code: projectCode,
          client_name: null,
          task_codes: unique(scoped.map((segment) => segment.task_code)),
          segment_count: scoped.length,
          hours: addMoney(scoped.map((segment) => segment.hours)),
          billable_hours: addMoney(scoped.filter((segment) => segment.billable).map((segment) => segment.hours)),
          non_billable_hours: addMoney(scoped.filter((segment) => !segment.billable).map((segment) => segment.hours))
        };
      })
    };
  }

  private segmentsForSubmission(submission: TimesheetSubmission): WorkSegment[] {
    return this.store.workSegments.filter(
      (segment) =>
        segment.employee_user_id === submission.employee_user_id &&
        !segment.deleted_at &&
        segment.work_date >= submission.cycle_start &&
        segment.work_date <= submission.cycle_end
    );
  }

  private decisionHistory(submissionId: UUID) {
    return this.actionsForSubmission(submissionId).map((action) => this.presentAction(action));
  }

  private lastDecision(submissionId: UUID) {
    const actions = this.actionsForSubmission(submissionId);
    const action = actions.at(-1);
    return action ? this.presentAction(action) : null;
  }

  private actionsForSubmission(submissionId: UUID): TimesheetActionRecord[] {
    return this.store.timesheetActions
      .filter((action) => action.submission_id === submissionId)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  }

  private presentAction(action: TimesheetActionRecord) {
    const actor = this.userFor(action.actor_user_id);
    return {
      id: action.id,
      submission_id: action.submission_id,
      actor_user_id: action.actor_user_id,
      actor_label: actor ? `${actor.employee_code} - ${actor.full_name}` : action.actor_user_id,
      actor: this.userSummary(actor),
      decision: action.decision,
      remarks: action.remarks,
      created_at: action.created_at
    };
  }

  private userFor(userId: UUID): CoreUser | null {
    return this.store.users.find((user) => user.id === userId && !user.deleted_at) ?? null;
  }

  private userSummary(user: CoreUser | null | undefined) {
    if (!user) {
      return null;
    }
    const department = this.store.departments.find((candidate) => candidate.id === user.department_id && !candidate.deleted_at) ?? null;
    const designation = this.store.designations.find((candidate) => candidate.id === user.designation_id && !candidate.deleted_at) ?? null;
    return {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      email: user.email,
      department_id: user.department_id,
      department: department ? { id: department.id, department_code: department.department_code, name: department.name } : null,
      designation_id: user.designation_id,
      designation: designation ? { id: designation.id, designation_code: designation.designation_code, title: designation.title } : null,
      roles: user.roles
    };
  }

  private expectedHours(submission: TimesheetSubmission): string {
    return toFixedHours(workdaysInclusive(submission.cycle_start, submission.cycle_end) * 8);
  }

  private canActorDecide(actor: AuthUser, submission: TimesheetSubmission): boolean {
    return submission.status === TimesheetStatuses.PendingApproval &&
      (submission.current_approver_user_id === actor.id || actor.roles.includes(Roles.Admin));
  }

  private appliedQueueFilters(query: TimesheetQueueQuery): string[] {
    return [
      query.status ? "status" : null,
      query.employee_user_id ? "employee_user_id" : null,
      query.cycle_start ? "cycle_start" : null,
      query.cycle_end ? "cycle_end" : null,
      query.project_code ? "project_code" : null,
      query.billable !== undefined ? "billable" : null
    ].filter((value): value is string => Boolean(value));
  }

  private eventForDecision(decision: "approve" | "reject" | "return"): string {
    if (decision === "approve") {
      return timesheetEvents.Approved;
    }
    if (decision === "reject") {
      return timesheetEvents.Rejected;
    }
    return timesheetEvents.Returned;
  }
}
