import { Users, ClipboardCheck, Receipt, Activity, Timer, LifeBuoy, ChevronRight, AlertTriangle, CalendarDays } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatCard, DataCard, ChartCard, StatusBadge, UserAvatar, EmptyState } from "@/components/ui-kit";
import { MiniArea, ProgressBar, CHART_COLORS } from "./shared";

const utilTrend = [
  { label: "W14", v: 76 }, { label: "W15", v: 80 }, { label: "W16", v: 78 },
  { label: "W17", v: 84 }, { label: "W18", v: 82 }, { label: "W19", v: 86 },
];

const team = [
  { name: "Daniel Park", role: "Senior SWE", util: 92, status: "present" as const },
  { name: "Fatima Noor", role: "Backend Eng.", util: 88, status: "present" as const },
  { name: "Jacob Owens", role: "DevOps Eng.", util: 80, status: "wfh" as const },
  { name: "Hana Kobayashi", role: "Data Analyst", util: 64, status: "absent" as const },
  { name: "Olu Adeyemi", role: "Platform Eng.", util: 78, status: "present" as const },
];

const approvals = [
  { who: "Daniel Park", what: "Timesheet · 38h", kind: "Timesheet", status: "pending" as const },
  { who: "Mei Lin", what: "Earned leave · 2 days", kind: "Leave", status: "pending" as const },
  { who: "Olu Adeyemi", what: "WFH · Tomorrow", kind: "WFH", status: "pending" as const },
];

const expenses = [
  { who: "Fatima Noor", what: "Client lunch · AED 215", status: "pending" as const },
  { who: "Daniel Park", what: "Travel · USD 482", status: "pending" as const },
];

const missingTs = [
  { name: "Hana Kobayashi", week: "Week 18 (1d missing)" },
  { name: "Carlos Mendes", week: "Week 19 (3d missing)" },
];

export function ManagerDashboard() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="My team" value="12" icon={Users} tone="primary" />
        <StatCard label="Present today" value="10" hint="2 on WFH/leave" icon={Activity} tone="success" />
        <StatCard label="Approval queue" value="5" hint="Leave + timesheet" icon={ClipboardCheck} tone="warning" />
        <StatCard label="Expenses pending" value="USD 698" icon={Receipt} tone="warning" />
        <StatCard label="Utilisation" value="86%" hint="+4% w/w" icon={Timer} tone="info" trend={{ value: "4%", direction: "up" }} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Team utilisation" subtitle="Weekly trend (last 6 weeks)" className="lg:col-span-2">
          <MiniArea data={utilTrend} height={200} color={CHART_COLORS.PRIMARY} />
        </ChartCard>

        <DataCard title="Productivity snapshot" description="Today" padded>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Hours logged</span>
                <span className="font-medium">76 / 96 h</span>
              </div>
              <ProgressBar value={(76 / 96) * 100} tone="primary" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Billable</span>
                <span className="font-medium">68%</span>
              </div>
              <ProgressBar value={68} tone="success" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">On-time delivery</span>
                <span className="font-medium">92%</span>
              </div>
              <ProgressBar value={92} tone="info" />
            </div>
          </div>
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Approval queue" description="Leave / WFH / timesheets" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/leave-wfh">Review <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          {approvals.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Inbox zero" description="No pending approvals." />
          ) : (
            <ul className="divide-y">
              {approvals.map((a) => (
                <li key={a.who + a.what} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <UserAvatar name={a.who} subtitle={a.what} size="sm" showMeta />
                  <StatusBadge status={a.status} label={a.kind} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Expense approvals" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/expenses">Review <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          {expenses.length === 0 ? (
            <EmptyState icon={Receipt} title="No expenses to review" />
          ) : (
            <ul className="divide-y">
              {expenses.map((e) => (
                <li key={e.who + e.what} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <UserAvatar name={e.who} subtitle={e.what} size="sm" showMeta />
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Team members" description="Today's status" className="lg:col-span-2" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/employees">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          <ul className="divide-y">
            {team.map((m) => (
              <li key={m.name} className="grid grid-cols-12 items-center gap-3 px-5 py-3.5">
                <div className="col-span-12 sm:col-span-5">
                  <UserAvatar name={m.name} subtitle={m.role} size="sm" showMeta />
                </div>
                <div className="col-span-8 sm:col-span-5 space-y-1.5">
                  <ProgressBar value={m.util} tone={m.util > 85 ? "success" : m.util > 70 ? "primary" : "warning"} />
                  <p className="text-[11px] text-muted-foreground">{m.util}% utilised</p>
                </div>
                <div className="col-span-4 sm:col-span-2 sm:text-right">
                  <StatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="Missing timesheets" description="Nudge your team" padded={false}>
          {missingTs.length === 0 ? (
            <EmptyState icon={Timer} title="All timesheets in" />
          ) : (
            <ul className="divide-y">
              {missingTs.map((m) => (
                <li key={m.name} className="flex items-center justify-between px-5 py-3.5">
                  <UserAvatar name={m.name} subtitle={m.week} size="sm" showMeta />
                  <Button size="sm" variant="outline" className="rounded-full">Nudge</Button>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Team leave & WFH" description="Next 14 days" padded={false}>
          <ul className="divide-y">
            {[
              { who: "Mei Lin", reason: "Earned leave · May 14–16", status: "approved" as const },
              { who: "Jacob Owens", reason: "WFH · May 13", status: "approved" as const },
              { who: "Olu Adeyemi", reason: "WFH · Tomorrow", status: "pending" as const },
            ].map((l) => (
              <li key={l.who + l.reason} className="flex items-center justify-between px-5 py-3.5">
                <UserAvatar name={l.who} subtitle={l.reason} size="sm" showMeta />
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="Team helpdesk" description="Active issues affecting your team" padded={false}>
          <ul className="divide-y">
            {[
              { id: "TKT-12001", title: "VPN not connecting from Lagos", who: "Olu Adeyemi", status: "in_progress" as const },
              { id: "TKT-12015", title: "Code editor licence expired", who: "Daniel Park", status: "open" as const },
            ].map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.id} · {t.who}</p>
                </div>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
