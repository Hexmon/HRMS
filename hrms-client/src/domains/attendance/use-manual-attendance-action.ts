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
import {
  employeeGeoDecisionDisplay,
  hasEmployeeGeoPolicySnapshot,
  type EmployeeGeoDecisionDisplay,
} from "./geo-decision-display";
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
  geoDecisionDisplay?: EmployeeGeoDecisionDisplay;
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
  const geoDecisionDisplay = hasEmployeeGeoPolicySnapshot(response.geo_policy)
    ? employeeGeoDecisionDisplay(response.geo_policy, "accepted")
    : undefined;
  const backendReasonCode =
    geoDecisionDisplay?.reasonCode ?? text(asRecord(response.geo_policy).reason_code);

  if (geoDecisionDisplay?.decision === "review") {
    return {
      kind: "accepted",
      action,
      title: "Manual fallback recorded",
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
      geoDecisionDisplay?.description ??
      userFacingErrorMessage(error, "The attendance request could not be completed."),
    browserLocationKind,
    backendReasonCode: reasonCode,
    geoDecisionDisplay,
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
  const requestBody = useRef<AttendancePunchBody | null>(null);
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

        requestBody.current = identity.body;
        const response = await mutation.mutateAsync({
          action,
          idempotencyKey: identity.idempotencyKey,
          sourceView,
          requestBody,
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
        requestBody.current = null;
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
