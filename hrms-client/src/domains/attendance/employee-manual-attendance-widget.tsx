import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Coffee,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { userFacingErrorMessage } from "@/shared/api";
import type { AttendancePunchEventType } from "./api";
import { liveAttendanceContext } from "./context";
import { formatAttendanceMinutes } from "./live";
import { useEmployeeAttendanceContext } from "./queries";
import {
  useManualAttendanceAction,
  type ManualAttendanceResult,
} from "./use-manual-attendance-action";
import { useServerClock } from "./use-server-clock";

interface EmployeeManualAttendanceWidgetProps {
  variant?: "detailed" | "compact";
  sourceView: "attendance_page" | "dashboard";
  className?: string;
}

const ACTIONS: Array<{
  action: AttendancePunchEventType;
  label: string;
  icon: typeof Play;
  variant: "default" | "outline";
}> = [
  { action: "check_in", label: "Clock in", icon: Play, variant: "default" },
  { action: "break_start", label: "Start break", icon: Pause, variant: "outline" },
  { action: "break_end", label: "Resume work", icon: Play, variant: "default" },
  { action: "check_out", label: "Clock out", icon: Square, variant: "outline" },
];

function displayWorkDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function stateBadgeStatus(state: string, fallback: string): string {
  if (state === "open") return "active";
  if (state === "on_break") return "pending";
  if (state === "completed") return "completed";
  return fallback || "inactive";
}

type AttendanceResultTone = ManualAttendanceResult["kind"] | "provisional" | "review";

function attendanceResultTone(result: ManualAttendanceResult): AttendanceResultTone {
  if (result.kind === "uncertain") return "uncertain";
  return result.geoDecisionDisplay?.decision ?? result.kind;
}

function attendanceResultClassName(tone: AttendanceResultTone): string {
  if (tone === "accepted") return "border-success/30 bg-success/10 text-success";
  if (tone === "rejected") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-warning/40 bg-warning/10 text-warning-foreground";
}

