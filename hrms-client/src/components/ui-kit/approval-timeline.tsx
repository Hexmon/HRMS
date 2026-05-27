import { Check, Clock, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ApprovalStep {
  approver: string;
  role: string;
  status: "approved" | "pending" | "rejected" | "skipped";
  remark?: string;
  at?: string;
}

const STATE: Record<ApprovalStep["status"], { icon: LucideIcon; cls: string; ring: string }> = {
  approved: { icon: Check, cls: "bg-success text-success-foreground", ring: "ring-success/30" },
  pending: { icon: Clock, cls: "bg-warning text-warning-foreground", ring: "ring-warning/30" },
  rejected: {
    icon: X,
    cls: "bg-destructive text-destructive-foreground",
    ring: "ring-destructive/30",
  },
  skipped: { icon: Clock, cls: "bg-muted text-muted-foreground", ring: "ring-border" },
};

export function ApprovalTimeline({ steps }: { steps: ApprovalStep[] }) {
  return (
    <ol className="relative space-y-5 pl-6">
      <span className="absolute left-3 top-1 bottom-1 w-px bg-border" />
      {steps.map((s, i) => {
        const cfg = STATE[s.status];
        const Icon = cfg.icon;
        return (
          <li key={i} className="relative">
            <div
              className={cn(
                "absolute -left-6 top-0 grid h-6 w-6 place-items-center rounded-full ring-4 ring-background",
                cfg.cls,
                cfg.ring,
              )}
            >
              <Icon className="h-3 w-3" />
            </div>
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{s.approver}</p>
                  <p className="text-xs text-muted-foreground">{s.role}</p>
                </div>
                {s.at && <p className="text-[11px] text-muted-foreground">{s.at}</p>}
              </div>
              {s.remark && (
                <p className="mt-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                  “{s.remark}”
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
