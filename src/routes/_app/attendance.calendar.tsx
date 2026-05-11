import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataCard, StatusBadge } from "@/components/ui-kit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/attendance/calendar")({
  component: AttendanceCalendar,
});

type DayStatus = "present" | "wfh" | "late" | "absent" | "leave" | "weekend" | "future";

interface DayDetail {
  status: DayStatus;
  inTime?: string;
  outTime?: string;
  hours?: string;
  note?: string;
}

function genMonth(year: number, month: number): Record<number, DayDetail> {
  const map: Record<number, DayDetail> = {};
  const days = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    if (date > today) { map[d] = { status: "future" }; continue; }
    if (dow === 0 || dow === 6) { map[d] = { status: "weekend" }; continue; }
    const r = (d * 7 + month) % 11;
    if (r === 0) map[d] = { status: "leave", note: "Earned leave" };
    else if (r === 1) map[d] = { status: "wfh", inTime: "09:30", outTime: "18:45", hours: "8h 45m" };
    else if (r === 2) map[d] = { status: "late", inTime: "09:52", outTime: "18:30", hours: "8h 18m", note: "Late by 52 min" };
    else if (r === 3) map[d] = { status: "absent", note: "No punch-in recorded" };
    else map[d] = { status: "present", inTime: "09:08", outTime: "18:42", hours: "9h 14m" };
  }
  return map;
}

const STATUS_CLS: Record<DayStatus, string> = {
  present: "bg-success/15 text-success border-success/30",
  wfh: "bg-info/15 text-info border-info/30",
  late: "bg-warning/20 text-warning-foreground border-warning/40",
  absent: "bg-destructive/15 text-destructive border-destructive/30",
  leave: "bg-primary-soft text-primary border-primary/30",
  weekend: "bg-muted text-muted-foreground/60 border-border",
  future: "bg-background text-muted-foreground/40 border-dashed border-border",
};

function AttendanceCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const data = useMemo(() => genMonth(cursor.y, cursor.m), [cursor]);
  const [selected, setSelected] = useState<number>(today.getDate());

  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const prev = () => setCursor((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 });
  const next = () => setCursor((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 });

  const summary = useMemo(() => {
    const acc: Record<DayStatus, number> = { present: 0, wfh: 0, late: 0, absent: 0, leave: 0, weekend: 0, future: 0 };
    Object.values(data).forEach((d) => { acc[d.status]++; });
    return acc;
  }, [data]);

  const sel = data[selected];

  return (
    <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-3">
      <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{monthName}</h3>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstDow }).map((_, i) => <div key={"e"+i} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = i + 1;
            const det = data[d];
            const isSel = d === selected;
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={cn(
                  "relative aspect-square rounded-xl border p-1.5 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm",
                  STATUS_CLS[det.status],
                  isSel && "ring-2 ring-primary ring-offset-1",
                )}
              >
                <span className="font-semibold">{d}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {(["present","wfh","late","absent","leave"] as DayStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full border", STATUS_CLS[s])} />
              <span className="capitalize text-muted-foreground">{s}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <DataCard title={`Day ${selected}`} description={new Date(cursor.y, cursor.m, selected).toDateString()}>
          {sel && sel.status !== "future" && sel.status !== "weekend" ? (
            <div className="space-y-3 text-sm">
              <StatusBadge status={sel.status === "leave" ? "approved" : sel.status} />
              {sel.inTime && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/40 p-2"><p className="text-[11px] text-muted-foreground">In</p><p className="font-semibold tabular-nums">{sel.inTime}</p></div>
                  <div className="rounded-xl bg-muted/40 p-2"><p className="text-[11px] text-muted-foreground">Out</p><p className="font-semibold tabular-nums">{sel.outTime}</p></div>
                  <div className="rounded-xl bg-muted/40 p-2"><p className="text-[11px] text-muted-foreground">Hours</p><p className="font-semibold tabular-nums">{sel.hours}</p></div>
                </div>
              )}
              {sel.note && <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{sel.note}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance for this day.</p>
          )}
        </DataCard>

        <DataCard title="Month summary">
          <ul className="space-y-2 text-sm">
            {([
              ["present","Present"], ["wfh","WFH"], ["late","Late"], ["absent","Absent"], ["leave","On leave"],
            ] as [DayStatus, string][]).map(([k, l]) => (
              <li key={k} className="flex items-center justify-between">
                <span className="text-muted-foreground">{l}</span>
                <span className="font-semibold tabular-nums">{summary[k]}</span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </div>
  );
}
