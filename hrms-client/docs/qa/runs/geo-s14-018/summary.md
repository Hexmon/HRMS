# GEO-S14-018 Accessibility and Responsive Fixes

## Scope

GEO-S14-018 is a frontend-only release-quality accessibility and responsive fix pass for existing attendance flows. It addresses identified keyboard, focus, labeling, status-announcement, and small-screen issues.

This is not a full WCAG certification, global design audit, or application-wide accessibility redesign.

## Audited Attendance Surfaces

- Manual and geo attendance action flow.
- Geo permission-denied manual fallback.
- Employee regularization form.
- Employee calendar and self evidence.
- Manager review queue.
- Exact-location reveal workflow.
- Attendance reports and report filters.
- Privacy/navigation behavior touched by attendance regression coverage.

## Issues Fixed

| ID | Surface | Issue | Severity | Fix |
| --- | --- | --- | --- | --- |
| GEO-S14-018-A11Y-01 | Manager review | Approve, Return, and Reject buttons had repeated generic accessible names. | P1 | Added contextual `aria-label` values using employee name and work date only. |
| GEO-S14-018-A11Y-02 | Manager review | Focus could fall away after successful decisions closed UI and removed rows. | P1 | Added queue-level completion state and focus restoration to the stable queue heading on successful decisions. |
| GEO-S14-018-A11Y-03 | Exact location | Newly revealed coordinates lacked a stable announcement/label. | P1 | Wrapped revealed result in a labeled polite `role="status"` region headed `Exact location revealed`. |
| GEO-S14-018-A11Y-04 | Regularization | Validation errors were summary-only and not associated with invalid controls. | P1 | Added field error IDs, `aria-invalid`, `aria-describedby`, visible field errors, and first-invalid focus. |
| GEO-S14-018-A11Y-05 | Attendance reports | Visible report filters were not programmatically associated with controls. | P1 | Added generated IDs, `htmlFor`, and `aria-labelledby` for date and select filters. |
| GEO-S14-018-A11Y-06 | Shared table/search | Search and row-action controls needed optional contextual accessible names. | P2 | Added backward-compatible `searchLabel` and `rowActionLabel` props with defaults preserving current behavior. |

## Keyboard Improvements

- Employee geo fallback path is covered by keyboard activation of `Clock in` and `Continue manually`.
- Manager queue rows remain keyboard-openable through the existing row interaction.
- Manager decision dialog is reached by keyboard and the successful decision path restores focus to the queue heading.
- Existing focus-visible styles were preserved.

## Focus Improvements

- Successful manager decisions now set a queue-level completion message and focus the `Manager review queue` heading with `tabIndex={-1}` on the next render frame.
- Failed manager decision mutations do not request queue focus restoration.
- Regularization submit failures focus the first invalid rendered field in logical form order.

## Accessible Names / Labels

- Manager decision buttons now include employee name and work date in accessible names while preserving visible text: `Approve`, `Return`, `Reject`.
- Manager review row action triggers can be named with row context through the new optional `DataTable` prop.
- Attendance report filters expose labels for `From`, `To`, `Department`, `Employee`, `Status`, `Evidence state`, and `Team`.
- Attendance report search exposes `Search attendance records`.

## Status / Live Region Improvements

- Manager decisions announce completion in a queue-level polite status region.
- Exact-location reveal results are announced through a labeled polite status region.
- Existing geo permission/fallback alert and status behavior remains intact.

## Regularization Validation

- Invalid date, reason, existing punch, and requested time controls use field-level `aria-invalid`.
- Field errors have stable IDs and are referenced from `aria-describedby`.
- Existing summary `role="alert"` is preserved.
- Required state remains native or programmatic according to the control type.

## Geo Permission Errors

Existing permission-denied and fallback behavior was preserved:

- Browser geolocation remains one-shot and action-triggered.
- No background `watchPosition` behavior was introduced.
- Permission-denied fallback remains textually discoverable and keyboard reachable.
- Fallback submission still uses the backend-provided fallback reference and does not include coordinates.

## Manager Review Accessibility

- Row action accessible name includes the review context.
- Decision accessible names include action, employee name, and work date.
- Completion announcement uses employee name, work date, and decision result.
- Queue focus restoration runs only after a successful mutation path.

## Exact-Location Regression

