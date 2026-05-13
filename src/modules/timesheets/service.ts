import { randomUUID } from "node:crypto";
import type { AuthUser, TimesheetSubmission, UUID } from "#shared";
import { addMoney, TimesheetStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, missingRemarks } from "../../platform/errors.js";
import { CoreService } from "../core/service.js";
import { assertCurrentApprover, assertTimesheetOwner } from "./policy.js";
import { TimesheetRepository } from "./repository.js";
import { assertTimesheetTransition } from "./state-machine.js";

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
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
    return submission;
  }

  mySubmissions(actor: AuthUser, pageNumber: number, pageSize: number) {
    return page(
      this.store.timesheetSubmissions.filter((submission) => submission.employee_user_id === actor.id && !submission.deleted_at),
      pageNumber,
      pageSize
    );
  }

  approverQueue(actor: AuthUser, pageNumber: number, pageSize: number) {
    return page(
      this.store.timesheetSubmissions.filter(
        (submission) => submission.current_approver_user_id === actor.id && submission.status === TimesheetStatuses.PendingApproval
      ),
      pageNumber,
      pageSize
    );
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
    if (["reject", "return"].includes(decision) && !remarks) {
      throw missingRemarks(decision);
    }
    const nextStatus =
      decision === "approve"
        ? TimesheetStatuses.Approved
        : decision === "reject"
          ? TimesheetStatuses.Rejected
          : TimesheetStatuses.Returned;
    assertTimesheetTransition(current.status, nextStatus);
    const submission = this.repository.updateVersioned(id, expectedVersion, (candidate) => {
      candidate.status = nextStatus;
      candidate.current_approver_user_id = null;
    });
    this.store.timesheetActions.push({
      id: randomUUID(),
      submission_id: id,
      actor_user_id: actor.id,
      decision,
      remarks: remarks ?? null,
      created_at: nowIso()
    });
    return submission;
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
}
