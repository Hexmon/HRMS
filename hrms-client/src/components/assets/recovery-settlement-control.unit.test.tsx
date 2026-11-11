import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { mapApiRecoveryTicket, recoveryTicketDateLabel } from "@/domains/assets/mapper";
import { RecoverySettlementControl } from "./recovery-settlement-control";

const source = {
  id: "ticket-a",
  asset_id: "asset-a",
  created_at: "2026-11-11T10:00:00Z",
  status: "open",
  version: 1,
};

describe("recovery settlement presentation", () => {
  afterEach(cleanup);

  it("offers settlement only for a ticket bound to current custody and labels the proven assignment date", () => {
    const ticket = mapApiRecoveryTicket({
      ...source,
      assignment_id: "assignment-a",
      assignment_assigned_at: "2026-11-01T10:00:00Z",
      review_required: false,
    });
    expect(recoveryTicketDateLabel(ticket)).toBe("assigned on 2026-11-01");
    render(
      <RecoverySettlementControl ticket={ticket}>
        <button>Mark returned</button>
      </RecoverySettlementControl>,
    );
    expect(screen.getByRole("button", { name: "Mark returned" })).toBeInTheDocument();
    expect(screen.queryByText(/HR review required/)).not.toBeInTheDocument();
  });

  it("hides settlement for an unbound or stale ticket and labels ticket creation honestly", () => {
    const ticket = mapApiRecoveryTicket({
      ...source,
      assignment_id: null,
      assignment_assigned_at: null,
      review_required: true,
    });
    expect(recoveryTicketDateLabel(ticket)).toBe("ticket opened 2026-11-11");
    render(
      <RecoverySettlementControl ticket={ticket}>
        <button>Mark returned</button>
      </RecoverySettlementControl>,
    );
    expect(screen.queryByRole("button", { name: "Mark returned" })).not.toBeInTheDocument();
    expect(screen.getByText(/HR review required/)).toBeInTheDocument();
  });

  it("fails closed if the API marks an unbound ticket actionable", () => {
    const ticket = mapApiRecoveryTicket({
      ...source,
      assignment_id: null,
      review_required: false,
    });
    render(
      <RecoverySettlementControl ticket={ticket}>
        <button>Mark returned</button>
      </RecoverySettlementControl>,
    );
    expect(screen.queryByRole("button", { name: "Mark returned" })).not.toBeInTheDocument();
    expect(screen.getByText(/HR review required/)).toBeInTheDocument();
  });

  it("does not offer settlement when a closed ticket appears in a stale list", () => {
    const ticket = mapApiRecoveryTicket({ ...source, status: "closed", review_required: false });
    render(
      <RecoverySettlementControl ticket={ticket}>
        <button>Mark returned</button>
      </RecoverySettlementControl>,
    );
    expect(screen.queryByRole("button", { name: "Mark returned" })).not.toBeInTheDocument();
  });
});
