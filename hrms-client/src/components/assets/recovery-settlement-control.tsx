import type { ReactNode } from "react";
import type { AssetRecoveryTicketView } from "@/domains/assets";

export function RecoverySettlementControl({
  ticket,
  children,
}: {
  ticket: AssetRecoveryTicketView;
  children: ReactNode;
}) {
  if (ticket.reviewRequired) {
    return (
      <p className="max-w-52 text-xs text-amber-700 dark:text-amber-300">
        HR review required. This ticket does not match the asset’s current custody assignment.
      </p>
    );
  }
  if (ticket.status === "closed") return null;
  return <>{children}</>;
}
