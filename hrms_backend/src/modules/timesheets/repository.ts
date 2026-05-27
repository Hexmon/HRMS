import { randomUUID } from "node:crypto";
import type { TimesheetSubmission, UUID } from "#shared";
import type { MemoryDataStore, WorkSegment, WorkflowDefinitionRecord } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export class TimesheetRepository {
  constructor(private readonly store: MemoryDataStore) {}

  addSegment(segment: Omit<WorkSegment, "id" | "created_at" | "updated_at" | "deleted_at">): WorkSegment {
    const now = nowIso();
    const existing = this.store.workSegments.find(
      (candidate) =>
        !candidate.deleted_at &&
        candidate.employee_user_id === segment.employee_user_id &&
        candidate.work_date === segment.work_date &&
        candidate.project_code === segment.project_code &&
        candidate.task_code === segment.task_code &&
        candidate.billable === segment.billable
    );

    if (existing) {
      existing.hours = segment.hours;
      existing.description = segment.description;
      existing.updated_at = now;
      return existing;
    }

    const record: WorkSegment = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...segment
    };
    this.store.workSegments.push(record);
    return record;
  }

  segmentsForCycle(employeeUserId: UUID, start: string, end: string): WorkSegment[] {
    return this.store.workSegments.filter(
      (segment) =>
        segment.employee_user_id === employeeUserId &&
        !segment.deleted_at &&
        segment.work_date >= start &&
        segment.work_date <= end
    );
  }

  activeWorkflow(): WorkflowDefinitionRecord {
    const workflow = this.store.workflowDefinitions.find((candidate) => candidate.status === "active");
    if (!workflow) {
      throw notFound("No active timesheet workflow definition");
    }
    return workflow;
  }

  addSubmission(submission: TimesheetSubmission): TimesheetSubmission {
    this.store.timesheetSubmissions.push(submission);
    return submission;
  }

  findSubmission(id: UUID): TimesheetSubmission {
    const submission = this.store.timesheetSubmissions.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!submission) {
      throw notFound("Timesheet submission not found", { id });
    }
    return submission;
  }

  updateVersioned(id: UUID, expectedVersion: number, mutator: (submission: TimesheetSubmission) => void): TimesheetSubmission {
    const submission = this.findSubmission(id);
    if (submission.version !== expectedVersion) {
      throw conflict("Timesheet submission was modified by another actor.", {
        aggregate: "timesheet_submission",
        id
      });
    }
    mutator(submission);
    submission.version += 1;
    submission.updated_at = nowIso();
    return submission;
  }
}
