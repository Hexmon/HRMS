import type { AuthUser, ExpenseTicket, UUID, WorkflowAction } from "#shared";
import { Roles, WorkflowActions } from "#shared";
import { forbidden, selfApprovalBlocked } from "../../platform/errors.js";

export function assertNoSelfProcessing(input: {
  requesterUserId: UUID;
  actorUserId: UUID;
  actionType: WorkflowAction;
}): void {
  const guardedActions: readonly WorkflowAction[] = [
    WorkflowActions.ManagerVerify,
    WorkflowActions.FinanceApprove,
    WorkflowActions.PaymentRelease,
    WorkflowActions.SettlementClose
  ];
  if (guardedActions.includes(input.actionType) && input.requesterUserId === input.actorUserId) {
    throw selfApprovalBlocked(input.actionType);
  }
}

export function assertManagerActor(actor: AuthUser, ticket: ExpenseTicket): void {
  const managerOk = ticket.manager_verifier_id === actor.id;
  if (!managerOk) {
    throw forbidden("Only the assigned Manager or configured Manager backup can act on this ticket");
  }
  assertNoSelfProcessing({
    requesterUserId: ticket.requester_user_id,
    actorUserId: actor.id,
    actionType: WorkflowActions.ManagerVerify
  });
}

export function assertFinanceActor(actor: AuthUser, ticket: ExpenseTicket, actionType: WorkflowAction): void {
  const financeOk = ticket.finance_approver_id === actor.id;
  if (!financeOk) {
    throw forbidden("Only the assigned Finance Manager or configured finance backup can act on this ticket");
  }
  assertNoSelfProcessing({
    requesterUserId: ticket.requester_user_id,
    actorUserId: actor.id,
    actionType
  });
}

export function canReadTicket(actor: AuthUser, ticket: ExpenseTicket): boolean {
  return (
    actor.id === ticket.requester_user_id ||
    actor.id === ticket.manager_verifier_id ||
    actor.id === ticket.finance_approver_id ||
    actor.roles.includes(Roles.Admin) ||
    actor.roles.includes(Roles.Auditor)
  );
}