export function EmployeeManualAttendanceWidget({
  variant = "detailed",
  sourceView,
  className,
}: EmployeeManualAttendanceWidgetProps) {
  const contextQuery = useEmployeeAttendanceContext();
  const context = contextQuery.data;
  const clock = useServerClock(context?.serverTime);
  const resultRef = useRef<HTMLDivElement>(null);
  const refetchAfterFailure = useCallback(() => {
    void contextQuery.refetch();
  }, [contextQuery]);
  const action = useManualAttendanceAction({
    sourceView,
    geoPolicy: context?.geoPolicy,
    onDeterministicFailure: refetchAfterFailure,
  });
  const reconcileAction = action.reconcile;

  useEffect(() => {
    if (action.result) resultRef.current?.focus();
  }, [action.result]);

  useEffect(() => {
    if (context) reconcileAction(context.allowedActions);
  }, [context, reconcileAction]);

  const live = useMemo(
    () =>
      context && clock.now
        ? liveAttendanceContext(context, clock.now)
        : { workMinutes: 0, breakMinutes: 0 },
    [clock.now, context],
  );

  if (contextQuery.isLoading) {
    return (
      <Card className={cn("overflow-hidden rounded-lg", className)} aria-label="Loading attendance">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-8 w-52" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-14 w-56" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </Card>
    );
  }

  if (contextQuery.isError || !context || !context.isReady || !clock.isAvailable || !clock.now) {
    return (
      <Card className={cn("rounded-lg p-5 sm:p-6", className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Attendance unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {contextQuery.isError
                ? userFacingErrorMessage(
                    contextQuery.error,
                    "Today's attendance could not be loaded.",
                  )
                : "The server did not return a complete attendance context."}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => void contextQuery.refetch()}
              disabled={contextQuery.isFetching}
            >
              <RefreshCw className={cn(contextQuery.isFetching && "animate-spin")} />
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const disabled = action.isPending || action.geoStatus === "requesting" || contextQuery.isFetching;
  const resultTone = action.result ? attendanceResultTone(action.result) : null;

  return (
    <Card className={cn("overflow-hidden rounded-lg", className)}>
      <div className={cn("p-5 sm:p-6", variant === "compact" ? "space-y-5" : "space-y-6")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {displayWorkDate(context.workDate)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <time
                className="text-3xl font-semibold tabular-nums"
                dateTime={clock.now.toISOString()}
                aria-label={`Server time ${clock.now.toLocaleTimeString()}`}
              >
                {clock.now.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Server time</p>
          </div>
          <StatusBadge
            status={stateBadgeStatus(context.sessionState, context.status)}
            label={context.statusLabel}
          />
        </div>

        <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/20 text-center">
          <div className="min-w-0 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Work</p>
            <p className="mt-1 truncate font-semibold tabular-nums">
              {formatAttendanceMinutes(live.workMinutes)}
            </p>
          </div>
          <div className="min-w-0 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Break</p>
            <p className="mt-1 truncate font-semibold tabular-nums">
              {formatAttendanceMinutes(live.breakMinutes)}
            </p>
          </div>
          <div className="min-w-0 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="mt-1 truncate font-semibold tabular-nums">
              {formatAttendanceMinutes(context.targetWorkMinutes)}
            </p>
          </div>
        </div>

        {(context.inTime || context.outTime || context.workMode) && (
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Clocked in</dt>
              <dd className="font-medium">{context.inTime ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Clocked out</dt>
              <dd className="font-medium">{context.outTime ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Work mode</dt>
              <dd className="font-medium">
                {context.workMode ? context.workMode.replaceAll("_", " ") : "Not set"}
              </dd>
            </div>
          </dl>
        )}

        <div className="min-h-10">
          {action.geoStatus === "requesting" ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Getting browser location</p>
                <p className="mt-0.5">
                  Share location to let HRMS attach one-time evidence to this attendance action.
                </p>
              </div>
            </div>
          ) : action.result ? (
            <div
              ref={resultRef}
              tabIndex={-1}
              role={resultTone === "rejected" || resultTone === "uncertain" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                resultTone && attendanceResultClassName(resultTone),
              )}
            >
              {resultTone === "accepted" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {action.result.geoDecisionDisplay && (
                    <StatusBadge
                      status={action.result.geoDecisionDisplay.decision}
                      label={action.result.geoDecisionDisplay.title}
                    />
                  )}
                  <p className="font-semibold">{action.result.title}</p>
                </div>
                <p className="mt-0.5">{action.result.message}</p>
                {action.result.geoDecisionDisplay?.reasonDescription &&
                  action.result.geoDecisionDisplay.reasonDescription !== action.result.message && (
                    <p className="mt-1">{action.result.geoDecisionDisplay.reasonDescription}</p>
                  )}
                {action.result.kind === "uncertain" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void contextQuery.refetch()}
                      disabled={contextQuery.isFetching}
                    >
                      <RefreshCw className={cn(contextQuery.isFetching && "animate-spin")} />
                      Check status
                    </Button>
                    {action.canRetry && (
                      <Button size="sm" onClick={() => void action.retry()} disabled={disabled}>
                        <RotateCcw />
                        Retry same action
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {action.result.kind !== "uncertain" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={action.clearResult}
                  aria-label="Dismiss attendance result"
                >
                  <X />
                </Button>
              )}
            </div>
          ) : context.blockedReason ? (
            <p className="text-sm text-muted-foreground">{context.blockedReason}</p>
          ) : context.allowedActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {context.sessionState === "completed"
                ? "Your attendance session is complete."
                : "No attendance action is available right now."}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-9 flex-wrap gap-2" aria-label="Attendance actions">
          {ACTIONS.filter(({ action: actionName }) =>
            context.allowedActions.includes(actionName),
          ).map(({ action: actionName, label, icon: Icon, variant: buttonVariant }) => (
            <Button
              key={actionName}
              variant={buttonVariant}
              disabled={disabled || action.result?.kind === "uncertain"}
              onClick={() => void action.execute(actionName)}
            >
              <Icon />
              {label}
            </Button>
          ))}
          {context.sessionState === "on_break" && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Coffee className="h-4 w-4" aria-hidden="true" />
              Break in progress
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
