import type { AttendanceLocationEvidence } from "./api";

export type BrowserGeolocationErrorKind =
  | "permission_denied"
  | "timeout"
  | "position_unavailable"
  | "insecure_context"
  | "permissions_policy_blocked"
  | "unsupported";

export type BrowserGeolocationResult =
  | {
      kind: "success";
      evidence: AttendanceLocationEvidence;
    }
  | {
      kind: BrowserGeolocationErrorKind;
      evidence: AttendanceLocationEvidence;
    };

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10_000,
};

interface DocumentWithPermissionsPolicy extends Document {
  permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
  featurePolicy?: { allowsFeature: (feature: string) => boolean };
}

function capturedNow(): string {
  return new Date().toISOString();
}

function unavailableEvidence(): BrowserGeolocationResult["evidence"] {
  return {
    captured_at: capturedNow(),
    provider: "browser",
    permission_state: "unavailable",
  };
}

function deniedEvidence(): BrowserGeolocationResult["evidence"] {
  return {
    captured_at: capturedNow(),
    provider: "browser",
    permission_state: "denied",
  };
}

function permissionsPolicyBlocksGeolocation(): boolean {
  if (typeof document === "undefined") return false;
  const policyDocument = document as DocumentWithPermissionsPolicy;
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
  if (!policy?.allowsFeature) return false;

  try {
    return !policy.allowsFeature("geolocation");
  } catch {
    return false;
  }
}

function geoErrorKind(error: GeolocationPositionError): BrowserGeolocationErrorKind {
  if (error.code === error.PERMISSION_DENIED) return "permission_denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "position_unavailable";
}

export async function requestBrowserGeolocationOnce(): Promise<BrowserGeolocationResult> {
  if (globalThis.isSecureContext === false) {
    return { kind: "insecure_context", evidence: unavailableEvidence() };
  }
  if (permissionsPolicyBlocksGeolocation()) {
    return { kind: "permissions_policy_blocked", evidence: unavailableEvidence() };
  }
  if (!navigator.geolocation?.getCurrentPosition) {
    return { kind: "unsupported", evidence: unavailableEvidence() };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          kind: "success",
          evidence: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_meters: position.coords.accuracy,
            altitude_meters: position.coords.altitude ?? undefined,
            captured_at: new Date(position.timestamp).toISOString(),
            provider: "browser",
            permission_state: "granted",
          },
        });
      },
      (error) => {
        const kind = geoErrorKind(error);
        resolve({
          kind,
          evidence: kind === "permission_denied" ? deniedEvidence() : unavailableEvidence(),
        });
      },
      GEOLOCATION_OPTIONS,
    );
  });
}
