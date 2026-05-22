import {
  AlertCircle,
  Boxes,
  Building2,
  ClipboardCheck,
  FileCheck2,
  Laptop,
  Receipt,
  Timer,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataCard, EmptyState, SkeletonStats, StatCard, StatusBadge } from "@/components/ui-kit";
import type { DashboardMetric, DashboardSummary } from "@/domains/dashboard";

interface Props {
  summary?: DashboardSummary;
  loading: boolean;
  error?: Error | null;
}

const CARD_META: Record<
  string,
  {
    icon: typeof Users;
    tone: "primary" | "success" | "warning" | "info" | "destructive";
  }
> = {
  active_employees: { icon: Users, tone: "primary" },
  pending_expense_approvals: { icon: Receipt, tone: "warning" },
  pending_timesheet_approvals: { icon: Timer, tone: "warning" },
  assigned_assets: { icon: Laptop, tone: "success" },
  documents_pending_verification: { icon: FileCheck2, tone: "info" },
  submitted_hours: { icon: ClipboardCheck, tone: "primary" },
};

export function BackendDashboardSummary({ summary, loading, error }: Props) {
  if (loading) {
    return <SkeletonStats count={6} className="md:grid-cols-3 xl:grid-cols-6" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Dashboard data unavailable</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {summary.cards.map((card) => {
          const meta = CARD_META[card.key] ?? { icon: ClipboardCheck, tone: "primary" as const };
          return (
            <StatCard
              key={card.key}
              label={card.label}
              value={formatMetricValue(card)}
              hint={metricHint(card, summary)}
              icon={meta.icon}
              tone={meta.tone}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Headcount by department" padded={false}>
          {summary.workforce.departments.length === 0 ? (
            <EmptyState icon={Building2} title="No active departments" />
          ) : (
            <ul className="divide-y">
              {summary.workforce.departments.map((department) => (
                <li
                  key={department.department_id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{department.name}</p>
                    <p className="text-xs text-muted-foreground">{department.department_code}</p>
                  </div>
                  <span className="text-sm font-semibold">{department.active_employees}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Approval queue" padded={false}>
          <ul className="divide-y">
            <QueueRow
              label="Manager expenses"
              value={summary.approvals.expense_manager_pending}
              status="pending"
            />
            <QueueRow
              label="Finance expenses"
              value={summary.approvals.expense_finance_pending}
              status="pending"
            />
            <QueueRow
              label="Timesheets"
              value={summary.approvals.timesheet_pending}
              status="pending"
            />
            <QueueRow
              label="Documents"
              value={summary.approvals.document_verification_pending}
              status="pending"
            />
          </ul>
        </DataCard>

        <DataCard title="Operations" padded={false}>
          <ul className="divide-y">
            <QueueRow label="Total assets" value={summary.operations.assets_total} icon={Boxes} />
            <QueueRow
              label="Asset recoveries"
              value={summary.operations.assets_recovery_pending}
              status="pending"
            />
            <QueueRow
              label="Notifications"
              value={summary.operations.notifications_pending}
              status="pending"
            />
            <QueueRow label="Sync queue" value={summary.operations.outbox_pending} />
          </ul>
        </DataCard>
      </div>
    </div>
  );
}

function QueueRow({
  label,
  value,
  status,
  icon: Icon,
}: {
  label: string;
  value: number;
  status?: string;
  icon?: typeof Boxes;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{value}</span>
        {status && value > 0 && <StatusBadge status={status} />}
      </div>
    </li>
  );
}

function formatMetricValue(metric: DashboardMetric): string {
  if (typeof metric.value === "number") return metric.value.toLocaleString();
  if (metric.unit === "hours") return `${metric.value} h`;
  return metric.value;
}

function metricHint(metric: DashboardMetric, summary: DashboardSummary): string | undefined {
  switch (metric.key) {
    case "active_employees":
      return `${summary.workforce.visible_employees.toLocaleString()} visible`;
    case "pending_expense_approvals":
      return `${summary.approvals.expense_total_pending.toLocaleString()} waiting`;
    case "pending_timesheet_approvals":
      return `${summary.workload.timesheet_submissions_total.toLocaleString()} submissions`;
    case "assigned_assets":
      return `${summary.operations.assets_assigned.toLocaleString()} / ${summary.operations.assets_total.toLocaleString()}`;
    case "documents_pending_verification":
      return "Needs review";
    case "submitted_hours":
      return `${summary.workload.work_segments_total.toLocaleString()} segments`;
    default:
      return undefined;
  }
}
