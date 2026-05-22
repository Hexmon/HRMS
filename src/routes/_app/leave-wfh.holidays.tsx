import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { DataCard, Modal } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { HOLIDAYS, type Holiday } from "@/lib/leave-store";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, MapPin, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leave-wfh/holidays")({
  component: HolidaysPage,
});

const ADMIN: Role[] = ["hr_admin", "main_admin"];

function HolidaysPage() {
  const { activeRole } = useAuth();
  const isAdmin = !!activeRole && ADMIN.includes(activeRole);
  const [list, setList] = useState<Holiday[]>(HOLIDAYS);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [region, setRegion] = useState("");
  const [optional, setOptional] = useState(false);

  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));

  const monthHolidays = useMemo(
    () =>
      list.filter((h) => {
        const d = new Date(h.date);
        return d.getFullYear() === cursor.y && d.getMonth() === cursor.m;
      }),
    [list, cursor],
  );

  const add = () => {
    if (!name || !date) return toast.error("Name and date are required");
    setList((l) => [
      ...l,
      {
        id: `H-${Math.random().toString(36).slice(2, 7)}`,
        name,
        date,
        region: region || "All",
        optional,
      },
    ]);
    toast.success(`${name} added to holidays`);
    setOpen(false);
    setName("");
    setDate("");
    setRegion("");
    setOptional(false);
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Company-wide holiday calendar.</p>
        {isAdmin && (
          <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add holiday
          </Button>
        )}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <DataCard title={`${list.length} holidays`} description="Sorted by date">
            <ul className="divide-y">
              {list
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {h.name}
                          {h.optional && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Optional
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {h.region}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium">
                      {new Date(h.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                ))}
            </ul>
          </DataCard>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card className="rounded-2xl border-border/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{monthName}</h3>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={prev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={next}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={"e" + i} />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const d = i + 1;
                const dateStr = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const h = monthHolidays.find((x) => x.date === dateStr);
                const dow = new Date(cursor.y, cursor.m, d).getDay();
                const isWknd = dow === 0 || dow === 6;
                return (
                  <div
                    key={d}
                    className={cn(
                      "min-h-[68px] rounded-xl border p-2 text-left text-xs transition",
                      h ? "bg-primary-soft border-primary/30" : isWknd ? "bg-muted/40" : "bg-card",
                    )}
                  >
                    <div className={cn("font-semibold", h && "text-primary")}>{d}</div>
                    {h && (
                      <div className="mt-1 line-clamp-2 text-[10px] font-medium leading-tight text-primary">
                        {h.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add holiday"
        footer={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={add}>
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="hn">Name</Label>
            <Input
              id="hn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              placeholder="e.g. Diwali"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="hd">Date</Label>
              <Input
                id="hd"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="hr">Region</Label>
              <Input
                id="hr"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="mt-1.5"
                placeholder="IN / US / All"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Optional holiday</p>
              <p className="text-xs text-muted-foreground">
                Employees can choose whether to take it.
              </p>
            </div>
            <Switch checked={optional} onCheckedChange={setOptional} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
