import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DataCard, StatCard, StatusBadge, EmptyState, ApprovalTimeline } from "@/components/ui-kit";
import { useLeave, LEAVE_BALANCES, LEAVE_TYPE_LABEL, HOLIDAYS } from "@/lib/leave-store";
import { CalendarDays, Hourglass, CheckCircle2, Plane, Plus, Home, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/leave-wfh/")({
  component: LeaveDashboard,
});

function LeaveDashboard() {
  const { requests, cancel } = useLeave();
  const mine = requests.filter((r) => r.employee === "You");
  const pending = mine.filter((r) => r.status === "pending_manager");
  const upcoming = mine
    .filter((r) => r.status === "approved" && new Date(r.fromDate) >= new Date())
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  const usedTotal = LEAVE_BALANCES.reduce((s, b) => s + b.used, 0);
  const balanceTotal = LEAVE_BALANCES.reduce((s, b) => s + b.total, 0);

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard label="Available leave" value={`${balanceTotal - usedTotal}`} hint={`of ${balanceTotal} days`} icon={CalendarDays} tone="primary" />
        <StatCard label="Pending approvals" value={pending.length} icon={Hourglass} tone="warning" />
        <StatCard label="Approved (YTD)" value={mine.filter((r) => r.status === "approved").length} icon={CheckCircle2} tone="success" />
        <StatCard label="Upcoming" value={upcoming.length} icon={Plane} tone="info" />
      </div>

      <DataCard
        title="Leave balances"
        description="Annual entitlement & utilisation"
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" className="rounded-full"><Link to="/leave-wfh/apply-leave"><Plus className="mr-1.5 h-4 w-4" /> Apply leave</Link></Button>
            <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/leave-wfh/apply-wfh"><Home className="mr-1.5 h-4 w-4" /> Apply WFH</Link></Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEAVE_BALANCES.map((b) => {
            const remaining = b.total - b.used;
            const pct = (b.used / b.total) * 100;
            return (
              <div key={b.type} className="rounded-2xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">{LEAVE_TYPE_LABEL[b.type]}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{remaining}<span className="text-sm font-medium text-muted-foreground"> / {b.total}</span></p>
                <Progress value={pct} className="mt-3 h-1.5" />
                <p className="mt-1.5 text-[11px] text-muted-foreground">{b.used} used</p>
              </div>
            );
          })}
        </div>
      </DataCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="My requests" description="Recent leave & WFH activity" className="lg:col-span-2">
          {mine.length === 0 ? (
            <EmptyState title="No requests yet" description="Apply for leave or WFH to get started." />
          ) : (
            <ul className="divide-y">
              {mine.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                      <span className="font-medium">{r.kind === "wfh" ? "WFH" : LEAVE_TYPE_LABEL[r.leaveType!]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.fromDate} → {r.toDate} · {r.duration} day{r.duration > 1 ? "s" : ""}{r.halfDay ? " (half)" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status === "pending_manager" ? "pending" : r.status} />
                    {r.status === "pending_manager" && (
                      <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => { cancel(r.id); toast("Request cancelled"); }}>
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
          <ul className="space-y-3 text-sm">
            {HOLIDAYS.slice(0, 5).map((h) => (
              <li key={h.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.region}{h.optional ? " · Optional" : ""}</p>
                </div>
                <span className="text-xs font-semibold text-primary">{new Date(h.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      {pending[0] && (
        <DataCard title="Approval timeline" description={`Tracking ${pending[0].id}`}>
          <ApprovalTimeline
            steps={[
              { approver: pending[0].employee, role: "Requester", status: "approved", at: pending[0].createdAt },
              { approver: pending[0].manager, role: "Reporting manager", status: "pending" },
              { approver: "HR Operations", role: "HR business partner", status: "skipped" },
            ]}
          />
        </DataCard>
      )}
    </div>
  );
}
