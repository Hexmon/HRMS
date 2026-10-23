import { useCallback, useRef, useState } from "react";
import {
  ApiError,
  asRecord,
  isApiUnavailableError,
  text,
  userFacingErrorMessage,
} from "@/shared/api";
import type {
  AttendancePunchCommand,
  AttendancePunchEventType,
  AttendancePunchRequest,
} from "./api";
import {
  requestBrowserGeolocationOnce,
  type BrowserGeolocationErrorKind,
  type BrowserGeolocationResult,
} from "./browser-geolocation";
import type { EmployeeAttendanceGeoPolicy } from "./context";
import {
  employeeGeoDecisionDisplay,
  hasEmployeeGeoPolicySnapshot,
  type EmployeeGeoDecisionDisplay,
} from "./geo-decision-display";
import { useAttendanceGeoFallbackSubmitMutation, useManualAttendanceMutation } from "./queries";

export type ManualAttendanceResultKind = "accepted" | "rejected" | "uncertain";
export type ManualAttendanceGeoStatus = "idle" | "requesting";

export interface ManualAttendanceResult {
  kind: ManualAttendanceResultKind;
  action: AttendancePunchEventType;
  title: string;
  message: string;
  browserLocationKind?: BrowserGeolocationResult["kind"];
  backendReasonCode?: string;
  geoDecisionDisplay?: EmployeeGeoDecisionDisplay;
  manualFallback?: {
    reference: string;
    reviewRequired: boolean;
    reasonCode?: string;
  };
}

interface PendingAttendanceAction {
  action: AttendancePunchEventType;
  clientEventId: string;
  capturedAt: string;
  request?: AttendancePunchRequest;
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

function createRequestUuid(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure action identity is unavailable in this browser.");
  }
  return globalThis.crypto.randomUUID();
}

function shouldRequestBrowserLocation(
  policy: EmployeeAttendanceGeoPolicy | null | undefined,
): boolean {
  return Boolean(policy && policy.attendanceMode !== "manual_only");
}

function browserLocationMessage(kind: BrowserGeolocationErrorKind): string {
  switch (kind) {
    case "permission_denied":
      return "Location permission was not granted. The attendance policy evaluated this action without a browser location result.";
    case "timeout":
      return "The location check took too long to complete. The attendance policy evaluated this action without a browser location result.";
    case "position_unavailable":
      return "Your location could not be checked for this attendance action. The attendance policy evaluated it without a browser location result.";
    case "unsupported":
      return "Location is not available in this browser or device for this attendance action. The attendance policy evaluated it without a browser location result.";
    case "insecure_context":
      return "Location is not available in this browser context for this attendance action. The attendance policy evaluated it without a browser location result.";
    case "permissions_policy_blocked":
      return "Location is blocked for this page. The attendance policy evaluated this action without a browser location result.";
  }
}

