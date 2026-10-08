# GEO-S14-011 Responsive Mobile Web Fallback

## Scope

Implemented the Sprint 14 mobile web fallback polish for the existing HRMS frontend. Work stayed within responsive attendance UI, shared close/sidebar controls, regularization handoff state, user-facing API error redaction, and the requested e2e coverage.

## Files Changed

- `src/components/app-sidebar.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/sidebar.tsx`
- `src/domains/attendance/employee-manual-attendance-widget.tsx`
- `src/domains/attendance/employee-regularization-form.tsx`
- `src/routes/_app/attendance.calendar.tsx`
- `src/routes/_app/attendance.index.tsx`
- `src/shared/api/user-facing-errors.ts`
- `e2e/attendance-mobile-responsive.spec.ts`
- `e2e/error-toast.spec.ts`
- `docs/qa/runs/geo-s14-011/summary.md`

## Mobile UX Fixes

- Increased mobile sidebar trigger and sheet/dialog close targets to approximately 44px while preserving compact desktop sizing.
- Closed the mobile sidebar after navigation so the selected page is immediately reachable on narrow screens.
- Added narrow-phone wrapping for attendance work, break, target, and selected-day fact layouts.
- Added a local horizontal scroll boundary for the attendance calendar grid to avoid document-level overflow at 320px.
- Added a historical-day "Regularize this day" CTA from calendar detail to the employee regularization form.
- Added validated `regularizeDate` search-state handoff and kept the date editable after prefill.

## Viewports Covered

- Existing mobile coverage at 390x844.
- New narrow phone coverage at 320x568.
- Checks assert no root/body horizontal overflow and verify local calendar overflow is owned by the calendar scroller.

## Attendance Flows Verified

- Employee punch denial with manual fallback at mobile size.
- Permission-denied manual fallback at 320px.
- Manual fallback submission without browser location reacquisition.
- Calendar evidence rendering without raw coordinates.
- Calendar historical date selection to regularization prefill.
- Invalid `regularizeDate` search parameter sanitization.
- Manager review sheet and exact-location confirmation behavior.
- Admin attendance overview, exceptions, and reports mobile overflow checks.

## Geo / Background Tracking Verification

- No `watchPosition` usage was added.
- Static search found only the existing one-shot `navigator.geolocation.getCurrentPosition` path in `src/domains/attendance/browser-geolocation.ts`.
- Playwright coverage confirms permission-denied, timeout, unsupported, insecure-context, policy-denied, stale, low-accuracy, and duplicate-click paths do not trigger background tracking or repeated fallback geolocation acquisition.

## Privacy / Error Redaction Verification

- User-facing API error details now skip latitude, longitude, lat, lng, lon, coordinate-bearing fields, browser/raw location fields, and structured `location` details.
- Safe validation context such as reason codes, selected action, subject field messages, request IDs, and non-sensitive validation notes remains visible.
- Exact manager location coordinates remain gated behind the existing confirmation flow and are cleared when the dialog closes.

## API Contract Preservation

- No backend files changed.
- No migrations changed.
- No OpenAPI or generated frontend contract artifacts changed.
- No attendance API schema, request envelope, DTO, geolocation helper contract, or regularization API contract changed.
- No package manifests or dependency lockfiles changed.

## Playwright Coverage

- Added 320px mobile fallback tests in `e2e/attendance-mobile-responsive.spec.ts`.
- Added API error coordinate redaction coverage in `e2e/error-toast.spec.ts`.
- Made `e2e/error-toast.spec.ts` self-contained with a mocked authenticated frontend session so the toast behavior can run without seeded local backend login credentials.

## Validation Results

- `pnpm lint`: BLOCKED. pnpm stopped before the script with `ERR_PNPM_IGNORED_BUILDS` for `esbuild@0.27.7`.
- `pnpm typecheck`: BLOCKED. Same pnpm ignored-builds gate before script execution.
- `pnpm build`: BLOCKED. Same pnpm ignored-builds gate before script execution.
- `.\node_modules\.bin\eslint.cmd ...changed files...`: PASS with one existing warning in `src/components/ui/sidebar.tsx` for `react-refresh/only-export-components`.
- `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json`: PASS.
- `.\node_modules\.bin\vite.cmd build`: PASS. Build emitted existing large-chunk and third-party `"use client"` directive warnings.
- `.\node_modules\.bin\playwright.cmd test e2e/attendance-mobile-responsive.spec.ts`: PASS, 7 passed.
- `.\node_modules\.bin\playwright.cmd test e2e/attendance-browser-geo.spec.ts e2e/attendance-regression.spec.ts e2e/attendance-employee-day-evidence-model.spec.ts e2e/attendance-manager-exact-location.spec.ts`: PASS, 32 passed.
- `.\node_modules\.bin\playwright.cmd test e2e/error-toast.spec.ts`: PASS, 2 passed.
- `git diff --check`: PASS.

## Environment Limitations

- The requested pnpm script entrypoints could not run in this workspace until ignored build scripts are approved or otherwise configured for `esbuild@0.27.7`.
- Direct local binaries were used for lint, typecheck, build, and Playwright validation without changing package manifests or pnpm configuration.
- Git reports Windows line-ending conversion warnings for the touched files, but `git diff --check` reports no whitespace errors.

## Remaining Risks

- Full repo-wide direct ESLint is still noisy in this checkout because unrelated files carry the same Prettier line-ending issue; scoped lint over the task files passes aside from the existing Fast Refresh warning.
- The mobile fallback tests are browser-level mocked API tests. They verify frontend behavior and contract shape but do not replace backend integration coverage.
