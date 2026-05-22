import {
  Users,
  UserPlus,
  FileCheck2,
  CalendarDays,
  AlarmClock,
  ClipboardX,
  LifeBuoy,
  Megaphone,
  BookOpen,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  StatCard,
  DataCard,
  ChartCard,
  StatusBadge,
  UserAvatar,
  EmptyState,
} from "@/components/ui-kit";
import { MiniBars, CHART_COLORS } from "./shared";

const joiningPipeline = [
  { name: "Aria Kapoor", role: "Backend Engineer", stage: "Offer", date: "May 18" },
  { name: "Tom Becker", role: "Account Manager", stage: "Docs pending", date: "May 22" },
  { name: "Yuki Tanaka", role: "Product Manager", stage: "Background check", date: "Jun 03" },
];

const attendanceExceptions = [
  { name: "Olu Adeyemi", reason: "Late · 47 min", status: "late" as const },
  { name: "Carlos Mendes", reason: "Missed punch-in", status: "absent" as const },
  { name: "Mei Lin", reason: "Half-day · unapproved", status: "pending" as const },
];

const probation = [
  { name: "Aria Kapoor", end: "Aug 12, 2026" },
  { name: "Hana Kobayashi", end: "Aug 30, 2026" },
];

const newJoinersTrend = [
  { label: "Jan", v: 4 },
  { label: "Feb", v: 6 },
  { label: "Mar", v: 3 },
  { label: "Apr", v: 7 },
  { label: "May", v: 8 },
  { label: "Jun", v: 5 },
];

export function HrAdminDashboard() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Active employees"
          value="238"
          hint="10 inactive"
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="New joining pipeline"
          value="6"
          hint="3 in onboarding"
          icon={UserPlus}
          tone="info"
        />
        <StatCard
          label="Documents pending"
          value="14"
          hint="Verify identity & PAN"
          icon={FileCheck2}
          tone="warning"
        />
        <StatCard
          label="Leave / WFH pending"
          value="12"
          hint="Action required"
          icon={CalendarDays}
          tone="warning"
        />
        <StatCard
          label="Attendance exceptions"
          value="9"
          hint="Today"
          icon={AlarmClock}
          tone="destructive"
        />
        <StatCard
          label="Probation ending"
          value="2"
          hint="Within 30 days"
          icon={ShieldCheck}
          tone="info"
        />
        <StatCard
          label="On notice"
          value="3"
          hint="Plan replacements"
          icon={ClipboardX}
          tone="destructive"
        />
        <StatCard label="HR helpdesk" value="4" hint="2 unread" icon={LifeBuoy} tone="primary" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="New joiners — last 6 months"
          subtitle="Onboarding throughput"
          className="lg:col-span-2"
        >
          <MiniBars data={newJoinersTrend} height={210} color={CHART_COLORS.PRIMARY} />
        </ChartCard>

        <DataCard
          title="Joining pipeline"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/employees">
                View <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {joiningPipeline.length === 0 ? (
            <EmptyState icon={UserPlus} title="No upcoming joiners" />
          ) : (
            <ul className="divide-y">
              {joiningPipeline.map((j) => (
                <li key={j.name} className="px-5 py-3.5">
                  <UserAvatar name={j.name} subtitle={j.role} size="sm" showMeta />
                  <div className="ml-10 mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{j.stage}</span>
                    <span className="text-xs font-medium">{j.date}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard
          title="Attendance exceptions"
          description="Today's anomalies"
          padded={false}
          actions={
            <Button asChild size="sm" variant="ghost" className="text-primary">
              <Link to="/attendance">
                Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          {attendanceExceptions.length === 0 ? (
            <EmptyState
              icon={AlarmClock}
              title="No exceptions today"
              description="Everyone is on time."
            />
          ) : (
            <ul className="divide-y">
              {attendanceExceptions.map((a) => (
                <li key={a.name} className="flex items-center justify-between px-5 py-3.5">
                  <UserAvatar name={a.name} subtitle={a.reason} size="sm" showMeta />
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Probation ending soon" description="Plan reviews" padded={false}>
          {probation.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nothing due" />
          ) : (
            <ul className="divide-y">
              {probation.map((p) => (
                <li key={p.name} className="flex items-center justify-between px-5 py-3.5">
                  <UserAvatar name={p.name} subtitle={`Ends ${p.end}`} size="sm" showMeta />
                  <Button size="sm" variant="outline" className="rounded-full">
                    Schedule review
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Policy updates" description="Drafts ready to publish" padded={false}>
          <ul className="divide-y">
            {[
              {
                title: "Updated WFH policy v2.4",
                body: "Hybrid quotas changed to 2 days office / week",
                icon: BookOpen,
              },
              {
                title: "New travel reimbursement caps",
                body: "Effective 1 Jun 2026 across regions",
                icon: Megaphone,
              },
            ].map((p) => (
              <li key={p.title} className="flex items-start gap-3 px-5 py-3.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                  <p.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.body}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-primary">
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="HR helpdesk" description="Open HR tickets" padded={false}>
          <ul className="divide-y">
            {[
              {
                id: "TKT-12002",
                title: "Update bank account for payroll",
                who: "Mei Lin",
                priority: "Medium",
              },
              {
                id: "TKT-12011",
                title: "Maternity benefit query",
                who: "Hana Kobayashi",
                priority: "High",
              },
            ].map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.id} · {t.who}
                  </p>
                </div>
                <StatusBadge status="open" label={t.priority} />
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
