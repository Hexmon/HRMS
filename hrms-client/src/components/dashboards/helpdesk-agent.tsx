import {
  LifeBuoy,
  Inbox,
  ClipboardCheck,
  AlarmClock,
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatCard, DataCard, ChartCard, StatusBadge, EmptyState } from "@/components/ui-kit";
import { MiniBars, MiniArea, ProgressBar, CHART_COLORS } from "./shared";

const slaTrend = [
  { label: "Mon", v: 92 },
  { label: "Tue", v: 88 },
  { label: "Wed", v: 95 },
  { label: "Thu", v: 90 },
  { label: "Fri", v: 96 },
  { label: "Sat", v: 100 },
  { label: "Sun", v: 100 },
];

const byCategory = [
  { label: "IT", v: 12 },
  { label: "HR", v: 6 },
  { label: "Finance", v: 4 },
  { label: "Facilities", v: 2 },
];

const newTickets = [
  {
    id: "TKT-12018",
    title: "Slack workspace SSO error",
    who: "Mei Lin",
    priority: "High",
    at: "8 min ago",
  },
  {
    id: "TKT-12019",
    title: "Docking station not detected",
    who: "Daniel Park",
    priority: "Medium",
    at: "22 min ago",
  },
];

const myTickets = [
  {
    id: "TKT-12001",
    title: "VPN not connecting from Lagos",
    who: "Olu Adeyemi",
    status: "in_progress" as const,
    priority: "High",
    sla: "2h left",
  },
  {
    id: "TKT-12015",
    title: "Code editor licence expired",
    who: "Daniel Park",
    status: "open" as const,
    priority: "Low",
    sla: "On track",
  },
  {
    id: "TKT-12017",
    title: "Laptop overheating",
    who: "Hana Kobayashi",
    status: "open" as const,
    priority: "High",
    sla: "Breaching",
  },
];

const overdue = [
  { id: "TKT-11990", title: "Reimbursement delay query", who: "Fatima Noor", overdue: "1d 4h" },
];

export function HelpdeskAgentDashboard() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="New tickets" value="4" hint="Last 24h" icon={Inbox} tone="primary" />
        <StatCard
          label="Assigned to me"
          value="3"
          hint="2 in progress"
          icon={ClipboardCheck}
          tone="info"
        />
        <StatCard
          label="Overdue"
          value="1"
          hint="Action now"
          icon={AlarmClock}
          tone="destructive"
        />
        <StatCard label="High priority" value="2" icon={AlertTriangle} tone="warning" />
        <StatCard
          label="Resolved today"
          value="7"
          hint="+3 vs avg"
          icon={BadgeCheck}
          tone="success"
        />
        <StatCard
          label="SLA performance"
          value="94%"
          hint="Last 7 days"
          icon={Activity}
          tone="success"
          trend={{ value: "2%", direction: "up" }}
        />
        <StatCard label="Avg first response" value="14 min" icon={AlarmClock} tone="info" />
        <StatCard label="Reopen rate" value="3%" icon={Activity} tone="primary" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="SLA performance"
          subtitle="Last 7 days · % within SLA"
          className="lg:col-span-2"
        >
          <MiniArea data={slaTrend} height={200} color={CHART_COLORS.SUCCESS} />
        </ChartCard>

        <ChartCard title="Tickets by category" subtitle="Open · this week">
          <MiniBars data={byCategory} height={200} color={CHART_COLORS.PRIMARY} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard
          title="New tickets"
          description="Unassigned · just in"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/helpdesk">
                Open queue <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {newTickets.length === 0 ? (
            <EmptyState icon={Inbox} title="No new tickets" description="You're caught up." />
          ) : (
            <ul className="divide-y">
              {newTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.who} · {t.at}
                    </p>
                  </div>
                  <StatusBadge status="open" label={t.priority} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Assigned to me" padded={false}>
          {myTickets.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="No tickets assigned" />
          ) : (
            <ul className="divide-y">
              {myTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.who} · SLA {t.sla}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Overdue tickets" description="Past SLA — escalate" padded={false}>
          {overdue.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="Nothing overdue"
              description="SLA is healthy today."
            />
          ) : (
            <ul className="divide-y">
              {overdue.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.id} · {t.who}
                    </p>
                  </div>
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    Overdue {t.overdue}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Category mix" description="Today" padded>
          <div className="space-y-3">
            {byCategory.map((c) => (
              <div key={c.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-medium">{c.v}</span>
                </div>
                <ProgressBar value={(c.v / 12) * 100} tone="primary" />
              </div>
            ))}
          </div>
        </DataCard>
      </div>
    </>
  );
}
