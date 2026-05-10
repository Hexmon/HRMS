import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { Receipt, Wallet, ScanLine } from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({
  component: () => (
    <ComingSoon
      module="Expense Management"
      description="Submit claims, route approvals and process settlements — finance-grade."
      features={[
        { icon: ScanLine, title: "Smart receipts", description: "Snap-and-extract receipts with OCR-powered parsing." },
        { icon: Receipt, title: "Policy-aware claims", description: "Per-category limits, daily caps and FX-aware totals." },
        { icon: Wallet, title: "Payouts & settlements", description: "Approve, batch and pay reimbursements seamlessly." },
      ]}
    />
  ),
});
