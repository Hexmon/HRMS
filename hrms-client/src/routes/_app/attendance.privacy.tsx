import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { useAttendancePrivacy } from "@/domains/attendance";
import {
  actionDescription,
  actionLabel,
  attendanceModeLabel,
  formatDuration,
  formatMilliseconds,
  locationCollectionText,
} from "@/domains/attendance/privacy-copy";
import type { AttendancePrivacyAction } from "@/domains/attendance";
import { userFacingErrorMessage } from "@/shared/api";

export const Route = createFileRoute("/_app/attendance/privacy")({
  component: AttendancePrivacyPage,
});

function AttendancePrivacyPage() {
  const privacyQuery = useAttendancePrivacy();

  if (privacyQuery.isLoading) {
    return (
      <DataCard
        title="Attendance privacy"
        description="Loading your current attendance privacy summary."
      >
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
        </div>
      </DataCard>
    );
  }

  if (privacyQuery.isError || !privacyQuery.data) {
    return (
      <DataCard title="Attendance privacy" description="Current policy details are unavailable.">
        <EmptyState
          icon={AlertCircle}
          title="Current policy details are unavailable."
          description={userFacingErrorMessage(
            privacyQuery.error,
            "We could not load your attendance privacy summary.",
          )}
          action={
            <Button type="button" variant="outline" onClick={() => void privacyQuery.refetch()}>
              <RotateCcw />
              Retry
            </Button>
          }
        />
      </DataCard>
    );
  }

  const summary = privacyQuery.data;
  const policy = summary.effective_policy;
  const retentionText = formatDuration(summary.retention.coordinate_retention_seconds);
  const showGeoThresholds = policy.attendance_mode !== "manual_only";

  return (
    <div className="space-y-4">
      <DataCard
        title="Attendance Privacy & Location"
        description="A read-only summary of how your current attendance policy handles attendance evidence."
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              This page explains what HRMS collects during attendance actions, how policy decisions
              affect location evidence, and which actions you control. It does not request location
              or change your policy.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Your current policy applies to newly collected evidence. Earlier evidence may have
              been collected under a different policy version and keeps the expiry that was recorded
              when it was received.
            </p>
          </div>
          <div className="grid gap-2 rounded-md border border-border/70 bg-muted/30 p-3">
            <PolicyFact label="Current mode" value={attendanceModeLabel(policy.attendance_mode)} />
            <PolicyFact
              label="Policy source"
              value={policy.policy_source === "built_in" ? "Built-in default" : "Assigned policy"}
            />
            <PolicyFact label="Generated" value={formatDateTime(summary.generated_at)} />
            <PolicyFact label="Resolved as of" value={formatDateTime(summary.as_of)} />
          </div>
        </div>
      </DataCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DataCard title="What Attendance Information Is Collected">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              HRMS records attendance actions, timestamps, source channel, work mode, policy
              decisions, review states, and safe evidence summaries.
            </p>
            <p>
              Manual-only web attendance does not require exact coordinates. When geo attendance is
              used, location evidence is attached only to an attendance action.
            </p>
          </div>
        </DataCard>

        <DataCard title="When Location Is Requested">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">
                {locationCollectionText(summary)}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p className="text-sm leading-6 text-muted-foreground">
                The web client uses a one-time browser location request during the attendance
                action. This page does not start background tracking.
              </p>
            </div>
          </div>
        </DataCard>
      </div>

      <DataCard
        title="Your Current Attendance Policy"
        description="These values come from the backend effective policy resolver."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PolicyMetric
            label="Location requirement"
            value={locationRequirementLabel(policy.location_requirement)}
          />
          <PolicyMetric
            label="Geofence configured"
            value={policy.geofence.configured ? "Yes" : "No"}
          />
          <PolicyMetric label="Grace distance" value={`${policy.geofence.grace_meters} meters`} />
          {showGeoThresholds ? (
            <>
              <PolicyMetric
                label="Location freshness"
                value={formatMilliseconds(policy.max_location_age_ms)}
              />
              <PolicyMetric
                label="Accuracy threshold"
                value={
                  policy.max_accuracy_meters == null
                    ? "Not configured"
                    : `${policy.max_accuracy_meters} meters`
                }
              />
            </>
          ) : null}
          <PolicyMetric
            label="Regularization"
            value={approvalModeLabel(summary.regularization.mode)}
          />
        </div>
      </DataCard>

      <DataCard
        title="If Location Is Denied Or Unavailable"
        description="Configured actions determine whether a condition is allowed, denied, or sent through fallback."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ActionFact label="Permission denied" action={policy.actions.permission_denied} />
          <ActionFact label="Location unavailable" action={policy.actions.location_unavailable} />
          <ActionFact label="Outside work area" action={policy.actions.outside_fence} />
          <ActionFact label="Boundary uncertain" action={policy.actions.boundary_uncertain} />
          <ActionFact label="Stale evidence" action={policy.actions.stale_evidence} />
          <ActionFact label="Accuracy exceeded" action={policy.actions.accuracy_exceeded} />
        </div>
      </DataCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DataCard title="Manual Fallback & Review">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Manual fallback is conditional. It may be available only when the current policy
              selects manual fallback for a location outcome and the fallback mode permits review.
            </p>
            <div className="grid gap-2 rounded-md border border-border/70 bg-muted/30 p-3">
              <PolicyFact
                label="Fallback mode"
                value={approvalModeLabel(summary.manual_fallback.approval_mode)}
              />
              <PolicyFact label="Explicit submission" value="Required" />
              <PolicyFact
                label="Review required"
                value={summary.manual_fallback.review_required ? "Yes" : "No"}
              />
            </div>
          </div>
        </DataCard>

        <DataCard title="Offline & Mobile Attendance">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Mobile and offline attendance require a registered eligible device. Offline evidence
                may include optional location and records both the original capture time and the
                server sync time.
              </p>
            </div>
            <p>
              Accepted offline events are provisional evidence and are not payroll-final by
              themselves.
            </p>
          </div>
        </DataCard>
      </div>

      <DataCard title="Location Evidence Retention">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-2 rounded-md border border-border/70 bg-muted/30 p-3">
            <PolicyFact
              label="Retention class"
              value={summary.retention.coordinate_retention_class}
            />
            <PolicyFact label="Precise-coordinate duration" value={retentionText} />
          </div>
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Precise coordinates become eligible for removal after their configured retention
              period. A background retention worker processes eligible records, so removal may not
              occur at the exact expiration time.
            </p>
            <p>
              After precise coordinates are purged, ordinary attendance records, derived decisions,
              reason codes, safe evidence summaries, review history, and audit records may remain.
            </p>
          </div>
        </div>
      </DataCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DataCard title="Who Can View Attendance Evidence">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              You can view your own sanitized attendance evidence. Managers can view scoped team
              evidence according to hierarchy and authorization.
            </p>
            <p>
              HR, Admin, and Auditor access is role-scoped. Routine reports and exports use safe
              summaries and exclude exact coordinates.
            </p>
          </div>
        </DataCard>

        <DataCard title="Who Can View Exact Location">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Exact coordinates are not shown in routine attendance views or exports. For geo
              fallback reviews, an authorized reviewer may reveal minimal exact coordinates only
              with record-level access and the dedicated exact-location permission.
            </p>
            <p>Successful authorized exact-coordinate reveals are audited.</p>
          </div>
        </DataCard>
      </div>

      <DataCard title="Your Browser Location Permission">
        <div className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Browser location permission is controlled by your browser or operating system site
            settings. HRMS cannot grant that permission for you, and this privacy page does not read
            live permission status or request location.
          </p>
        </div>
      </DataCard>

      <DataCard title="Review, Correct, Or Manage">
        <div className="grid gap-3 md:grid-cols-3">
          <ActionLink
            to="/attendance/calendar"
            icon={CalendarDays}
            title="Review attendance evidence"
            description="Open your attendance calendar and self evidence."
          />
          <ActionLink
            to="/attendance"
            icon={Clock}
            title="Correct attendance"
            description="Submit supported attendance regularizations for review."
          />
          <ActionLink
            to="/ems/profile"
            icon={Smartphone}
            title="Manage registered devices"
            description="View and revoke your own registered mobile devices."
          />
        </div>
      </DataCard>
    </div>
  );
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-full break-words text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function ActionFact({ label, action }: { label: string; action: AttendancePrivacyAction }) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <StatusBadge status={actionStatus(action)} label={actionLabel(action)} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{actionDescription(action)}</p>
    </div>
  );
}

function ActionLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: "/attendance/calendar" | "/attendance" | "/ems/profile";
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Button asChild variant="outline" className="h-auto justify-between gap-3 p-3 text-left">
      <Link to={to}>
        <span className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold">{title}</span>
            <span className="mt-1 block break-words text-xs font-normal text-muted-foreground">
              {description}
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    </Button>
  );
}

function approvalModeLabel(mode: "disabled" | "approval_required"): string {
  return mode === "approval_required" ? "Approval required" : "Disabled";
}

function locationRequirementLabel(requirement: string): string {
  if (requirement === "not_requested") return "Not requested";
  if (requirement === "requested_optional") return "Requested optional";
  return "Policy controlled";
}

function actionStatus(action: AttendancePrivacyAction): string {
  if (action === "allow") return "accepted";
  if (action === "manual_fallback") return "review_required";
  return "rejected";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
