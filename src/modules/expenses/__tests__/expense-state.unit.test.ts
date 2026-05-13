import { describe, expect, it } from "vitest";
import { ExpenseStatuses, WorkflowActions } from "#shared";
import { AppError } from "../../../platform/errors.js";
import { assertNoSelfProcessing } from "../policy.js";
import { assertTransition } from "../state-machine.js";

describe("expense state machine and policy", () => {
  it("rejects invalid transitions", () => {
    expect(() => assertTransition(ExpenseStatuses.Draft, ExpenseStatuses.Closed)).toThrow(AppError);
  });

  it("allows manager verification to finance approval transition", () => {
    expect(() => assertTransition(ExpenseStatuses.PendingManagerVerification, ExpenseStatuses.ManagerVerified)).not.toThrow();
  });

  it("blocks self processing across guarded workflow actions", () => {
    expect(() =>
      assertNoSelfProcessing({
        requesterUserId: "same",
        actorUserId: "same",
        actionType: WorkflowActions.PaymentRelease
      })
    ).toThrow(AppError);
  });
});