function unavailableRejectedCopy(
  kind: BrowserGeolocationErrorKind,
): { title: string; message: string } | null {
  switch (kind) {
    case "timeout":
      return {
        title: "Location check took too long",
        message:
          "Attendance was not recorded because the location check took too long to complete.",
      };
    case "position_unavailable":
      return {
        title: "Location could not be checked",
        message:
          "Attendance was not recorded because location is not available in this browser or device for this action.",
      };
    case "unsupported":
      return {
        title: "Location unavailable in this browser",
        message:
          "Attendance was not recorded because location is not available in this browser or device for this action.",
      };
    case "insecure_context":
      return {
        title: "Location unavailable in this browser context",
        message: "Attendance was not recorded because location requires a secure HTTPS context.",
      };
    case "permissions_policy_blocked":
      return {
        title: "Location blocked for this page",
        message:
          "Attendance was not recorded because location is blocked by the page permissions policy.",
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
  const geoDecisionDisplay = hasEmployeeGeoPolicySnapshot(response.geo_policy)
    ? employeeGeoDecisionDisplay(response.geo_policy, "accepted")
    : undefined;
  const backendReasonCode =
    geoDecisionDisplay?.reasonCode ?? text(asRecord(response.geo_policy).reason_code);

  if (geoDecisionDisplay?.decision === "review") {
    return {
      kind: "accepted",
      action,
      title: "Manual fallback submitted for review",
      message: geoDecisionDisplay.description,
      browserLocationKind,
      backendReasonCode,
      geoDecisionDisplay,
    };
  }

  if (geoDecisionDisplay?.decision === "provisional") {
    return {
      kind: "accepted",
      action,
      title: `${ACTION_COPY[action].acceptedTitle} provisionally`,
      message: geoDecisionDisplay.description,
      browserLocationKind,
      backendReasonCode,
      geoDecisionDisplay,
    };
  }

  if (browserLocationKind && browserLocationKind !== "success" && !geoDecisionDisplay) {
    return {
      kind: "accepted",
      action,
      title: `${ACTION_COPY[action].acceptedTitle} without location`,
      message: browserLocationMessage(browserLocationKind),
      browserLocationKind,
      backendReasonCode,
    };
  }

  return {
    kind: "accepted",
    action,
    title: ACTION_COPY[action].acceptedTitle,
    message: ACTION_COPY[action].acceptedMessage,
    browserLocationKind,
    backendReasonCode,
    geoDecisionDisplay,
  };
}

function rejectedResultFor(
  action: AttendancePunchEventType,
  error: unknown,
  browserLocationKind?: BrowserGeolocationResult["kind"],
): ManualAttendanceResult {
  const details = error instanceof ApiError ? asRecord(error.details) : {};
  const reasonCode = text(details.reason_code);
  const geoPolicy = asRecord(details.geo_policy);
  const fallback = asRecord(details.manual_fallback);
  const fallbackReference = text(fallback.reference);
  const geoDecisionDisplay =
    hasEmployeeGeoPolicySnapshot(geoPolicy) || reasonCode.startsWith("geo_")
      ? employeeGeoDecisionDisplay(
          hasEmployeeGeoPolicySnapshot(geoPolicy)
            ? { ...geoPolicy, reason_code: text(geoPolicy.reason_code) || reasonCode }
            : { allowed: false, reason_code: reasonCode },
          "rejected",
          reasonCode,
        )
      : undefined;
  const unavailableCopy =
    reasonCode === "geo_location_unavailable" &&
    browserLocationKind &&
    browserLocationKind !== "success"
      ? unavailableRejectedCopy(browserLocationKind)
      : null;
  return {
    kind: "rejected",
    action,
    title: unavailableCopy?.title ?? ACTION_COPY[action].rejectedTitle,
    message:
      unavailableCopy?.message ??
      (reasonCode.startsWith("geo_") ? geoDecisionDisplay?.description : undefined) ??
      userFacingErrorMessage(error, "The attendance request could not be completed."),
    browserLocationKind,
    backendReasonCode: reasonCode,
    geoDecisionDisplay,
    manualFallback:
      fallback.available === true && fallbackReference
        ? {
            reference: fallbackReference,
            reviewRequired: fallback.review_required === true,
            reasonCode: text(fallback.reason_code) || reasonCode,
          }
        : undefined,
  };
}

function attendanceRequestFor(
  clientEventId: string,
  capturedAt: string,
  command: AttendancePunchCommand,
): AttendancePunchRequest {
  return {
    client_event_id: clientEventId,
    captured_at: capturedAt,
    device: null,
    command,
  };
}

async function attendanceCommandFor(
  action: AttendancePunchEventType,
  sourceView: "attendance_page" | "dashboard",
  useBrowserLocation: boolean,
): Promise<{
  command: AttendancePunchCommand;
  browserLocationKind?: BrowserGeolocationResult["kind"];
}> {
  if (!useBrowserLocation) {
    return {
      command: {
        event_type: action,
        source: "web",
        metadata: { source_view: sourceView },
      },
    };
  }

  const location = await requestBrowserGeolocationOnce();
  return {
    command: {
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
  const fallbackMutation = useAttendanceGeoFallbackSubmitMutation();
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
          identity = {
            action,
            clientEventId: createRequestUuid(),
            capturedAt: new Date().toISOString(),
          };
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
        if (!identity.request) {
          const needsBrowserLocation = shouldRequestBrowserLocation(geoPolicy);
          if (needsBrowserLocation) setGeoStatus("requesting");
          const prepared = await attendanceCommandFor(action, sourceView, needsBrowserLocation);
          identity.request = attendanceRequestFor(
            identity.clientEventId,
            identity.capturedAt,
            prepared.command,
          );
          identity.browserLocationKind = prepared.browserLocationKind;
        }

        const request = identity.request;
        if (!request) {
          throw new Error("Attendance request was not prepared.");
        }
        const response = await mutation.mutateAsync({
          request,
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

  const submitManualFallback = useCallback(async () => {
    const current = result;
    if (!current?.manualFallback || inFlight.current || fallbackMutation.isPending) return;
    inFlight.current = true;

    try {
      const response = await fallbackMutation.mutateAsync({
        reference: current.manualFallback.reference,
        idempotencyKey: createRequestUuid(),
      });
      pendingAction.current = null;
      setResult({
        ...acceptedResultFor(current.action, response, current.browserLocationKind),
        title: current.manualFallback.reviewRequired
          ? "Manual fallback submitted for review"
          : "Manual fallback recorded",
        message: current.manualFallback.reviewRequired
          ? "Your punch was recorded as manual fallback and sent to your manager for review."
          : "Your punch was recorded using manual fallback.",
      });
    } catch (error) {
      setResult({
        ...rejectedResultFor(current.action, error, current.browserLocationKind),
        title: "Manual fallback failed",
      });
      onDeterministicFailure?.();
    } finally {
      inFlight.current = false;
    }
  }, [fallbackMutation, onDeterministicFailure, result]);

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
    submitManualFallback,
    clearResult,
    reconcile,
    result,
    geoStatus,
    isPending: mutation.isPending || fallbackMutation.isPending,
    canRetry: result?.kind === "uncertain" && pendingAction.current !== null,
    canSubmitManualFallback: Boolean(result?.manualFallback),
  };
}
