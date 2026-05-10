import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, Timer, Receipt, LifeBuoy, FileText, CalendarClock, Clock, Play, Pause,
  Briefcase, ChevronRight, Coffee, CalendarPlus,
} from "lucide-react";
import { StatCard, DataCard, ChartCard, StatusBadge, EmptyState, QuickActionCard } from "@/components/ui-kit";
import { MiniArea, CHART_COLORS, ProgressBar } from "./shared";

const weekHours = [
  { label: "Mon", v: 8.5 }, { label: "Tue", v: 7.8 }, { label: "Wed", v: 8 },
  { label: "Thu", v: 7.5 }, { label: "Fri", v: 6 }, { label: "Sat", v: 0 }, { label: "Sun", v: 0 },
];

const myAttendance = [
  { day: "Mon, May 5", in: "09:14", out: "18:42", hrs: "9h 28m" },
  { day: "Tue, May 6", in: "09:02", out: "18:11", hrs: "9h 09m" },
  { day: "Wed, May 7", in: "09:21", out: "18:55", hrs: "9h 34m" },
  { day: "Thu, May 8", in: "09:08", out: "18:30", hrs: "9h 22m" },
];

const holidays = [
  { name: "Memorial Day", date: "May 26, 2026", region: "US" },
  { name: "Eid ul-Adha", date: "Jun 06, 2026", region: "AE / IN" },
  { name: "Independence Day", date: "Jul 04, 2026", region: "US" },
];

const myDocs = [
  { name: "Offer letter.pdf", size: "2.1 MB" },
  { name: "Form 16 — FY24-25.pdf", size: "1.4 MB" },
  { name: "ID proof.pdf", size: "780 KB" },
];

export function EmployeeDashboard() {
  const [punched, setPunched] = useState(true);
  const [since] = useState("09:08");

  return (
    <>
      {/* Punch + working hours */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Punch in / out" description="Today" className="lg:col-span-1">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Clock className="h-9 w-9" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {punched ? `Punched in at ${since}` : "Not punched in yet"}
            </p>
            <Button
              onClick={() => setPunched((p) => !p)}
              className="mt-4 h-11 w-full rounded-xl text-primary-foreground"
              style={{ background: punched ? "var(--destructive)" : "var(--gradient-primary)" }}
            >
              {punched ? <><Pause className="mr-1.5 h-4 w-4" /> Punch out</> : <><Play className="mr-1.5 h-4 w-4" /> Punch in</>}
            </Button>
            <Button variant="outline" className="mt-2 h-9 w-full rounded-xl text-xs">
              <Coffee className="mr-1.5 h-3.5 w-3.5" /> Start break
            </Button>
          </div>
        </DataCard>

        <ChartCard title="Today's working hours" subtitle="6h 24m logged · target 8h" className="lg:col-span-2">
          <div className="space-y-3">
            <ProgressBar value={(6.4 / 8) * 100} tone="primary" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>0h</span><span>4h</span><span>8h</span>
            </div>
            <div className="pt-2">
              <p className="mb-2 text-xs font-medium text-muted-foreground">This week</p>
              <MiniArea data={weekHours} height={140} color={CHART_COLORS.PRIMARY} />
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Leave balance" value="12 d" hint="Earned + casual" icon={CalendarDays} tone="primary" />
        <StatCard label="Pending WFH" value="1" hint="Tomorrow" icon={CalendarClock} tone="info" />
        <StatCard label="Timesheet" value="32 / 40 h" hint="Week 19" icon={Timer} tone="warning" />
        <StatCard label="Open tickets" value="0" icon={LifeBuoy} tone="success" />
      </div>

      {/* Quick actions */}
      <DataCard title="Quick actions" description="Jump into a workflow" padded={false}>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard icon={CalendarPlus} title="Apply for leave" description="Casual, sick or earned" to="/leave-wfh" />
          <QuickActionCard icon={Timer} title="Log time" description="Submit weekly timesheet" to="/timesheet" />
          <QuickActionCard icon={Receipt} title="New expense" description="Submit a claim" to="/expenses" />
          <QuickActionCard icon={LifeBuoy} title="Raise a ticket" description="IT, HR or finance" to="/helpdesk" />
        </div>
      </DataCard>

      {/* Attendance + leave/wfh */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="My attendance" description="Last 4 days" className="lg:col-span-2" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/attendance">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Day</th>
                  <th className="px-3 py-2 text-left font-medium">In</th>
                  <th className="px-3 py-2 text-left font-medium">Out</th>
                  <th className="px-5 py-2 text-right font-medium">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {myAttendance.map((a) => (
                  <tr key={a.day}>
                    <td className="px-5 py-2.5 font-medium">{a.day}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{a.in}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{a.out}</td>
                    <td className="px-5 py-2.5 text-right font-medium">{a.hrs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>

        <DataCard title="Leave & WFH" description="Recent requests" padded={false}>
          <ul className="divide-y">
            {[
              { type: "Earned leave", days: "May 14 – May 16", status: "approved" as const },
              { type: "WFH", days: "Tomorrow", status: "pending" as const },
              { type: "Sick leave", days: "Apr 22", status: "approved" as const },
            ].map((l) => (
              <li key={l.type + l.days} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{l.type}</p>
                  <p className="text-xs text-muted-foreground">{l.days}</p>
                </div>
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      {/* Expenses + assets + tickets */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="My expenses" padded={false}>
          <ul className="divide-y">
            {[
              { id: "EXP-5512", what: "Client lunch · USD 84", status: "pending" as const },
              { id: "EXP-5510", what: "Software · USD 129", status: "approved" as const },
            ].map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{e.what}</p>
                  <p className="text-xs text-muted-foreground">{e.id}</p>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="My assets" padded={false}>
          <ul className="divide-y">
            {[
              { name: "MacBook Pro 16\"", id: "AST-7701" },
              { name: "Dell UltraSharp 27\"", id: "AST-7710" },
            ].map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.id}</p>
                </div>
                <StatusBadge status="assigned" />
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="My tickets" padded={false}>
          <EmptyState icon={LifeBuoy} title="No open tickets" description="You're all caught up." />
        </DataCard>
      </div>

      {/* Documents + holidays */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="My documents" description="Personal & employment" padded={false}>
          <ul className="divide-y">
            {myDocs.map((d) => (
              <li key={d.name} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.size}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-primary">Download</Button>
              </li>
            ))}
          </ul>
        </DataCard>

        <DataCard title="Upcoming holidays" description="Plan your calendar" padded={false}>
          <ul className="divide-y">
            {holidays.map((h) => (
              <li key={h.name} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.region}</p>
                </div>
                <span className="text-sm font-medium">{h.date}</span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
