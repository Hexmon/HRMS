# GEO-S12-017 QA Summary

## Task

GEO-S12-017

## Domain

Frontend Testing

## Automated Geolocation Strategy

Browser geolocation is stubbed through Playwright `page.addInitScript` before application boot. The reusable helper replaces `navigator.geolocation` with deterministic test behavior and never calls the real browser or OS location stack.

The automated suite uses synthetic coordinates, timestamps, and accuracy values. Browser failures are simulated by invoking the relevant geolocation error callback immediately, so timeout coverage does not wait for the production 10-second timeout. Backend route mocks remain authoritative for policy verdicts such as stale evidence, low accuracy, denial, and manual fallback.

## Automated Matrix

| Scenario | Coverage |
| --- | --- |
| Manual-only regression | `manual_only keeps web punches and does not request browser geolocation` |
| Successful check-in | `geo policy requests one browser position and sends deterministic web_geo evidence` |
| Successful check-out | `check-out uses the same one-shot browser geo evidence path` |
| Geolocation options | Success test asserts `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 10000` |
| One-shot privacy model | Success/check-out/network tests assert `watchPosition` remains unused |
| Permission denied | `permission denial sends denied evidence without coordinate fields` |
| Timeout | `timeout sends unavailable evidence immediately and preserves timeout-specific UI` |
| Position unavailable | `position unavailable sends unavailable evidence without coordinate fields` |
| Unsupported geolocation | `unsupported geolocation submits unavailable evidence without calling browser location` |
| Insecure context | `insecure context sends unavailable evidence without invoking geolocation` |
| Permissions policy blocked | `permissions policy denial sends unavailable evidence without invoking geolocation` |
| Stale evidence | `stale evidence uses an explicit old timestamp while backend provides the stale verdict` |
| Low accuracy | `low accuracy submits explicit accuracy while backend provides the accuracy verdict` |
| Permission-denied fallback | `permission denied fallback submits reference without coordinates or location reacquisition` |
| Timeout fallback | `timeout fallback is backend-driven and does not reacquire browser location` |
| Stale fallback | `stale and low-accuracy fallback availability comes from backend responses` |
| Accuracy fallback | `low accuracy fallback displays backend-provided fallback CTA` |
| Fallback unavailable | `fallback unavailable does not show CTA or submit fallback reference` |
| Duplicate fallback click | `rapid duplicate fallback clicks submit only one fallback request` |
| Network uncertainty | `uncertain geo punch retry reuses request identity and does not show fallback` |
| Rapid attendance click | `rapid interaction does not duplicate geolocation or punch requests` |
| Privacy | Success, stale, accuracy, and fallback tests assert synthetic coordinates do not appear in UI/URL/storage; failure tests assert no coordinate fields in failure evidence |

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Frontend typecheck: `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json` | Passed | Run from `hrms-client`. |
| Changed-file lint: `.\node_modules\.bin\eslint.cmd e2e/attendance-browser-geo.spec.ts e2e/helpers/mock-geolocation.ts` | Passed | Run after formatting only touched test files. |
| Playwright browser install: `.\node_modules\.bin\playwright.cmd install chromium` | Passed | Required because the local Chromium headless shell was missing. |
| Targeted Playwright: `$env:E2E_SKIP_WEB_SERVER='1'; .\node_modules\.bin\playwright.cmd test e2e/attendance-browser-geo.spec.ts --project=chromium` | Passed | 19 passed. Vite dev server was started separately and stopped after the run. |

## Manual QA - Chrome / Edge Success

1. Start the backend and frontend with an employee attendance policy that requires browser geo evidence.
2. Open the employee attendance page in Chrome or Edge.
3. Reset the site location permission if it was previously allowed or blocked.
4. Click `Clock in`.
5. Choose `Allow` in the browser location prompt.
6. Verify `Getting browser location` appears while the browser responds.
7. Verify the final attendance state matches the configured policy: Accepted, Provisional, Review, or Rejected.
8. Do not capture exact coordinates in committed screenshots or QA notes.

## Manual QA - Permission Denied

1. Reset the site location permission.
2. Click `Clock in`.
3. Choose `Block` in the browser location prompt, or block location for the site in browser settings.
4. Verify the employee sees the permission-denied explanation.
5. If the policy permits fallback, verify `Continue manually` appears.
6. If the policy does not permit fallback, verify no fallback CTA appears.

## Manual QA - Location Unavailable

Use a deterministic browser or OS setup when available, such as disabling location services or using browser DevTools Sensors if the tester's Chrome or Edge version supports a suitable unavailable simulation. Verify the unavailable-location explanation. Do not rely on waiting for a natural timeout as the primary manual test.

## Manual QA - Timeout

Automated deterministic timeout coverage is authoritative. A real browser timeout is environment-dependent and should not be reproduced by simply waiting. If the team's browser tooling provides a reliable timeout simulation, it may be used as supplemental manual QA.

## Manual QA - Stale Location

Real-browser stale timestamps are not reliably controllable through ordinary browser permissions. Use automated deterministic coverage and backend geo-policy tests as authoritative. Manual QA may verify stale UI in a staged or mocked environment designed to return a stale backend verdict.

## Manual QA - Low Accuracy

If Chrome or Edge DevTools Sensors supports accuracy manipulation in the tester's environment, use it to perform a supplemental smoke test. Otherwise, automated synthetic evidence coverage remains authoritative. Do not require poor real GPS reception.

## Manual QA - Fallback

1. Trigger a geo failure whose backend policy permits manual fallback.
2. Verify the employee sees the backend-provided reason.
3. Verify `Continue manually` appears.
4. Click `Continue manually`.
5. Verify the final Review or accepted fallback state.
6. Confirm the browser does not show a second location permission prompt.

## Manual Privacy Check

For success, failure, and fallback states, verify exact coordinates are not visibly rendered in the employee result state or URL. Avoid committing DevTools network screenshots that contain raw coordinate evidence.

## Residual Notes

- No production source files were changed.
- The first targeted Playwright attempt failed because the local Playwright Chromium headless shell was missing. Installing Chromium resolved the environment issue.
