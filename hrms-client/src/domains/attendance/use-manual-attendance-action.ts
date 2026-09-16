import { useCallback, useRef, useState } from "react";
import {
  ApiError,
  asRecord,
  isApiUnavailableError,
  text,
  userFacingErrorMessage,
} from "@/shared/api";
import type { AttendancePunchBody, AttendancePunchEventType } from "./api";
import {
  requestBrowserGeolocationOnce,
  type BrowserGeolocationErrorKind,
  type BrowserGeolocationResult,
} from "./browser-geolocation";
import type { EmployeeAttendanceGeoPolicy } from "./context";
import { useManualAttendanceMutation } from "./queries";

export type ManualAttendanceResultKind = "accepted" | "rejected" | "uncertain";
export type ManualAttendanceGeoStatus = "idle" | "requesting";

export interface ManualAttendanceResult {
  kind: ManualAttendanceResultKind;
  action: AttendancePunchEventType;
  title: string;
  message: string;
  browserLocationKind?: BrowserGeolocationResult["kind"];
  backendReasonCode?: string;
}

interface PendingAttendanceAction {
  action: AttendancePunchEventType;
  idempotencyKey: string;
  body?: AttendancePunchBody;
  browserLocationKind?: BrowserGeolocationResult["kind"];
}

interface UseManualAttendanceActionOptions {
  sourceView: "attendance_page" | "dashboard";
  geoPolicy?: EmployeeAttendanceGeoPolicy | null;
  onDeterministicFailure?: () => void;
}

const ACTION_COPY: Record<
  AttendancePunchEventType,
  { acceptedTitle: string; acceptedMessage: string; rejectedTitle: string }
> = {
  check_in: {
    acceptedTitle: "Clock-in recorded",
    acceptedMessage: "Your work session has started.",
    rejectedTitle: "Clock-in was not recorded",
  },
  break_start: {
    acceptedTitle: "Break started",
    acceptedMessage: "Your break is now being recorded.",
    rejectedTitle: "Break was not started",
  },
  break_end: {
    acceptedTitle: "Work resumed",
    acceptedMessage: "Your break has ended.",
    rejectedTitle: "Work was not resumed",
  },
  check_out: {
    acceptedTitle: "Clock-out recorded",
    acceptedMessage: "Your work session has ended.",
    rejectedTitle: "Clock-out was not recorded",
  },
};

function createIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure action identity is unavailable in this browser.");
  }
  return `attendance-${globalThis.crypto.randomUUID()}`;
}

function shouldRequestBrowserLocation(
  policy: EmployeeAttendanceGeoPolicy | null | undefined,
): boolean {
  return Boolean(policy && policy.attendanceMode !== "manual_only");
}

function browserLocationMessage(kind: BrowserGeolocationErrorKind): string {
  switch (kind) {
    case "permission_denied":
      return "Location permission was denied. The request was sent with denial evidence for policy evaluation.";
    case "timeout":
      return "Location request timed out. The request was sent with unavailable-location evidence for policy evaluation.";
    case "position_unavailable":
      return "Your browser could not determine location. The request was sent with unavailable-location evidence for policy evaluation.";
    case "unsupported":
      return "This browser does not support geolocation. The request was sent with unavailable-location evidence for policy evaluation.";
    case "insecure_context":
      return "Browser location requires a secure HTTPS context. The request was sent with unavailable-location evidence for policy evaluation.";
    case "permissions_policy_blocked":
      return "Browser location is blocked by the page permissions policy. The request was sent with unavailable-location evidence for policy evaluation.";
  }
}

function unavailableRejectedCopy(
  kind: BrowserGeolocationErrorKind,
): { title: string; message: string } | null {
  switch (kind) {
    case "timeout":
      return {
        title: "Location request timed out",
        message: "Attendance was not recorded because the browser location request timed out.",
      };
    case "position_unavailable":
      return {
        title: "Location unavailable",
        message:
          "Attendance was not recorded because the browser or device could not determine location.",
      };
    case "unsupported":
      return {
        title: "Browser location unsupported",
        message:
          "Attendance was not recorded because browser geolocation is unsupported or unavailable.",
      };
    case "insecure_context":
      return {
        title: "Secure context required",
        message:
          "Attendance was not recorded because browser location requires a secure HTTPS context.",
      };
    case "permissions_policy_blocked":
      return {
        title: "Location blocked by page policy",
        message:
          "Attendance was not recorded because browser location is blocked by the page permissions policy.",
      };
    case "permission_denied":
      return null;
  }
}

