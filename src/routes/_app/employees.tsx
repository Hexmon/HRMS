import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { Users, UserPlus, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/_app/employees")({
  component: () => (
    <ComingSoon
      module="Employees"
      description="Org-wide employee directory with profiles, lifecycle and permissions."
      features={[
        { icon: Users, title: "Smart directory", description: "Search, filter and segment by department, location and role." },
        { icon: UserPlus, title: "Onboarding flows", description: "Invite, collect docs and provision access in one stepper." },
        { icon: FileBarChart, title: "People insights", description: "Headcount, attrition and tenure visualised at a glance." },
      ]}
    />
  ),
});
