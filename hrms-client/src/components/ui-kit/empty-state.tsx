import { ReactNode } from "react";
import type { ComponentType } from "react";
import { Inbox } from "lucide-react";

interface Props {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-5">
        {/* Soft gradient halo */}
        <div
          aria-hidden
          className="absolute inset-0 -m-3 rounded-full opacity-70 blur-xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-border/70 bg-card text-primary shadow-sm">
          <Icon className="h-7 w-7" />
        </div>
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