function acceptedResultFor(
  action: AttendancePunchEventType,
  response: Record<string, unknown>,
  browserLocationKind?: BrowserGeolocationResult["kind"],
): ManualAttendanceResult {
  const geoPolicy = asRecord(response.geo_policy);
  if (geoPolicy.fallback_used === true) {
    return {
      kind: "accepted",
      action,
      title: "Manual fallback recorded",
      message: "Attendance was accepted through the configured manual fallback policy.",
      browserLocationKind,
      backendReasonCode: text(geoPolicy.reason_code),
    };
  }

  if (browserLocationKind && browserLocationKind !== "success") {
    return {
      kind: "accepted",
      action,
      title: `${ACTION_COPY[action].acceptedTitle} without location`,
      message: browserLocationMessage(browserLocationKind),
      browserLocationKind,
      backendReasonCode: text(geoPolicy.reason_code),
    };
  }

  return {
    kind: "accepted",
    action,
    title: ACTION_COPY[action].acceptedTitle,
    message: ACTION_COPY[action].acceptedMessage,
    browserLocationKind,
    backendReasonCode: text(geoPolicy.reason_code),
  };
}

function geoErrorCopy(reasonCode: string): { title: string; message: string } | null {
  switch (reasonCode) {
    case "geo_permission_denied":
      return {
        title: "Location permission denied",
        message:
          "Attendance was not recorded because the resolved policy requires location permission.",
      };
    case "geo_location_unavailable":
      return {
        title: "Location unavailable",
        message: "Attendance was not recorded because usable location evidence was unavailable.",
      };
    case "geo_stale_evidence":
      return {
        title: "Location was too old",
        message:
          "Attendance was not recorded because the browser returned stale location evidence.",
      };
    case "geo_accuracy_exceeded":
      return {
        title: "Location accuracy too low",
        message:
          "Attendance was not recorded because the location accuracy exceeded policy limits.",
      };
    case "geo_fence_not_configured":
      return {
        title: "Attendance location is not configured",
        message:
          "Attendance was not recorded because no effective geofence is configured for this policy.",
      };
    case "geo_outside_fence":
      return {
        title: "Location outside work area",
        message:
          "Attendance was not recorded because the location was outside the configured work area.",
      };
    case "geo_boundary_uncertain":
      return {
        title: "Location could not be verified",
        message:
          "Attendance was not recorded because the location was too close to the work-area boundary.",
      };
    case "geo_evidence_missing":
      return {
        title: "Location evidence missing",
        message:
          "Attendance was not recorded because the resolved policy requires location evidence.",
      };
    case "geo_manual_fallback_disallowed":
      return {
        title: "Manual fallback unavailable",
        message:
          "Attendance was not recorded because manual fallback is disabled by the resolved policy.",
      };
    default:
      return null;
  }
}

function rejectedResultFor(
  action: AttendancePunchEventType,
  error: unknown,
  browserLocationKind?: BrowserGeolocationResult["kind"],
): ManualAttendanceResult {
  const reasonCode = error instanceof ApiError ? text(asRecord(error.details).reason_code) : "";
  const unavailableCopy =
    reasonCode === "geo_location_unavailable" &&
    browserLocationKind &&
    browserLocationKind !== "success"
      ? unavailableRejectedCopy(browserLocationKind)
      : null;
  const geoCopy = unavailableCopy ?? (reasonCode ? geoErrorCopy(reasonCode) : null);
  return {
    kind: "rejected",
    action,
    title: geoCopy?.title ?? ACTION_COPY[action].rejectedTitle,
    message:
      geoCopy?.message ??
      userFacingErrorMessage(error, "The attendance request could not be completed."),
    browserLocationKind,
    backendReasonCode: reasonCode,
  };
}

