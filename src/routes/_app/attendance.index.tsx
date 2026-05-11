import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { StatCard, DataCard, StatusBadge, EmptyState } from "@/components/ui-kit";
import { toast } from "sonner";
import {
  Users, UserCheck, UserX, AlarmClock, LogOut, Home, CalendarDays, ClipboardX,
  Play, Pause, Square, Clock, Building2,
} from "lucide-react";
import type { Role } from "@/lib/mock/roles";

export const Route = createFileRoute("/_app/attendance/")({
  component: AttendanceOverview,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin", "manager"];

function AttendanceOverview() {
  const { activeRole } = useAuth();
  const isAdmin = activeRole && ADMIN_ROLES.includes(activeRole);
  return isAdmin ? <AdminView /> : <EmployeeView />;
}

const DEPT_DATA = [
  { dept: "Engineering", present: 38, strength: 42 },
  { dept: "Design", present: 11, strength: 12 },
  { dept: "Product", present: 9, strength: 10 },
  { dept: "Sales", present: 14, strength: 18 },
  { dept: "People Ops", present: 6, strength: 7 },
];

const EXCEPTIONS = [
  { name: "Olu Adeyemi", reason: "Late · 47 min", status: "late" },
  { name: "Carlos Mendes", reason: "Missed punch-in", status: "absent" },
  { name: "Mei Lin", reason: "Half-day · unapproved", status: "pending" },
  { name: "Daniel Park", reason: "No punch-out yesterday", status: "pending" },
];

function AdminView() {
  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total" value="142" icon={Users} tone="primary" />
        <StatCard label="Present" value="118" hint="83%" icon={UserCheck} tone="success" />
        <StatCard label="Absent" value="9" icon={UserX} tone="destructive" />
        <StatCard label="Late" value="6" icon={AlarmClock} tone="warning" />
        <StatCard label="Early out" value="2" icon={LogOut} tone="warning" />
        <StatCard label="WFH" value="11" icon={Home} tone="info" />
        <StatCard label="On leave" value="4" icon={CalendarDays} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Department-wise attendance" description="Today" className="lg:col-span-2">
          <ul className="space-y-3">
            {DEPT_DATA.map((d) => {
              const pct = Math.round((d.present / d.strength) * 100);
              return (
                <li key={d.dept}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{d.dept}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{d.present}/{d.strength} · {pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </li>
              );
            })}
          </ul>
        </DataCard>

        <DataCard title="Attendance exceptions" description="Needs attention">
          <ul className="space-y-2.5">
            {EXCEPTIONS.map((e) => (
              <li key={e.name} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.reason}</p>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </div>
  );
}

type PunchState = "idle" | "working" | "break" | "done";

function EmployeeView() {
  const [state, setState] = useState<PunchState>("idle");
  const [inTime, setInTime] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [worked, setWorked] = useState(0); // minutes
  const [breakMin, setBreakMin] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      if (state === "working") setWorked((w) => w + 1 / 60);
      if (state === "break") setBreakMin((b) => b + 1 / 60);
    }, 1000);
    return () => clearInterval(t);
  }, [state]);

  const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${Math.floor(m % 60)}m`;

  const punchIn = () => {
    setState("working");
    setInTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    toast.success("Punched in");
  };
  const startBreak = () => { setState("break"); toast("Break started"); };
  const endBreak = () => { setState("working"); toast("Resumed work"); };
  const punchOut = () => { setState("done"); toast.success("Punched out"); };

  const STATE_LABEL: Record<PunchState, { l: string; s: string }> = {
    idle: { l: "Not started", s: "draft" },
    working: { l: "Working", s: "in_progress" },
    break: { l: "On break", s: "pending" },
    done: { l: "Completed", s: "completed" },
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/60 lg:col-span-2">
          <div className="p-6" style={{ background: "var(--gradient-hero)" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{now.toLocaleDateString(undefined, { weekday: "long" })}</p>
                <p className="text-2xl font-semibold">{now.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" })}</p>
              </div>
              <StatusBadge status={STATE_LABEL[state].s} label={STATE_LABEL[state].l} />
            </div>
            <p className="mt-4 text-5xl font-bold tabular-nums tracking-tight">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            {inTime && <p className="mt-1 text-xs text-muted-foreground">Punched in at {inTime}</p>}
          </div>
          <div className="grid grid-cols-3 divide-x border-t text-center">
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Total today</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{fmtMin(worked)}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Break</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{fmtMin(breakMin)}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Target</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">8h 30m</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t p-4">
            {state === "idle" && (
              <Button className="rounded-full" onClick={punchIn}><Play className="mr-1.5 h-4 w-4" /> Punch in</Button>
            )}
            {state === "working" && (
              <>
                <Button variant="outline" className="rounded-full" onClick={startBreak}><Pause className="mr-1.5 h-4 w-4" /> Start break</Button>
                <Button className="rounded-full" onClick={punchOut}><Square className="mr-1.5 h-4 w-4" /> Punch out</Button>
              </>
            )}
            {state === "break" && (
              <Button className="rounded-full" onClick={endBreak}><Play className="mr-1.5 h-4 w-4" /> Resume</Button>
            )}
            {state === "done" && (
              <p className="text-sm text-muted-foreground">Day completed. See you tomorrow.</p>
            )}
          </div>
        </Card>

        <DataCard title="This week" description="Mon → Sun">
          <ul className="space-y-2 text-sm">
            {[
              { day: "Mon, May 5", in: "09:14", out: "18:42", hrs: "9h 28m", status: "present" },
              { day: "Tue, May 6", in: "09:02", out: "18:11", hrs: "9h 09m", status: "present" },
              { day: "Wed, May 7", in: "—", out: "—", hrs: "WFH 8h 12m", status: "wfh" },
              { day: "Thu, May 8", in: "09:21", out: "18:55", hrs: "9h 34m", status: "present" },
              { day: "Fri, May 9", in: "09:48", out: "18:15", hrs: "8h 27m", status: "late" },
            ].map((d) => (
              <li key={d.day} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
                <div>
                  <p className="font-medium">{d.day}</p>
                  <p className="text-xs text-muted-foreground">{d.in} – {d.out}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold">{d.hrs}</p>
                  <StatusBadge status={d.status} />
                </div>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="MTD work hours" value="142h" hint="of 168h target" icon={Clock} tone="primary" />
        <StatCard label="Late this month" value="2" hint="threshold: 3" icon={AlarmClock} tone="warning" />
        <StatCard label="Absent w/o leave" value="0" icon={ClipboardX} tone="success" />
      </div>

      <DataCard title="Late & absent history" description="Last 30 days">
        <ul className="divide-y text-sm">
          {[
            { date: "May 9", reason: "Late by 48 min", status: "late" },
            { date: "Apr 22", reason: "Late by 32 min", status: "late" },
            { date: "Apr 14", reason: "Sick leave (approved)", status: "approved" },
          ].map((r, i) => (
            <li key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium">{r.date}</p>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
              </div>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      </DataCard>
    </div>
  );
}
