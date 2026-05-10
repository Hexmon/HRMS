import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { Laptop, ShieldCheck, Boxes } from "lucide-react";

export const Route = createFileRoute("/_app/assets")({
  component: () => (
    <ComingSoon
      module="Assets"
      description="Hardware, peripherals and IT inventory — assigned, tracked and audited."
      features={[
        { icon: Boxes, title: "Inventory ledger", description: "Single source of truth for every asset and serial." },
        { icon: Laptop, title: "Smart assignment", description: "Assign on join, reclaim on exit, audit on demand." },
        { icon: ShieldCheck, title: "Lifecycle & warranty", description: "Stay ahead of repairs, refresh cycles and AMC renewals." },
      ]}
    />
  ),
});
