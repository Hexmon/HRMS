import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  Clock,
  CalendarDays,
  LifeBuoy,
  ClipboardCheck,
  Activity,
  Plus,
  CalendarPlus,
  Timer,
  Receipt,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth, ROLE_MAP } from "@/lib/auth";
import {
  StatCard,
  DataCard,
  QuickActionCard,
  ApprovalTimeline,
  StatusBadge,
  UserAvatar,
} from "@/components/ui-kit";
import { NOTIFICATIONS } from "@/lib/mock";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const ROLE_STATS: Record<string, { label: string; value: string; hint?: string; icon: any; tone: any }[]> = {
  main_admin: [
    { label: "Total headcount", value: "248", hint: "+8 this month", icon: Users, tone: "primary" },
    { label: "Present today", value: "212", hint: "85% of org", icon: Clock, tone: "success" },
    { label: "On leave", value: "14", hint: "Across 6 teams", icon: CalendarDays, tone: "warning" },
    { label: "Open tickets", value: "9", hint: "2 high priority", icon: LifeBuoy, tone: "info" },
    { label: "Pending approvals", value: "17", hint: "Action required", icon: ClipboardCheck, tone: "primary" },
    { label: "Team utilization", value: "86%", hint: "+4% w/w", icon: Activity, tone: "success" },
  ],
  hr_admin: [
    { label: "Active employees", value: "238", hint: "10 inactive", icon: Users, tone: "primary" },
    { label: "Present today", value: "212", icon: Clock, tone: "success" },
    { label: "Leave requests", value: "12", hint: "Pending approval", icon: CalendarDays, tone: "warning" },
    { label: "New joiners (30d)", value: "8", icon: ClipboardCheck, tone: "info" },
  ],
  manager: [
    { label: "My team", value: "12", icon: Users, tone: "primary" },
    { label: "Present today", value: "10", icon: Clock, tone: "success" },
    { label: "Pending approvals", value: "5", hint: "Leave + timesheet", icon: ClipboardCheck, tone: "warning" },
    { label: "Team utilization", value: "82%", icon: Activity, tone: "info" },
  ],
  project_manager: [
    { label: "Active projects", value: "4", icon: Briefcase, tone: "primary" },
    { label: "Allocated members", value: "31", icon: Users, tone: "info" },
    { label: "Timesheets pending", value: "6", icon: Timer, tone: "warning" },
    { label: "On track", value: "3 / 4", icon: Activity, tone: "success" },
  ],
  finance_manager: [
    { label: "Pending claims", value: "USD 1,284", icon: Receipt, tone: "warning" },
    { label: "Approved this month", value: "USD 18,742", icon: ClipboardCheck, tone: "success" },
    { label: "Paid YTD", value: "USD 142,901", icon: Activity, tone: "primary" },
    { label: "Avg cycle time", value: "2.4 days", icon: Clock, tone: "info" },
  ],
  asset_admin: [
    { label: "Assets in fleet", value: "612", icon: Briefcase, tone: "primary" },
    { label: "Assigned", value: "548", icon: Users, tone: "success" },
    { label: "In repair", value: "9", icon: Activity, tone: "warning" },
    { label: "IT tickets open", value: "5", icon: LifeBuoy, tone: "info" },
  ],
  helpdesk_agent: [
    { label: "Open tickets", value: "9", icon: LifeBuoy, tone: "primary" },
    { label: "Assigned to me", value: "4", icon: ClipboardCheck, tone: "info" },
    { label: "Resolved today", value: "7", icon: Activity, tone: "success" },
    { label: "Breaching SLA", value: "1", icon: Clock, tone: "warning" },
  ],
  employee: [
    { label: "Leave balance", value: "12 d", icon: CalendarDays, tone: "primary" },
    { label: "Hours this week", value: "32 / 40", icon: Timer, tone: "info" },
    { label: "Pending claims", value: "1", icon: Receipt, tone: "warning" },
    { label: "Open tickets", value: "0", icon: LifeBuoy, tone: "success" },
  ],
};

function Dashboard() {
  const { user, activeRole } = useAuth();
  const greeting =
    new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  if (!user || !activeRole) return null;
  const stats = ROLE_STATS[activeRole] ?? ROLE_STATS.employee;

  const approvalSteps = [
    { approver: "Sara Iqbal", role: "Engineering Manager", status: "approved" as const, at: "May 8 · 10:14", remark: "Coverage confirmed for those days." },
    { approver: "Rahul Verma", role: "HR Director", status: "pending" as const },
    { approver: "Aanya Mehta", role: "Main Admin", status: "skipped" as const },
  ];

  return (
    <>
      {/* Hero */}
      <Card className="overflow-hidden rounded-3xl border-border/60 p-0 shadow-sm">
        <div className="relative p-6 sm:p-8" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-primary/80">
                {ROLE_MAP[activeRole].label} workspace
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {greeting}, {user.name.split(" ")[0]} 👋
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{ROLE_MAP[activeRole].description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/leave-wfh">Apply for leave</Link>
              </Button>
              <Button
                asChild
                className="rounded-full text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Link to="/timesheet">Log timesheet</Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Quick actions" description="Jump straight into a workflow." className="lg:col-span-2" padded={false}>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <QuickActionCard icon={CalendarPlus} title="Apply for leave" description="Casual, sick or earned leave." to="/leave-wfh" />
            <QuickActionCard icon={Timer} title="Log time" description="Submit your weekly timesheet." to="/timesheet" />
            <QuickActionCard icon={Receipt} title="New expense" description="Submit a claim for reimbursement." to="/expenses" />
            <QuickActionCard icon={LifeBuoy} title="Raise a ticket" description="IT, HR or finance support." to="/helpdesk" />
            <QuickActionCard icon={Users} title="Invite employee" description="Send a welcome invite." to="/employees" />
            <QuickActionCard icon={Plus} title="New project" description="Spin up a delivery workspace." to="/projects" />
          </div>
        </DataCard>

        <DataCard
          title="Recent activity"
          description="What's happening in your workspace."
          padded={false}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard
          title="Approval timeline"
          description="Sample multi-level approval flow."
          actions={<StatusBadge status="pending" />}
        >
          <ApprovalTimeline steps={approvalSteps} />
        </DataCard>

        <DataCard
          title="Your team"
          description="Reporting members at a glance."
          actions={
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link to="/employees">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          }
          padded={false}
        >
          <ul className="divide-y">
            {[
              { name: "Daniel Park", role: "Senior Software Engineer", status: "present" },
              { name: "Mei Lin", role: "Product Designer", status: "wfh" },
              { name: "Fatima Noor", role: "Backend Engineer", status: "absent" },
              { name: "Hana Kobayashi", role: "Data Analyst", status: "present" },
            ].map((m) => (
              <li key={m.name} className="flex items-center justify-between px-5 py-3.5">
                <UserAvatar name={m.name} subtitle={m.role} size="sm" showMeta />
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
