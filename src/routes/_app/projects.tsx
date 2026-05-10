import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { Briefcase, Users2, Target } from "lucide-react";

export const Route = createFileRoute("/_app/projects")({
  component: () => (
    <ComingSoon
      module="Projects"
      description="Run delivery: scope, allocate, track progress and close projects."
      features={[
        { icon: Briefcase, title: "Project workspaces", description: "One home for tasks, members, time and documents." },
        { icon: Users2, title: "Allocations", description: "Plan headcount and percentage allocation per sprint." },
        { icon: Target, title: "Milestones & risks", description: "Track delivery confidence with weekly check-ins." },
      ]}
    />
  ),
});
