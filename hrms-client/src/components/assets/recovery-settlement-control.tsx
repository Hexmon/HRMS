import type { ReactNode } from "react";
import type { AssetRecoveryTicketView } from "@/domains/assets";

export function RecoverySettlementControl({
  ticket,
  children,
}: {
  ticket: AssetRecoveryTicketView;
  children: ReactNode;
}) {
  if (ticket.status === "closed") return null;
  if (ticket.reviewRequired || !ticket.assignmentId) {
    return (
      <p className="max-w-52 text-xs text-amber-700 dark:text-amber-300">
        HR review required. This ticket does not match the asset’s current custody assignment.
      </p>
    );
  }
  return <>{children}</>;
}
