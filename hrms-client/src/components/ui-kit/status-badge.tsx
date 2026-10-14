import { cn } from "@/lib/utils";

type BadgeTone = {
  label: string;
  cls: string;
  dotCls?: string;
};

const SUCCESS_SOFT = "bg-success/15 text-foreground border-success/20";
const INFO_SOFT = "bg-info/15 text-foreground border-info/30";
const DESTRUCTIVE_SOFT = "bg-destructive/15 text-foreground border-destructive/30";
const WARNING_SOFT =
  "bg-warning/20 text-warning-foreground border-warning/40 dark:bg-warning/15 dark:text-warning dark:border-warning/30";

const success = (label: string): BadgeTone => ({
  label,
  cls: SUCCESS_SOFT,
  dotCls: "bg-success",
});

const info = (label: string): BadgeTone => ({
  label,
  cls: INFO_SOFT,
  dotCls: "bg-info",
});

const destructive = (label: string): BadgeTone => ({
  label,
  cls: DESTRUCTIVE_SOFT,
  dotCls: "bg-destructive",
});

const MAP: Record<string, BadgeTone> = {
  approved: success("Approved"),
  active: success("Active"),
  paid: success("Paid"),
  completed: success("Completed"),
  present: success("Present"),
  verified: success("Verified"),
  confirmed: success("Confirmed"),
  accepted: success("Accepted"),
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground border-border" },
  inactive: { label: "Inactive", cls: "bg-muted text-muted-foreground border-border" },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border" },
  exited: { label: "Exited", cls: "bg-muted text-muted-foreground border-border" },
  in_stock: { label: "In Stock", cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" },
  planned: info("Planned"),
  green: success("On track"),
  amber: { label: "At risk", cls: WARNING_SOFT },
  red: destructive("Critical"),
  fixed: info("Fixed"),
  hourly: info("Hourly"),
  retainer: info("Retainer"),
  internal: { label: "Internal", cls: "bg-muted text-muted-foreground border-border" },
  client: info("Client"),
  billable: success("Billable"),
  non_billable: { label: "Non-billable", cls: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", cls: WARNING_SOFT },
  warning: { label: "Warning", cls: WARNING_SOFT },
  provisional: { label: "Provisional", cls: WARNING_SOFT },
  review: { label: "Review", cls: WARNING_SOFT },
  review_required: { label: "Review required", cls: WARNING_SOFT },
  on_hold: { label: "On Hold", cls: WARNING_SOFT },
  late: { label: "Late", cls: WARNING_SOFT },
  repair: { label: "In Repair", cls: WARNING_SOFT },
  probation: { label: "Probation", cls: WARNING_SOFT },
  notice_period: {
    label: "Notice period",
    cls: WARNING_SOFT,
  },
  onboarding: info("Onboarding"),
  invited: info("Invited"),
  open: info("Open"),
  in_progress: info("In Progress"),
  wfh: info("WFH"),
  assigned: info("Assigned"),
  rejected: destructive("Rejected"),
  absent: destructive("Absent"),
  overdue: destructive("Overdue"),
  // Expense workflow
  submitted: info("Submitted"),
  pending_manager: {
    label: "Pending Manager",
    cls: WARNING_SOFT,
  },
  returned: {
    label: "Returned",
    cls: WARNING_SOFT,
  },
  manager_returned: {
    label: "Manager Returned",
    cls: WARNING_SOFT,
  },
  manager_rejected: {
    label: "Manager Rejected",
    cls: DESTRUCTIVE_SOFT,
    dotCls: "bg-destructive",
  },
  finance_verification: info("Finance Verification"),
  finance_hold: {
    label: "Finance Hold",
    cls: WARNING_SOFT,
  },
  finance_verified: success("Finance Verified"),
  payment_released: success("Payment Released"),
  bills_submitted: info("Bills Submitted"),
  settlement_review: {
    label: "Settlement Review",
    cls: WARNING_SOFT,
  },
  pending_adjustment: {
    label: "Pending Adjustment",
    cls: WARNING_SOFT,
  },
  withdrawn: { label: "Withdrawn", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const m = MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        m.cls,
        className,
      )}
    >
      <span
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full opacity-80",
          m.dotCls ?? "bg-current",
        )}
      />
      {label ?? m.label}
    </span>
  );
}
