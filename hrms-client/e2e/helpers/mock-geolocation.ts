import type { Page } from "@playwright/test";

export interface MockGeolocationSuccessOptions {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp?: number;
  altitude?: number | null;
  delayMs?: number;
}

export interface GeolocationOptionsSnapshot {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
}

type GeolocationErrorKind = "permission_denied" | "timeout" | "unavailable";
type BlockedGeolocationKind = "insecure_context" | "permissions_policy_blocked";

export const SYNTHETIC_GEOLOCATION = {
  latitude: 12.345678,
  longitude: 56.789012,
  accuracy: 8,
  timestamp: Date.UTC(2026, 0, 15, 4, 5, 6),
  altitude: null,
} as const;

export async function mockGeolocationSuccess(
  page: Page,
  options: MockGeolocationSuccessOptions = {},
): Promise<void> {
  await installGeolocationMock(page, {
    kind: "success",
    latitude: options.latitude ?? SYNTHETIC_GEOLOCATION.latitude,
    longitude: options.longitude ?? SYNTHETIC_GEOLOCATION.longitude,
    accuracy: options.accuracy ?? SYNTHETIC_GEOLOCATION.accuracy,
    timestamp: options.timestamp ?? SYNTHETIC_GEOLOCATION.timestamp,
    altitude: options.altitude ?? SYNTHETIC_GEOLOCATION.altitude,
    delayMs: options.delayMs ?? 0,
  });
}

export async function mockGeolocationPermissionDenied(page: Page): Promise<void> {
  await installGeolocationMock(page, { kind: "permission_denied", delayMs: 0 });
}

export async function mockGeolocationTimeout(page: Page): Promise<void> {
  await installGeolocationMock(page, { kind: "timeout", delayMs: 0 });
}

export async function mockGeolocationUnavailable(page: Page): Promise<void> {
  await installGeolocationMock(page, { kind: "unavailable", delayMs: 0 });
}

export async function mockGeolocationUnsupported(page: Page): Promise<void> {
  await installGeolocationMock(page, { kind: "unsupported" });
}

export async function mockGeolocationBlocked(
  page: Page,
  kind: BlockedGeolocationKind,
): Promise<void> {
  await installGeolocationMock(page, { kind });
}

export async function getGeolocationCallCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__attendanceGeoMock?.calls ?? 0);
}

export async function getWatchPositionCallCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__attendanceGeoMock?.watchCalls ?? 0);
}

export async function getLastGeolocationOptions(
  page: Page,
): Promise<GeolocationOptionsSnapshot | null> {
  return page.evaluate(() => window.__attendanceGeoMock?.lastOptions ?? null);
}

type MockPayload =
  | {
      kind: "success";
      latitude: number;
      longitude: number;
      accuracy: number;
      timestamp: number;
      altitude: number | null;
      delayMs: number;
    }
  | { kind: GeolocationErrorKind; delayMs: number }
  | { kind: "unsupported" }
  | { kind: BlockedGeolocationKind };

async function installGeolocationMock(page: Page, payload: MockPayload): Promise<void> {
  await page.addInitScript((mock) => {
    type MockState = {
      calls: number;
      watchCalls: number;
      clearWatchCalls: number;
      lastOptions: GeolocationOptionsSnapshot | null;
      lastWatchOptions: GeolocationOptionsSnapshot | null;
      lastClearedWatchId: number | null;
    };

    const state: MockState = {
      calls: 0,
      watchCalls: 0,
      clearWatchCalls: 0,
      lastOptions: null,
      lastWatchOptions: null,
      lastClearedWatchId: null,
    };

    Object.defineProperty(window, "__attendanceGeoMock", {
      configurable: true,
      value: state,
    });

    if (mock.kind === "insecure_context") {
      Object.defineProperty(window, "isSecureContext", {
        configurable: true,
        value: false,
      });
    }

    if (mock.kind === "permissions_policy_blocked") {
      const policy = {
        allowsFeature: (feature: string) => feature !== "geolocation",
      };
      Object.defineProperty(document, "permissionsPolicy", {
        configurable: true,
        value: policy,
      });
      Object.defineProperty(document, "featurePolicy", {
        configurable: true,
        value: policy,
      });
    }

    if (mock.kind === "unsupported") {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: undefined,
      });
      return;
    }

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(
          success: PositionCallback,
          error?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) {
          state.calls += 1;
          state.lastOptions = normalizeOptions(options);

          window.setTimeout(
            () => {
              if (mock.kind === "success") {
                success({
                  coords: {
                    latitude: mock.latitude,
                    longitude: mock.longitude,
                    accuracy: mock.accuracy,
                    altitude: mock.altitude,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                  },
                  timestamp: mock.timestamp,
                });
                return;
              }

              const code = mock.kind === "permission_denied" ? 1 : mock.kind === "timeout" ? 3 : 2;
              error?.({
                code,
                message: mock.kind,
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              } as GeolocationPositionError);
            },
            "delayMs" in mock ? mock.delayMs : 0,
          );
        },
        watchPosition(
          _success: PositionCallback,
          _error?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) {
          state.watchCalls += 1;
          state.lastWatchOptions = normalizeOptions(options);
          return 12017;
        },
        clearWatch(id: number) {
          state.clearWatchCalls += 1;
          state.lastClearedWatchId = id;
        },
      },
    });

    function normalizeOptions(options?: PositionOptions): GeolocationOptionsSnapshot | null {
      if (!options) return null;
      return {
        enableHighAccuracy: options.enableHighAccuracy,
        maximumAge: options.maximumAge,
        timeout: options.timeout,
      };
    }
  }, payload);
}

declare global {
  interface Window {
    __attendanceGeoMock?: {
      calls: number;
      watchCalls: number;
      clearWatchCalls: number;
      lastOptions: GeolocationOptionsSnapshot | null;
      lastWatchOptions: GeolocationOptionsSnapshot | null;
      lastClearedWatchId: number | null;
    };
  }
}
