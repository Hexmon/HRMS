import { Briefcase, Users, Timer, Activity, Receipt, AlertTriangle, ChevronRight, FileBarChart, BarChart3, GanttChart, FileSpreadsheet } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatCard, DataCard, ChartCard, StatusBadge, EmptyState, QuickActionCard } from "@/components/ui-kit";
import { PROJECTS } from "@/lib/mock";
import { MiniBars, DonutChart, ProgressBar, CHART_COLORS } from "./shared";

const billableMix = [
  { name: "Billable", value: 612, color: CHART_COLORS.PRIMARY },
  { name: "Non-billable", value: 184, color: CHART_COLORS.WARNING },
  { name: "Internal", value: 96, color: CHART_COLORS.INFO },
];

const projectHours = [
  { label: "Atlas", v: 312 },
  { label: "Helios", v: 248 },
  { label: "Nimbus", v: 96 },
  { label: "Orion", v: 32 },
];

const allocations = [
  { name: "Daniel Park", projects: ["Atlas"], pct: 100 },
  { name: "Fatima Noor", projects: ["Helios", "Nimbus"], pct: 90 },
  { name: "Jacob Owens", projects: ["Atlas"], pct: 80 },
  { name: "Hana Kobayashi", projects: ["Helios"], pct: 60 },
];

const delayedTasks = [
  { id: "TASK-3201", title: "Atlas · Payment retries spec", owner: "Daniel Park", overdue: 3 },
  { id: "TASK-3245", title: "Helios · Cohort dashboard", owner: "Hana Kobayashi", overdue: 2 },
];

const projectExpenses = [
  { project: "Atlas", amount: "USD 4,820" },
  { project: "Helios", amount: "USD 2,140" },
  { project: "Nimbus", amount: "USD 920" },
];

export function ProjectManagerDashboard() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Active projects" value="4" hint="3 on track" icon={Briefcase} tone="primary" />
        <StatCard label="Allocated members" value="31" hint="Across 4 projects" icon={Users} tone="info" />
        <StatCard label="Timesheets pending" value="6" hint="Action required" icon={Timer} tone="warning" />
        <StatCard label="On track" value="3 / 4" hint="1 at risk" icon={Activity} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Project health" description="Status & delivery progress" className="lg:col-span-2" padded={false}>
          <ul className="divide-y">
            {PROJECTS.map((p) => {
              const tone = p.status === "on_hold" ? "warning" : p.progress < 50 ? "info" : "primary";
              return (
                <li key={p.id} className="grid grid-cols-12 items-center gap-3 px-5 py-3.5">
                  <div className="col-span-12 sm:col-span-5">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.client} · Due {p.dueDate}</p>
                  </div>
                  <div className="col-span-8 sm:col-span-5 space-y-1.5">
                    <ProgressBar value={p.progress} tone={tone as any} />
                    <p className="text-[11px] text-muted-foreground">{p.progress}% complete · {p.team} members</p>
                  </div>
                  <div className="col-span-4 sm:col-span-2 sm:text-right">
                    <StatusBadge status={p.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </DataCard>

        <ChartCard title="Billable vs non-billable" subtitle="This month, hours">
          <DonutChart data={billableMix} height={170} />
          <ul className="mt-3 space-y-1 text-xs">
            {billableMix.map((d) => (
              <li key={d.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium">{d.value} h</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Hours by project" subtitle="This month" className="lg:col-span-2">
          <MiniBars data={projectHours} height={200} color={CHART_COLORS.PRIMARY} />
        </ChartCard>

        <DataCard title="Project expenses" description="This month" padded={false}>
          <ul className="divide-y">
            {projectExpenses.map((p) => (
              <li key={p.project} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium">{p.project}</p>
                </div>
                <span className="text-sm font-semibold">{p.amount}</span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Team allocation" description="Across active projects" className="lg:col-span-2" padded={false}>
          <ul className="divide-y">
            {allocations.map((a) => (
              <li key={a.name} className="grid grid-cols-12 items-center gap-3 px-5 py-3.5">
                <div className="col-span-12 sm:col-span-4">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.projects.join(", ")}</p>
                </div>
                <div className="col-span-9 sm:col-span-6">
                  <ProgressBar value={a.pct} tone={a.pct >= 90 ? "destructive" : a.pct >= 70 ? "primary" : "info"} />
                </div>
                <p className="col-span-3 sm:col-span-2 text-right text-sm font-semibold">{a.pct}%</p>
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="Delayed tasks" description="Overdue items" padded={false}>
          {delayedTasks.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="Nothing overdue" />
          ) : (
            <ul className="divide-y">
              {delayedTasks.map((t) => (
                <li key={t.id} className="px-5 py-3.5">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.owner} · {t.id}</p>
                  <p className="mt-1 inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                    Overdue {t.overdue}d
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <DataCard title="Project reports" description="Quick exports & shortcuts" padded={false}>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard icon={GanttChart} title="Delivery timeline" description="Gantt across projects" to="/reports" />
          <QuickActionCard icon={BarChart3} title="Utilisation report" description="By member & project" to="/reports" />
          <QuickActionCard icon={FileBarChart} title="Profitability" description="Billable hours vs cost" to="/reports" />
          <QuickActionCard icon={FileSpreadsheet} title="Timesheet export" description="CSV / XLSX" to="/timesheet" />
        </div>
      </DataCard>
    </>
  );
}