async function attendanceBodyFor(
  action: AttendancePunchEventType,
  sourceView: "attendance_page" | "dashboard",
  useBrowserLocation: boolean,
): Promise<{
  body: AttendancePunchBody;
  browserLocationKind?: BrowserGeolocationResult["kind"];
}> {
  if (!useBrowserLocation) {
    return {
      body: {
        event_type: action,
        source: "web",
        metadata: { source_view: sourceView },
      },
    };
  }

  const location = await requestBrowserGeolocationOnce();
  return {
    body: {
      event_type: action,
      source: "web_geo",
      metadata: {
        source_view: sourceView,
        browser_location_result: location.kind,
      },
      location: location.evidence,
    },
    browserLocationKind: location.kind,
  };
}

export function useManualAttendanceAction({
  sourceView,
  geoPolicy,
  onDeterministicFailure,
}: UseManualAttendanceActionOptions) {
  const mutation = useManualAttendanceMutation();
  const pendingAction = useRef<PendingAttendanceAction | null>(null);
  const inFlight = useRef(false);
  const [result, setResult] = useState<ManualAttendanceResult | null>(null);
  const [geoStatus, setGeoStatus] = useState<ManualAttendanceGeoStatus>("idle");

  const execute = useCallback(
    async (action: AttendancePunchEventType, retry = false) => {
      if (inFlight.current || mutation.isPending) return;

      let identity = retry ? pendingAction.current : null;
      if (!identity || identity.action !== action) {
        try {
          identity = { action, idempotencyKey: createIdempotencyKey() };
        } catch (error) {
          pendingAction.current = null;
          setResult({
            kind: "rejected",
            action,
            title: ACTION_COPY[action].rejectedTitle,
            message: userFacingErrorMessage(
              error,
              "This browser cannot create a secure attendance request.",
            ),
          });
          return;
        }
      }
      pendingAction.current = identity;
      inFlight.current = true;

      try {
        if (!identity.body) {
          const needsBrowserLocation = shouldRequestBrowserLocation(geoPolicy);
          if (needsBrowserLocation) setGeoStatus("requesting");
          const prepared = await attendanceBodyFor(action, sourceView, needsBrowserLocation);
          identity.body = prepared.body;
          identity.browserLocationKind = prepared.browserLocationKind;
        }

        const response = await mutation.mutateAsync({
          action,
          idempotencyKey: identity.idempotencyKey,
          sourceView,
          body: identity.body,
        });
        pendingAction.current = null;
        setResult(acceptedResultFor(action, response, identity.browserLocationKind));
      } catch (error) {
        if (isApiUnavailableError(error)) {
          setResult({
            kind: "uncertain",
            action,
            title: "Outcome not confirmed",
            message:
              "The connection ended before the result arrived. Check the latest status before starting another action.",
            browserLocationKind: identity.browserLocationKind,
          });
          return;
        }

        pendingAction.current = null;
        setResult(rejectedResultFor(action, error, identity.browserLocationKind));
        onDeterministicFailure?.();
      } finally {
        setGeoStatus("idle");
        inFlight.current = false;
      }
    },
    [geoPolicy, mutation, onDeterministicFailure, sourceView],
  );

  const retry = useCallback(async () => {
    if (!pendingAction.current) return;
    await execute(pendingAction.current.action, true);
  }, [execute]);

  const clearResult = useCallback(() => {
    if (result?.kind !== "uncertain") pendingAction.current = null;
    setResult(null);
  }, [result?.kind]);

  const reconcile = useCallback(
    (allowedActions: AttendancePunchEventType[]) => {
      const pending = pendingAction.current;
      if (result?.kind !== "uncertain" || !pending || allowedActions.includes(pending.action)) {
        return;
      }

      pendingAction.current = null;
      setResult({
        kind: "accepted",
        action: pending.action,
        title: "Latest attendance status loaded",
        message:
          "The server no longer offers this action. Review the current session status before continuing.",
      });
    },
    [result?.kind],
  );

  return {
    execute,
    retry,
    clearResult,
    reconcile,
    result,
    geoStatus,
    isPending: mutation.isPending,
    canRetry: result?.kind === "uncertain" && pendingAction.current !== null,
  };
}
