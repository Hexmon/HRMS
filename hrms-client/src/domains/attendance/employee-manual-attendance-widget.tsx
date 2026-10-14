import { Link } from "@tanstack/react-router";
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
  ShieldCheck,
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
import { liveAttendanceContext, type EmployeeAttendanceGeoPolicy } from "./context";
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

interface AttendancePolicyHelpCopy {
  title: string;
  description: string;
  workflowDescription: string;
}

function attendanceResultTone(result: ManualAttendanceResult): AttendanceResultTone {
  if (result.kind === "uncertain") return "uncertain";
  if (result.manualFallback) return "review";
  return result.geoDecisionDisplay?.decision ?? result.kind;
}

function attendanceResultClassName(tone: AttendanceResultTone): string {
  if (tone === "accepted") return "border-success/30 bg-success/10 text-foreground";
  if (tone === "rejected") return "border-destructive/30 bg-destructive/10 text-foreground";
  return "border-warning/40 bg-warning/10 text-warning-foreground";
}

function attendanceResultIconClassName(tone: AttendanceResultTone): string {
  if (tone === "accepted") return "text-success";
  if (tone === "rejected") return "text-destructive";
  return "text-warning";
}

function policyOffersManualFallback(policy: EmployeeAttendanceGeoPolicy): boolean {
  return (
    policy.fallbackApprovalMode === "approval_required" &&
    [
      policy.locationUnavailableAction,
      policy.permissionDeniedAction,
      policy.outsideFenceAction,
      policy.boundaryUncertainAction,
      policy.staleEvidenceAction,
      policy.accuracyExceededAction,
    ].includes("manual_fallback")
  );
}

function attendancePolicyHelpCopy(policy: EmployeeAttendanceGeoPolicy): AttendancePolicyHelpCopy {
  const fallbackCopy = policyOffersManualFallback(policy)
    ? "If the location check cannot be completed, your policy may offer manual fallback that is submitted for review."
    : "Manual fallback is offered only when your attendance policy permits it.";
  const regularizationCopy =
    "Regularization is a separate request for correcting an earlier attendance record.";

  switch (policy.attendanceMode) {
    case "manual_only":
      return {
        title: "Manual attendance policy",
        description:
          "Your current attendance policy uses manual attendance for this action. No browser location check is required.",
        workflowDescription:
          "Manual fallback is for policy-controlled location-check problems. " + regularizationCopy,
      };
    case "geo_optional":
      return {
        title: "Location optional for attendance",
        description:
          "Your current attendance policy may use a one-time browser location check when available; it is not mandatory for every action.",
        workflowDescription: `${fallbackCopy} ${regularizationCopy}`,
      };
    case "geo_preferred":
      return {
        title: "Location preferred for attendance",
        description:
          "Your current attendance policy prefers a one-time browser location check when you submit attendance.",
        workflowDescription:
          `${fallbackCopy} Policy decides what happens when location cannot be checked. ` +
          regularizationCopy,
      };
    case "geo_required":
      return {
        title: "Location required for attendance",
        description:
          "Your current attendance policy requires a one-time location check when you submit attendance.",
        workflowDescription: `${fallbackCopy} ${regularizationCopy}`,
      };
  }
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
  const policyHelp = attendancePolicyHelpCopy(context.geoPolicy);

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

        <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/20 text-center max-[360px]:grid-cols-1 max-[360px]:divide-x-0 max-[360px]:divide-y">
          <div className="min-w-0 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Work</p>
            <p className="mt-1 font-semibold tabular-nums">
              {formatAttendanceMinutes(live.workMinutes)}
            </p>
          </div>
          <div className="min-w-0 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Break</p>
            <p className="mt-1 font-semibold tabular-nums">
              {formatAttendanceMinutes(live.breakMinutes)}
            </p>
          </div>
          <div className="min-w-0 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="mt-1 font-semibold tabular-nums">
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

        <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-sm text-foreground">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">{policyHelp.title}</p>
              <p className="mt-0.5">{policyHelp.description}</p>
              <p className="mt-1">{policyHelp.workflowDescription}</p>
              <p className="mt-1">
                This page does not start continuous background tracking; routine attendance views
                use privacy-safe evidence.
              </p>
              <Link
                to="/attendance/privacy"
                className="mt-2 inline-flex font-medium underline underline-offset-4"
              >
                Learn about attendance privacy
              </Link>
            </div>
          </div>
        </div>

        <div className="min-h-10">
          {action.geoStatus === "requesting" ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-foreground"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
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
                <CheckCircle2
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    resultTone && attendanceResultIconClassName(resultTone),
                  )}
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    resultTone && attendanceResultIconClassName(resultTone),
                  )}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {action.result.geoDecisionDisplay && (
                    <StatusBadge
                      status={action.result.geoDecisionDisplay.decision}
                      label={action.result.geoDecisionDisplay.title}
                      className="max-w-full whitespace-normal break-words"
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
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10 w-full whitespace-normal sm:min-h-8 sm:w-auto"
                      onClick={() => void contextQuery.refetch()}
                      disabled={contextQuery.isFetching}
                    >
                      <RefreshCw className={cn(contextQuery.isFetching && "animate-spin")} />
                      Check status
                    </Button>
                    {action.canRetry && (
                      <Button
                        size="sm"
                        className="min-h-10 w-full whitespace-normal sm:min-h-8 sm:w-auto"
                        onClick={() => void action.retry()}
                        disabled={disabled}
                      >
                        <RotateCcw />
                        Retry same action
                      </Button>
                    )}
                  </div>
                )}
                {action.canSubmitManualFallback && action.result.manualFallback && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      size="sm"
                      className="min-h-10 w-full whitespace-normal sm:min-h-8 sm:w-auto"
                      onClick={() => void action.submitManualFallback()}
                      disabled={disabled}
                    >
                      Use manual fallback
                    </Button>
                  </div>
                )}
              </div>
              {action.result.kind !== "uncertain" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 sm:h-7 sm:w-7"
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

        <div
          className="grid min-h-9 grid-cols-1 gap-2 sm:flex sm:flex-wrap"
          aria-label="Attendance actions"
        >
          {ACTIONS.filter(({ action: actionName }) =>
            context.allowedActions.includes(actionName),
          ).map(({ action: actionName, label, icon: Icon, variant: buttonVariant }) => (
            <Button
              key={actionName}
              variant={buttonVariant}
              className="min-h-10 w-full whitespace-normal sm:min-h-9 sm:w-auto"
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
