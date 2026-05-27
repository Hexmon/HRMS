import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DataCard, StatCard, StatusBadge, EmptyState, ApprovalTimeline } from "@/components/ui-kit";
import { LEAVE_TYPE_LABEL } from "@/lib/leave-store";
import { CalendarDays, Hourglass, CheckCircle2, Plane, Plus, Home, X } from "lucide-react";
import { toast } from "sonner";
import {
  balancesFromResponse,
  holidaysFromResponse,
  requestsFromPage,
  useCancelLeaveMutation,
  useHolidays,
  useMyLeaveBalances,
  useMyLeaveRequests,
  useMyWfhRequests,
} from "@/domains/leave-wfh";
import { userFacingErrorMessage } from "@/shared/api";

export const Route = createFileRoute("/_app/leave-wfh/")({
  component: LeaveDashboard,
});

function LeaveDashboard() {
  const year = new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances({ year, page: 1, page_size: 25 });
  const leaveQuery = useMyLeaveRequests({ year, page: 1, page_size: 25 });
  const wfhQuery = useMyWfhRequests({ year, page: 1, page_size: 25 });
  const holidaysQuery = useHolidays({ year, page: 1, page_size: 25 });
  const cancelMutation = useCancelLeaveMutation();
  const balances = balancesFromResponse(balancesQuery.data);
  const holidays = holidaysFromResponse(holidaysQuery.data);
  const mine = [...requestsFromPage(leaveQuery.data), ...requestsFromPage(wfhQuery.data)].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
  const pending = mine.filter((r) => r.status === "pending_manager");
  const upcoming = mine
    .filter((r) => r.status === "approved" && new Date(r.fromDate) >= new Date())
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  const availableTotal = balances.reduce((s, b) => s + b.available, 0);
  const balanceTotal = balances.reduce((s, b) => s + b.total, 0);
  const isLoading =
    balancesQuery.isLoading ||
    leaveQuery.isLoading ||
    wfhQuery.isLoading ||
    holidaysQuery.isLoading;
  const loadError =
    balancesQuery.error ?? leaveQuery.error ?? wfhQuery.error ?? holidaysQuery.error ?? null;

  const cancelLeave = async (id: string, expectedVersion: number) => {
    try {
      await cancelMutation.mutateAsync({
        id,
        input: { expected_version: expectedVersion },
      });
      toast("Request cancelled");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loadError) {
    return (
      <div className="pt-2">
        <DataCard title="Leave & WFH unavailable" description="Current year">
          <EmptyState title="Could not load Leave/WFH data" description={errorMessage(loadError)} />
        </DataCard>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard
          label="Available leave"
          value={isLoading ? "..." : `${availableTotal}`}
          hint={`of ${balanceTotal} days`}
          icon={CalendarDays}
          tone="primary"
        />
        <StatCard
          label="Pending approvals"
          value={isLoading ? "..." : pending.length}
          icon={Hourglass}
          tone="warning"
        />
        <StatCard
          label="Approved (YTD)"
          value={isLoading ? "..." : mine.filter((r) => r.status === "approved").length}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Upcoming"
          value={isLoading ? "..." : upcoming.length}
          icon={Plane}
          tone="info"
        />
      </div>

      <DataCard
        title="Leave balances"
        description="Annual entitlement & utilisation"
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" className="rounded-full">
              <Link to="/leave-wfh/apply-leave">
                <Plus className="mr-1.5 h-4 w-4" /> Apply leave
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/leave-wfh/apply-wfh">
                <Home className="mr-1.5 h-4 w-4" /> Apply WFH
              </Link>
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading leave balances...</p>
          ) : balances.length === 0 ? (
            <EmptyState
              title="No leave balances"
              description="No leave balance records are available."
            />
          ) : (
            balances.map((b) => {
              const remaining = b.available;
              const pct = b.total > 0 ? (b.used / b.total) * 100 : 0;
              return (
                <div key={b.leaveType} className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{b.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {remaining}
                    <span className="text-sm font-medium text-muted-foreground"> / {b.total}</span>
                  </p>
                  <Progress value={pct} className="mt-3 h-1.5" />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {b.used} used · {b.pending} pending
                  </p>
                </div>
              );
            })
          )}
        </div>
      </DataCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard
          title="My requests"
          description="Recent leave & WFH activity"
          className="lg:col-span-2"
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading Leave/WFH requests...</p>
          ) : mine.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="Apply for leave or WFH to get started."
            />
          ) : (
            <ul className="divide-y">
              {mine.slice(0, 6).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                      <span className="font-medium">
                        {r.kind === "wfh" ? "WFH" : LEAVE_TYPE_LABEL[r.leaveType!]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.fromDate} → {r.toDate} · {r.duration} day{r.duration > 1 ? "s" : ""}
                      {r.halfDay ? " (half)" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status === "pending_manager" ? "pending" : r.status} />
                    {r.kind === "leave" && r.status === "pending_manager" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full"
                        disabled={cancelMutation.isPending}
                        onClick={() => void cancelLeave(r.id, r.expectedVersion ?? 1)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Upcoming holidays">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading holidays...</p>
          ) : holidays.length === 0 ? (
            <EmptyState
              title="No holidays"
              description="No holidays are configured for this year."
            />
          ) : (
            <ul className="space-y-3 text-sm">
              {holidays.slice(0, 5).map((h) => (
                <li key={h.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.region}
                      {h.optional ? " · Optional" : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    {new Date(h.date).toLocaleDateString(undefined, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      {pending[0] && (
        <DataCard title="Approval timeline" description={`Tracking ${pending[0].id}`}>
          <ApprovalTimeline
            steps={[
              {
                approver: pending[0].employee,
                role: "Requester",
                status: "approved",
                at: pending[0].createdAt,
              },
              { approver: pending[0].manager, role: "Reporting manager", status: "pending" },
              { approver: "HR Operations", role: "HR business partner", status: "skipped" },
            ]}
          />
        </DataCard>
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Leave/WFH request failed.");
}
