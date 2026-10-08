# GEO-S15-013 QA Summary

Date: 2026-10-08
Branch: sprint-15/geo-s15-013

## Task

- Task ID: GEO-S15-013
- Domain: Documentation/help text and UX copy
- Deliverable: Employee/admin help copy explaining manual, geo, fallback, provisional, and regularization behavior
- Scope: Frontend copy/help polish, focused Playwright assertions, and this QA artifact

## Copy Principles

- Attendance copy uses action-triggered wording rather than surveillance framing.
- Policy-dependent behavior is described from already-loaded policy context where available.
- Privacy claims stay precise: one-time location request when needed, no continuous background attendance tracking, routine privacy-safe evidence, and restricted exact-location access.
- Manual attendance, manual fallback, and regularization are described as separate workflows.
- Provisional is not treated as final approval or payroll-final status.
- Site/location wording uses work area, work site, location check, location evidence, manual fallback, and exact-location reveal terminology.

## Confirmed Defects

### GEO-S15-013-D01

The employee attendance widget now shows pre-action policy guidance before punch actions. It explains the current attendance mode, when a one-time location check applies, whether manual fallback may be policy-controlled, and links to Attendance Privacy through "Learn about attendance privacy."

### GEO-S15-013-D02

Admin Geo and Attendance Policy screens now include concise consequence-oriented help. The copy explains action-time geo evaluation, published work-site effects, policy-controlled manual fallback, review semantics, privacy-safe routine reporting, and separately restricted exact-location access.

### GEO-S15-013-D03

Employee-facing terminology now distinguishes manual attendance, manual fallback, and regularization. The fallback CTA uses "Use manual fallback," fallback success says "Manual fallback submitted for review," and nearby help states that regularization is a separate historical correction path.

### GEO-S15-013-D04

Admin offline policy wording now states that accepted offline attendance remains Provisional after sync and is not payroll-final by itself until verified or reviewed according to policy.

### GEO-S15-013-D05

Employee-visible failure copy no longer uses internal phrases such as "denial evidence" or "unavailable-location evidence." Failure text now describes the user-visible condition, such as location permission not granted, location check taking too long, unavailable browser/device location, stale results, low accuracy, or outside configured work area.

## Canonical Behavior Preserved

- Geo attendance still uses a one-time browser location request at attendance action time.
- The app still does not introduce background attendance tracking.
- Manual-only policy still submits web attendance without requesting browser location.
- Manual fallback remains policy-controlled and review-aware.
- Regularization remains the historical correction workflow.
- Offline/mobile attendance remains provisional and is not payroll-final by sync alone.
- Exact-location access remains separate, restricted, and audited.

## Policy-Driven Variants

- Manual-only: explains that current policy uses manual attendance and no browser location check is required.
- Geo optional: explains that a one-time browser location check may be used when available but is not mandatory for every action.
- Geo preferred: explains that location is preferred and policy decides what happens when it cannot be checked.
- Geo required: explains that a one-time location check is required when attendance is submitted.
- Fallback availability: where policy context shows review-required manual fallback actions, helper copy says manual fallback may submit the action for review; otherwise it says fallback is offered only when policy permits it.

## Privacy Review

- No claim was added that exact location is never stored.
- No claim was added that exact location is never collected.
- No exact-coordinate exposure was added.
- Routine employee/admin wording remains privacy-safe.
- The Attendance Privacy page remains the canonical detailed explanation.
- Manager exact-location reveal permissions and audit behavior were not changed.
- Static wording review found only the intended "does not start continuous background tracking" safety statement, CSS `tracking-*` classes, and admin map geometry internals.

## Validation

| Command | Result |
| --- | --- |
| `git status --short` before branch creation | PASS, clean |
| `git switch -c sprint-15/geo-s15-013` | PASS |
| `hrms-client`: `.\node_modules\.bin\prettier.cmd --write` on touched frontend/test files | PASS |
| `hrms-client`: `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json` | PASS |
| `hrms-client`: focused `eslint.cmd` on touched frontend/test files | PASS |
| Static wording review for `tracking`, `monitor`, `surveillance`, `live location`, `location history`, `denial evidence`, `unavailable-location evidence` | PASS, reviewed expected non-problematic hits |
| Static privacy overclaim review for exact-coordinate and "never" claims in touched production files | PASS |
| `hrms-client`: default Playwright webServer path for focused specs | BLOCKED, config webServer process failed to start |
| `hrms-client`: direct Vite plus `E2E_SKIP_WEB_SERVER=1 .\node_modules\.bin\playwright.cmd test e2e/attendance-browser-geo.spec.ts e2e/attendance-privacy.spec.ts e2e/attendance-mobile-responsive.spec.ts e2e/admin-geo.spec.ts e2e/admin-device-policy-placeholders.spec.ts --workers=1` | PASS, 34 tests |
| `hrms-client`: direct Vite plus `E2E_SKIP_WEB_SERVER=1 .\node_modules\.bin\playwright.cmd test e2e/attendance-accessibility.spec.ts --workers=1` | PASS, 6 tests |
| `hrms-client`: direct Vite plus `E2E_SKIP_WEB_SERVER=1 .\node_modules\.bin\playwright.cmd test e2e/attendance-browser-geo.spec.ts --workers=1` after final helper-copy tightening | PASS, 19 tests |

## Scope Confirmation

- Backend production changed: no
- API changed: no
- Migrations: no
- Generated contracts: no
- Dependencies: no
- Permission behavior: unchanged
- Attendance business behavior: unchanged
- Geo policy logic: unchanged
- Manual fallback business rules: unchanged
- Regularization workflow: unchanged
- Offline/provisional logic: unchanged
- Exact-location behavior: unchanged