- Exact-location authorization, endpoint usage, audit semantics, and restricted/unavailable states were not changed.
- Revealed coordinates are still available only through the authorized manager reveal workflow.
- Restricted and unavailable states remain readable text, not disabled fake actions.

## Responsive Verification

| Viewport | Coverage | Result |
| --- | --- | --- |
| `320 x 568` | New attendance report label/search check and existing narrow attendance/mobile fallback coverage. | PASS |
| `390 x 844` | Existing employee fallback, regularization, manager sheet, exact-location dialog, reports, and calendar coverage. | PASS |

No document-level horizontal overflow was introduced in the serial mocked attendance matrix.

## Contrast / Color

No high-confidence attendance-specific contrast defect required production changes. Global color tokens and status color architecture were not changed. No WCAG conformance claim is made.

## Automated Tests

- Added `hrms-client/e2e/attendance-accessibility.spec.ts`.
- Updated existing manager-review assertions to use contextual accessible names:
  - `hrms-client/e2e/attendance-regression.spec.ts`
  - `hrms-client/e2e/attendance-manager-review.spec.ts`

## Manual Keyboard Checks

Playwright-assisted keyboard checks were performed through the new accessibility spec:

- Employee `Clock in` receives focus and activates with Enter.
- Permission-denied fallback button is reached with Tab and activates with Enter.
- Regularization invalid submit moves focus to the invalid existing-punch control.
- Manager review row opens from keyboard focus.
- Manager decision completion restores focus to the queue heading.

Physical screen-reader testing was not performed.

## Validation Results

| Command / Method | Result | Notes |
| --- | --- | --- |
| `pnpm exec prettier --write ...` | BLOCKED | `ERR_PNPM_IGNORED_BUILDS esbuild@0.27.7` before Prettier ran. |
| `node_modules/.bin/prettier.cmd --write ...` | PASS | Touched source/test files formatted. |
| `pnpm typecheck` | BLOCKED | Same pnpm ignored-build-script gate before typecheck ran. |
| `pnpm lint` | BLOCKED | Same pnpm ignored-build-script gate before lint ran. |
| `pnpm build` | BLOCKED | Same pnpm ignored-build-script gate before build ran. |
| `node_modules/.bin/tsc.cmd --noEmit --project tsconfig.json` | PASS | Frontend typecheck completed. |
| `node_modules/.bin/eslint.cmd ...` focused touched files | PASS | Touched production and E2E files lint clean. |
| `node_modules/.bin/vite.cmd build` | PASS | Production build completed. |
| `node_modules/.bin/playwright.cmd test attendance-accessibility.spec.ts --workers=1` | PASS | 5/5 accessibility tests passed. |
| `node_modules/.bin/playwright.cmd test attendance-accessibility.spec.ts attendance-browser-geo.spec.ts attendance-manager-exact-location.spec.ts attendance-regression.spec.ts attendance-mobile-responsive.spec.ts --workers=1` | PASS | 43/43 mocked attendance tests passed. |
| `node_modules/.bin/playwright.cmd test attendance-manager-review.spec.ts attendance-regression.spec.ts -g "manager reviews" --workers=1` | BLOCKED / PARTIAL | Mocked regression manager review passed; backend-backed browser spec blocked by `ECONNREFUSED 127.0.0.1:3001`. |
| `git diff --check` | PASS | Only line-ending normalization warnings were reported. |

## Known Limitations / Deferred

- Full WCAG certification is out of scope.
- `axe-core` or other new accessibility dependencies were not added.
- Global contrast and design-system audits are out of scope.
- Broad `ModuleTabs` navigation-semantics cleanup is deferred because the shared component currently uses navigation links and is shared beyond Attendance.
- The backend-backed browser manager review spec requires an API server at `127.0.0.1:3001`; that server was unavailable in this local validation run.

## Backend / API / Migration Impact

```text
Backend: None
API/OpenAPI: None
Migration: None
New dependency: None
```

## Business Behavior Preservation

- Attendance punch payloads and idempotency behavior unchanged.
- Geo policy selection and fallback semantics unchanged.
- Manual fallback submission unchanged.
- Regularization validation rules unchanged.
- Manager review mutation semantics unchanged.
- Exact-location authorization and reveal endpoint unchanged.
- Reporting data and export behavior unchanged.
