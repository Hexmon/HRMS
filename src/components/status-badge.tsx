import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-success/15 text-success border-success/20" },
  active: { label: "Active", cls: "bg-success/15 text-success border-success/20" },
  paid: { label: "Paid", cls: "bg-success/15 text-success border-success/20" },
  completed: { label: "Completed", cls: "bg-success/15 text-success border-success/20" },
  present: { label: "Present", cls: "bg-success/15 text-success border-success/20" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground border-border" },
  inactive: { label: "Inactive", cls: "bg-muted text-muted-foreground border-border" },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border" },
  in_stock: { label: "In Stock", cls: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  on_hold: { label: "On Hold", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  late: { label: "Late", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  repair: { label: "In Repair", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  open: { label: "Open", cls: "bg-info/15 text-info border-info/30" },
  in_progress: { label: "In Progress", cls: "bg-info/15 text-info border-info/30" },
  wfh: { label: "WFH", cls: "bg-info/15 text-info border-info/30" },
  assigned: { label: "Assigned", cls: "bg-info/15 text-info border-info/30" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  absent: { label: "Absent", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  overdue: { label: "Overdue", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", m.cls)}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {m.label}
    </span>
  );
}
