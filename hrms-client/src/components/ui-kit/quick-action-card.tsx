import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  to?: string;
  onClick?: () => void;
}

const CLS =
  "group block w-full text-left rounded-2xl border border-border/60 bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md";

function Inner({
  Icon,
  title,
  description,
}: {
  Icon: Props["icon"];
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <p className="mt-3 text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
    </div>
  );
}

export function QuickActionCard({ icon: Icon, title, description, to, onClick }: Props) {
  if (to) {
    return (
      <Link to={to} className={cn(CLS)}>
        <Inner Icon={Icon} title={title} description={description} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(CLS)}>
      <Inner Icon={Icon} title={title} description={description} />
    </button>
  );
}
