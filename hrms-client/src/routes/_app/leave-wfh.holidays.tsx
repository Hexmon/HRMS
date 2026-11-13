import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { DataCard, EmptyState, Modal } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, MapPin, CalendarDays, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { holidaysFromResponse, useHolidayMutation, useHolidays } from "@/domains/leave-wfh";
import { formatHolidayDate, isHolidayInMonth } from "@/domains/leave-wfh/calendar-date";
import { ApiError, userFacingErrorMessage } from "@/shared/api";
import type { Holiday } from "@/lib/leave-store";

export const Route = createFileRoute("/_app/leave-wfh/holidays")({
  component: HolidaysPage,
});

const ADMIN: Role[] = ["hr_admin", "main_admin"];
type HolidayView = Holiday & { expectedVersion: number };

export function HolidaysPage() {
  const { activeRole } = useAuth();
  const isAdmin = !!activeRole && ADMIN.includes(activeRole);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayView | null>(null);
  const [latestConflict, setLatestConflict] = useState<HolidayView | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [region, setRegion] = useState("");
  const [optional, setOptional] = useState(false);
  const draftId = useRef<string | null>(null);
  const submissionInFlight = useRef(false);

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
  const holidaysQuery = useHolidays({ year: cursor.y, page: 1, page_size: 100 });
  const mutation = useHolidayMutation();
  const list = holidaysFromResponse(holidaysQuery.data);

  const monthHolidays = useMemo(
    () => list.filter((h) => isHolidayInMonth(h.date, cursor.y, cursor.m)),
    [list, cursor],
  );

  const openForm = () => {
    setEditing(null);
    setLatestConflict(null);
    draftId.current ??= createId();
    setOpen(true);
  };

  const openEditForm = (holiday: HolidayView) => {
    draftId.current = holiday.id;
    setEditing(holiday);
    setLatestConflict(null);
    setName(holiday.name);
    setDate(holiday.date);
    setRegion(holiday.region);
    setOptional(holiday.optional);
    setOpen(true);
  };

  const closeForm = () => {
    if (submissionInFlight.current) return;
    draftId.current = null;
    setEditing(null);
    setLatestConflict(null);
    setOpen(false);
    setName("");
    setDate("");
    setRegion("");
    setOptional(false);
  };

  const save = async () => {
    const normalizedName = name.trim();
    const normalizedRegion = region.trim() || "All";
    if (normalizedName.length < 2 || !date) {
      return toast.error("Enter a holiday name of at least 2 characters and a date");
    }
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    const id = draftId.current ?? (draftId.current = createId());
    try {
      await mutation.mutateAsync({
        id,
        input: {
          name: normalizedName,
          date,
          region: normalizedRegion,
          optional,
          ...(editing ? { expected_version: editing.expectedVersion } : {}),
        },
      });
      toast.success(editing ? `${normalizedName} updated` : `${normalizedName} added to holidays`);
      draftId.current = null;
      setEditing(null);
      setOpen(false);
      setName("");
      setDate("");
      setRegion("");
      setOptional(false);
    } catch (error) {
      const staleEdit = editing && error instanceof ApiError && error.status === 409;
      const refreshed = await holidaysQuery.refetch();
      if (staleEdit) {
        const latest = holidaysFromResponse(refreshed.data).find(
          (holiday) => holiday.id === editing.id,
        );
        if (latest) setLatestConflict(latest);
      }
      toast.error(
        staleEdit
          ? "This holiday changed after you opened it. The latest version was loaded; review your draft before retrying."
          : `${errorMessage(error)} If the connection dropped, check the refreshed list or retry with the same details.`,
      );
    } finally {
      submissionInFlight.current = false;
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Company-wide holiday calendar.</p>
        {isAdmin && (
          <Button size="sm" className="rounded-full" onClick={openForm}>
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
            {holidaysQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading holidays...</p>
            ) : holidaysQuery.isError ? (
              <EmptyState
                title="Could not load holidays"
                description={errorMessage(holidaysQuery.error)}
              />
            ) : list.length === 0 ? (
              <EmptyState
                title="No holidays"
                description="No holidays are configured for this year."
              />
            ) : (
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{formatHolidayDate(h.date)}</p>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => openEditForm(h)}
                            aria-label={`Edit ${h.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
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
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={next}
                  aria-label="Next month"
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
                const dayHolidays = monthHolidays.filter((x) => x.date === dateStr);
                const dow = new Date(cursor.y, cursor.m, d).getDay();
                const isWknd = dow === 0 || dow === 6;
                return (
                  <div
                    key={d}
                    className={cn(
                      "min-h-[68px] rounded-xl border p-2 text-left text-xs transition",
                      dayHolidays.length > 0
                        ? "bg-primary-soft border-primary/30"
                        : isWknd
                          ? "bg-muted/40"
                          : "bg-card",
                    )}
                  >
                    <div className={cn("font-semibold", dayHolidays.length > 0 && "text-primary")}>
                      {d}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {dayHolidays.map((holiday) => (
                        <div
                          key={holiday.id}
                          className="line-clamp-2 text-[10px] font-medium leading-tight text-primary"
                          title={`${holiday.name} (${holiday.region})`}
                        >
                          {holiday.name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Modal
        open={open}
        onOpenChange={(nextOpen) => (nextOpen ? openForm() : closeForm())}
        title={editing ? "Edit holiday" : "Add holiday"}
        footer={
          <>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={mutation.isPending}
              onClick={closeForm}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={mutation.isPending || latestConflict !== null}
              onClick={() => void save()}
            >
              {editing ? "Save changes" : "Add"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {latestConflict && (
            <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-medium">A newer version is available</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your draft is preserved. Load the latest saved value before applying your changes
                again: {latestConflict.name}, {latestConflict.date}, {latestConflict.region}.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 rounded-full"
                onClick={() => {
                  setEditing(latestConflict);
                  setName(latestConflict.name);
                  setDate(latestConflict.date);
                  setRegion(latestConflict.region);
                  setOptional(latestConflict.optional);
                  setLatestConflict(null);
                }}
              >
                Load latest version
              </Button>
            </div>
          )}
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

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`;
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "Holiday request failed.");
}
