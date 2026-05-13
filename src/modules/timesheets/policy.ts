import type { AuthUser, TimesheetSubmission } from "#shared";
import { Roles } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertTimesheetOwner(actor: AuthUser, employeeUserId: string): void {
  if (actor.id !== employeeUserId && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Timesheet owner access required");
  }
}

export function assertCurrentApprover(actor: AuthUser, submission: TimesheetSubmission): void {
  if (submission.current_approver_user_id !== actor.id && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Only the current approver can act on this timesheet");
  }
}
