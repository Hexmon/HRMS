import { Download } from "lucide-react";
import { ActionButton } from "@/components/ui-kit";

export function TeamUtilizationExportAction({
  apiMode,
  onExport,
}: {
  apiMode: boolean;
  onExport: () => void;
}) {
  if (apiMode) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Team utilization download is temporarily unavailable.
      </p>
    );
  }
  return (
    <ActionButton
      size="sm"
      variant="secondary"
      icon={<Download className="h-4 w-4" />}
      onClick={onExport}
    >
      Export
    </ActionButton>
  );
}
