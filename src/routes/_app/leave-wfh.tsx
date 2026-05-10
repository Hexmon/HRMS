import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { CalendarDays, Plane, Workflow } from "lucide-react";

export const Route = createFileRoute("/_app/leave-wfh")({
  component: () => (
    <ComingSoon
      module="Leave & WFH"
      description="Apply, track and approve leave and work-from-home requests with policy-aware workflows."
      features={[
        { icon: CalendarDays, title: "Balances at a glance", description: "Earned, casual, sick and WFH days in one view." },
        { icon: Plane, title: "Holiday-aware planner", description: "See team coverage before you apply." },
        { icon: Workflow, title: "Multi-level approvals", description: "Configurable chains with audit-ready timelines." },
      ]}
    />
  ),
});
