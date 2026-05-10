import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  to?: string;
  onClick?: () => void;
}

export function QuickActionCard({ icon: Icon, title, description, to, onClick }: Props) {
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <p className="mt-3 text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
    </div>
  );

  const cls =
    "group block w-full text-left rounded-2xl border-border/60 p-4 transition hover:-translate-y-0.5 hover:shadow-md";

  if (to) {
    return (
      <Card asChild className={cls}>
        {/* @ts-expect-error - Card asChild forwards the slotted child */}
        <Link to={to}>{inner}</Link>
      </Card>
    );
  }
  return (
    <Card className={cls} onClick={onClick} role={onClick ? "button" : undefined}>
      {inner}
    </Card>
  );
}
