import type { AuthUser, CoreUser } from "#shared";
import { Roles, WorkflowActions } from "#shared";
import { forbidden, selfApprovalBlocked } from "../../platform/errors.js";

const HR_ROLES: readonly string[] = [Roles.Admin, Roles.HRManager];

export function canManageEms(actor: AuthUser): boolean {
  return actor.roles.some((role) => HR_ROLES.includes(role));
}

export function canSeeEmsUser(actor: AuthUser, user: CoreUser): boolean {
  if (actor.id === user.id || canManageEms(actor) || actor.roles.includes(Roles.Auditor)) {
    return true;
  }
  return user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
}

export function assertCanSeeEmsUser(actor: AuthUser, user: CoreUser): void {
  if (!canSeeEmsUser(actor, user)) {
    throw forbidden("EMS access is limited to self, reporting hierarchy, HR, Admin, or Auditor users.");
  }
}

export function assertCanManageEms(actor: AuthUser): void {
  if (!canManageEms(actor)) {
    throw forbidden("Only HR Manager or Admin users can manage EMS queues.");
  }
}

export function assertCanDecideProfileChange(
  actor: AuthUser,
  request: { employee_user_id: string; current_approver_user_id: string | null }
): void {
  if (actor.id === request.employee_user_id) {
    throw selfApprovalBlocked(WorkflowActions.EmsProfileChangeDecision);
  }
  if (canManageEms(actor) || request.current_approver_user_id === actor.id) {
    return;
  }
  throw forbidden("Only HR or Admin users can decide this EMS profile change request.");
}
