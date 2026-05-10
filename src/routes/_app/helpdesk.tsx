import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { LifeBuoy, Workflow, Timer } from "lucide-react";

export const Route = createFileRoute("/_app/helpdesk")({
  component: () => (
    <ComingSoon
      module="Helpdesk"
      description="One inbox for IT, HR, finance and facilities tickets — with SLAs and routing."
      features={[
        { icon: LifeBuoy, title: "Multi-category inbox", description: "Route IT, HR, finance and facilities to the right team." },
        { icon: Workflow, title: "SLA-aware queues", description: "Priority + SLA timers built in. Nothing slips." },
        { icon: Timer, title: "Resolution insights", description: "First-response and resolution time analytics." },
      ]}
    />
  ),
});
