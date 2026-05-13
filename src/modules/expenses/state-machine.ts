import type { ExpenseDecision, ExpenseStatus } from "#shared";
import { ExpenseDecisions, ExpenseStatuses } from "#shared";
import { badRequest } from "../../platform/errors.js";

const transitions: Record<string, readonly ExpenseStatus[]> = {
  [ExpenseStatuses.Draft]: [ExpenseStatuses.Submitted],
  [ExpenseStatuses.Submitted]: [ExpenseStatuses.PendingManagerVerification],
  [ExpenseStatuses.PendingManagerVerification]: [
    ExpenseStatuses.ManagerVerified,
    ExpenseStatuses.ManagerRejected,
    ExpenseStatuses.ManagerReturned
  ],
  [ExpenseStatuses.ManagerReturned]: [ExpenseStatuses.Submitted, ExpenseStatuses.Cancelled],
  [ExpenseStatuses.ManagerRejected]: [],
  [ExpenseStatuses.ManagerVerified]: [
    ExpenseStatuses.FinanceApproved,
    ExpenseStatuses.FinanceHold,
    ExpenseStatuses.ClarificationRequired
  ],
  [ExpenseStatuses.FinanceHold]: [ExpenseStatuses.ManagerVerified, ExpenseStatuses.FinanceApproved],
  [ExpenseStatuses.ClarificationRequired]: [ExpenseStatuses.ManagerVerified, ExpenseStatuses.FinanceApproved],
  [ExpenseStatuses.FinanceApproved]: [ExpenseStatuses.PaymentReleased],
  [ExpenseStatuses.PaymentReleased]: [ExpenseStatuses.BillsSubmitted, ExpenseStatuses.PendingAdjustment, ExpenseStatuses.Closed],
  [ExpenseStatuses.BillsSubmitted]: [ExpenseStatuses.PendingAdjustment, ExpenseStatuses.Closed],
  [ExpenseStatuses.PendingAdjustment]: [ExpenseStatuses.Closed],
  [ExpenseStatuses.FinanceRoutingException]: [ExpenseStatuses.ManagerVerified],
  [ExpenseStatuses.Closed]: [],
  [ExpenseStatuses.Cancelled]: []
};

export function assertTransition(from: ExpenseStatus, to: ExpenseStatus): void {
  const allowed = transitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw badRequest("Invalid expense workflow transition", { from, to, allowed });
  }
}

export function managerDecisionToStatus(decision: ExpenseDecision): ExpenseStatus {
  if (decision === ExpenseDecisions.Approve) {
    return ExpenseStatuses.ManagerVerified;
  }
  if (decision === ExpenseDecisions.Reject) {
    return ExpenseStatuses.ManagerRejected;
  }
  return ExpenseStatuses.ManagerReturned;
}

export function financeDecisionToStatus(decision: string): ExpenseStatus {
  if (decision === ExpenseDecisions.Verify) {
    return ExpenseStatuses.FinanceApproved;
  }
  if (decision === ExpenseDecisions.Hold) {
    return ExpenseStatuses.FinanceHold;
  }
  return ExpenseStatuses.ClarificationRequired;
}

export function isTerminalExpenseStatus(status: ExpenseStatus): boolean {
  const terminalStatuses: readonly ExpenseStatus[] = [
    ExpenseStatuses.ManagerRejected,
    ExpenseStatuses.Closed,
    ExpenseStatuses.Cancelled
  ];
  return terminalStatuses.includes(status);
}
