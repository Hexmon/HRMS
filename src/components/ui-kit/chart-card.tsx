import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * ChartCard — wrapper for chart visualisations. Renders the supplied children
 * (chart, sparkline, custom svg) inside a consistent card chrome.
 */
export function ChartCard({ title, subtitle, actions, children, className }: Props) {
  return (
    <Card className={cn("flex flex-col gap-4 rounded-2xl border-border/60 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}
