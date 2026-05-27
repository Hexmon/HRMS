import type { AuthUser, CoreUser, UUID } from "#shared";
import { Roles, WorkflowActions } from "#shared";
import { forbidden, selfApprovalBlocked } from "../../platform/errors.js";

const MONITOR_ROLES: readonly string[] = [Roles.Admin, Roles.HRManager, Roles.Auditor];
const DECISION_ROLES: readonly string[] = [Roles.Admin, Roles.HRManager];
const HOLIDAY_MUTATION_ROLES: readonly string[] = [Roles.Admin, Roles.HRManager];

export function canMonitorLeaveWfh(actor: AuthUser): boolean {
  return actor.roles.some((role) => MONITOR_ROLES.includes(role));
}

export function canDecideAcrossLeaveWfh(actor: AuthUser): boolean {
  return actor.roles.some((role) => DECISION_ROLES.includes(role));
}

export function canMutateHolidays(actor: AuthUser): boolean {
  return actor.roles.some((role) => HOLIDAY_MUTATION_ROLES.includes(role));
}

export function canSeeLeaveWfhUser(actor: AuthUser, user: CoreUser): boolean {
  if (actor.id === user.id || canMonitorLeaveWfh(actor)) {
    return true;
  }
  return user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
}

export function assertCanSeeLeaveWfhUser(actor: AuthUser, user: CoreUser): void {
  if (!canSeeLeaveWfhUser(actor, user)) {
    throw forbidden("Leave/WFH access is limited to self, reporting hierarchy, HR, Admin, or Auditor users.");
  }
}

export function assertCanMutateHolidays(actor: AuthUser): void {
  if (!canMutateHolidays(actor)) {
    throw forbidden("Only HR Manager or Admin users can create or update holidays.");
  }
}

export function assertCanDecideLeaveWfh(
  actor: AuthUser,
  request: { employee_user_id: UUID; current_approver_user_id: UUID | null },
  actionType: typeof WorkflowActions.LeaveDecision | typeof WorkflowActions.WfhDecision
): void {
  if (actor.id === request.employee_user_id) {
    throw selfApprovalBlocked(actionType);
  }
  if (canDecideAcrossLeaveWfh(actor) || request.current_approver_user_id === actor.id) {
    return;
  }
  throw forbidden("Only the assigned manager, HR, or Admin can decide this Leave/WFH request.");
}
