import {
  Users, UserCheck, UserPlus, CalendarDays, Home, Briefcase, Timer, Receipt, LifeBuoy,
  Laptop, AlarmClock, Cake, Megaphone, ClipboardCheck, Activity, ShieldAlert, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import {
  StatCard, DataCard, ChartCard, StatusBadge, UserAvatar, EmptyState,
} from "@/components/ui-kit";
import { AUDIT_LOGS, EMPLOYEES, NOTIFICATIONS, PROJECTS, TIMESHEETS, EXPENSES, TICKETS, ASSETS } from "@/lib/mock";
import { MiniArea, MiniBars, DonutChart, ProgressBar, CHART_COLORS } from "./shared";

const attendanceTrend = [
  { label: "Mon", v: 218 }, { label: "Tue", v: 224 }, { label: "Wed", v: 220 },
  { label: "Thu", v: 230 }, { label: "Fri", v: 226 }, { label: "Sat", v: 168 }, { label: "Sun", v: 142 },
];

const departmentMix = [
  { name: "Engineering", value: 112 },
  { name: "Design", value: 24 },
  { name: "Sales", value: 38 },
  { name: "Finance", value: 18 },
  { name: "Operations", value: 56 },
];

const noticePeriod = [
  { name: "Carlos Mendes", role: "QA Engineer", lastDay: "May 28, 2026" },
  { name: "Lily Chen", role: "Account Executive", lastDay: "Jun 14, 2026" },
];

const birthdays = [
  { name: "Daniel Park", role: "Senior Engineer" },
  { name: "Hana Kobayashi", role: "Data Analyst" },
];

export function MainAdminDashboard() {
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total employees" value="248" hint="+8 this month" icon={Users} tone="primary" trend={{ value: "3.4%", direction: "up" }} />
        <StatCard label="Active employees" value="238" hint="10 inactive" icon={UserCheck} tone="success" />
        <StatCard label="New joiners (30d)" value="8" hint="3 onboarding" icon={UserPlus} tone="info" />
        <StatCard label="On leave today" value="14" hint="6 teams" icon={CalendarDays} tone="warning" />
        <StatCard label="WFH today" value="42" hint="17% of org" icon={Home} tone="info" />
        <StatCard label="Active projects" value="11" hint="3 closing soon" icon={Briefcase} tone="primary" />
        <StatCard label="Pending timesheets" value="22" hint="for week 19" icon={Timer} tone="warning" />
        <StatCard label="Pending expenses" value="USD 2,184" hint="12 claims" icon={Receipt} tone="warning" />
        <StatCard label="Open tickets" value="9" hint="2 high priority" icon={LifeBuoy} tone="info" />
        <StatCard label="Assets assigned" value="548 / 612" icon={Laptop} tone="primary" />
        <StatCard label="Notice period" value="3" hint="Action: backfill" icon={AlarmClock} tone="destructive" />
        <StatCard label="Birthdays today" value="2" icon={Cake} tone="success" />
      </div>

      {/* Attendance & department mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Attendance & productivity" subtitle="Daily present headcount this week" className="lg:col-span-2">
          <MiniArea data={attendanceTrend} height={200} color={CHART_COLORS.PRIMARY} />
        </ChartCard>
        <ChartCard title="Headcount by department">
          <DonutChart data={departmentMix} height={200} />
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {departmentMix.map((d, i) => (
              <li key={d.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{
                  background: [CHART_COLORS.PRIMARY, CHART_COLORS.INFO, CHART_COLORS.SUCCESS, CHART_COLORS.WARNING, CHART_COLORS.DESTRUCTIVE][i % 5],
                }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium">{d.value}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      {/* Approvals + announcements */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard
          title="Approval queue"
          description="Cross-team requests awaiting your action"
          className="lg:col-span-2"
          padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/leave-wfh">Review all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          <ul className="divide-y">
            {[
              { who: "Mei Lin", what: "Earned leave · 2 days", kind: "Leave", status: "pending" as const, at: "10 min ago" },
              { who: "Daniel Park", what: "Timesheet · Week 19", kind: "Timesheet", status: "pending" as const, at: "32 min ago" },
              { who: "Fatima Noor", what: "Expense · USD 215.75", kind: "Expense", status: "pending" as const, at: "1 hr ago" },
              { who: "Olu Adeyemi", what: "WFH · Tomorrow", kind: "WFH", status: "pending" as const, at: "2 hr ago" },
            ].map((r) => (
              <li key={r.who + r.what} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <UserAvatar name={r.who} subtitle={r.what} size="sm" showMeta />
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-muted-foreground sm:block">{r.at}</span>
                  <StatusBadge status={r.status} label={r.kind} />
                </div>
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="Announcements" description="Workspace-wide updates" padded={false}
          actions={<Button size="sm" variant="ghost" className="text-primary"><Megaphone className="mr-1 h-3.5 w-3.5" />New</Button>}
        >
          <ul className="divide-y">
            {NOTIFICATIONS.slice(0, 4).map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{n.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      {/* Notice + birthdays + audit */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Notice period" description="Plan handovers" padded={false}>
          {noticePeriod.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No exits this month" description="You're all clear." />
          ) : (
            <ul className="divide-y">
              {noticePeriod.map((n) => (
                <li key={n.name} className="flex items-center justify-between px-5 py-3.5">
                  <UserAvatar name={n.name} subtitle={n.role} size="sm" showMeta />
                  <span className="text-xs text-muted-foreground">Last day · {n.lastDay}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Birthdays today" description="Send a kind note" padded={false}>
          {birthdays.length === 0 ? (
            <EmptyState icon={Cake} title="No birthdays today" />
          ) : (
            <ul className="divide-y">
              {birthdays.map((b) => (
                <li key={b.name} className="flex items-center justify-between px-5 py-3.5">
                  <UserAvatar name={b.name} subtitle={b.role} size="sm" showMeta />
                  <Button size="sm" variant="outline" className="rounded-full">Wish</Button>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Recent audit activity" description="Last admin events" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/admin-settings">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          <ul className="divide-y">
            {AUDIT_LOGS.slice(0, 4).map((a) => (
              <li key={a.id} className="px-5 py-3">
                <p className="text-sm font-medium leading-tight">{a.actor} <span className="text-muted-foreground">· {a.action}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.module} · {a.target} · {a.at}</p>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
