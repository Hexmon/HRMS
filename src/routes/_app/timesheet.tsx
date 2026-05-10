import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { Timer, FileCheck2, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_app/timesheet")({
  component: () => (
    <ComingSoon
      module="Timesheet"
      description="Log time against projects and tasks. Submit weekly. Approve at speed."
      features={[
        { icon: Timer, title: "Daily quick-entry", description: "Log hours in seconds with smart suggestions." },
        { icon: ClipboardList, title: "Weekly submission", description: "Bundle entries into a clean weekly sheet." },
        { icon: FileCheck2, title: "Manager approvals", description: "Bulk-approve, reject with remarks, audit trails included." },
      ]}
    />
  ),
});
