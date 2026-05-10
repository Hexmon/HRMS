import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { DASHBOARD_STATS, LEAVES, PROJECTS, TICKETS } from "@/lib/mock-data";
import { ArrowUpRight, Clock, Users, CalendarDays, LifeBuoy, ClipboardCheck, Activity, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const stats = [
  { label: "Total headcount", value: DASHBOARD_STATS.headcount, change: "+8 this month", icon: Users, tone: "primary" },
  { label: "Present today", value: DASHBOARD_STATS.presentToday, change: "85% of org", icon: Clock, tone: "success" },
  { label: "On leave", value: DASHBOARD_STATS.onLeave, change: "Across 6 teams", icon: CalendarDays, tone: "warning" },
  { label: "Open tickets", value: DASHBOARD_STATS.openTickets, change: "2 high priority", icon: LifeBuoy, tone: "info" },
  { label: "Pending approvals", value: DASHBOARD_STATS.pendingApprovals, change: "Requires your action", icon: ClipboardCheck, tone: "primary" },
  { label: "Team utilization", value: `${DASHBOARD_STATS.utilization}%`, change: "+4% vs last week", icon: Activity, tone: "success" },
] as const;

function Dashboard() {
  const { user, activeRole } = useAuth();
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      {/* Hero */}
      <Card className="overflow-hidden rounded-3xl border-border/60 p-0 shadow-sm">
        <div className="relative p-6 sm:p-8" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-primary/80">{activeRole && ROLE_LABELS[activeRole]} workspace</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {greeting}, {user?.name.split(" ")[0]} 👋
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Here's a snapshot of your organisation today. 17 items need your attention across approvals, tickets and timesheets.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/leave">Apply for leave</Link>
              </Button>
              <Button asChild className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
                <Link to="/timesheet">Log timesheet <ArrowUpRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-2xl border-border/60 p-5 transition hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.change}</p>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pending approvals */}
        <Card className="rounded-2xl border-border/60 lg:col-span-2">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h3 className="text-sm font-semibold">Pending approvals</h3>
              <p className="text-xs text-muted-foreground">Leave, WFH and timesheet requests awaiting your decision.</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link to="/leave">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          <ul className="divide-y">
            {LEAVES.filter((l) => l.status === "pending").map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary-soft text-primary text-xs font-semibold">
                      {l.employee.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{l.employee} <span className="text-muted-foreground">· {l.type}</span></p>
                    <p className="text-xs text-muted-foreground">{l.from} → {l.to} · {l.days} day{l.days > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={l.status} />
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">Reject</Button>
                  <Button size="sm" className="bg-success text-success-foreground hover:opacity-90">Approve</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Tickets */}
        <Card className="rounded-2xl border-border/60">
          <div className="flex items-center justify-between border-b p-5">
            <h3 className="text-sm font-semibold">Helpdesk tickets</h3>
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link to="/helpdesk">All <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          <ul className="divide-y">
            {TICKETS.slice(0, 4).map((t) => (
              <li key={t.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{t.id} · {t.category}</p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-sm font-medium">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">By {t.raisedBy} · {t.priority} priority</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Active projects */}
      <Card className="rounded-2xl border-border/60">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h3 className="text-sm font-semibold">Active projects</h3>
            <p className="text-xs text-muted-foreground">Live progress across your portfolio.</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link to="/projects">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          {PROJECTS.filter((p) => p.status !== "completed").map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4 transition hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.client} · {p.team} members</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold">{p.progress}%</span>
              </div>
              <Progress value={p.progress} className="mt-1.5 h-1.5" />
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Due {p.dueDate}</span>
                <span>PM · {p.manager}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
