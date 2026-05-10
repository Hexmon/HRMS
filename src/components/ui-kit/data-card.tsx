import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}

export function DataCard({ title, description, actions, children, className, padded = true }: Props) {
  return (
    <Card className={cn("overflow-hidden rounded-2xl border-border/60", className)}>
      <div className="flex items-start justify-between gap-3 border-b p-5">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={padded ? "p-5" : ""}>{children}</div>
    </Card>
  );
}
