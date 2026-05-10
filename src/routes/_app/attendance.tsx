import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ui-kit";
import { Clock, MapPin, Calendar } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: () => (
    <ComingSoon
      module="Attendance"
      description="Track check-in, check-out, work-from-home and time-off across the org."
      features={[
        { icon: Clock, title: "One-tap check-in", description: "Web, mobile and Slack-native attendance capture." },
        { icon: MapPin, title: "Geo & IP rules", description: "Auto-mark WFH or on-site based on configurable policies." },
        { icon: Calendar, title: "Monthly heatmap", description: "Spot patterns in lateness, leaves and on-site days." },
      ]}
    />
  ),
});
