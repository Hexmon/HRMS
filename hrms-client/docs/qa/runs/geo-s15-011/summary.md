# GEO-S15-011 QA Summary

Date: 2026-10-07
Branch: sprint-15/geo-s15-011
Task: Manager dashboard/report filters/export parity for geo/manual evidence dimensions

## Scope

- Implemented report filters for evidence source, geo outcome, review type, and reason code.
- Added source category and review type projection fields to attendance reporting rows and exports.
- Aligned dashboard evidence segmentation with the canonical attendance reporting projection.
- Added tab-aware attendance export modes so daily, late, early, absent, exceptions, and monthly summary exports match the visible report tab.
- Preserved privacy-safe reporting labels only; no exact coordinates, latitude, or longitude are exposed by summary/report contract changes.

## Export Parity Matrix

| Visible tab | Export report_mode | Export dataset |
| --- | --- | --- |
| Daily Attendance | daily | Date/department/employee/status/evidence/source/geo/review/reason filters over daily rows |
| Late Arrivals | late | Same shared filters over legacy late-status rows |
| Early Departures | early | Same shared filters over rows with worked time below the 8-hour threshold |
| Absenteeism Report | absent | Same shared filters over absent-status rows |
| Attendance Exceptions | exceptions | Same shared filters over late or absent rows, matching the visible exceptions tab |
| Monthly Summary | monthly_summary | Same shared filters grouped by employee with monthly totals and attendance percentage |

## Defect Coverage

- D01: Reports, filters, and exports now include geo/manual/channel evidence dimensions through canonical evidence filters and export payload serialization.
- D02: Dashboard attendance evidence counts now use the same reporting projection as attendance reports, including source category counts.
- D03: Each attendance report tab passes an explicit report_mode into exports, preventing non-daily tabs from exporting the daily dataset.

## Validation

- PASS: `hrms_backend`: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit`
- PASS: `hrms-client`: `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json`
- PASS: `hrms_backend`: `.\node_modules\.bin\vitest.cmd run --project unit src/modules/reports/__tests__/attendance-reporting-evidence.unit.test.ts src/modules/attendance/__tests__/attendance-service.unit.test.ts src/modules/dashboard/__tests__/dashboard.unit.test.ts` (96 tests)
- PASS: `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts/api-docs-generate.ts` (outside sandbox due local Node passwd ENOMEM in sandbox)
- PASS: `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts/api-frontend-contract-generate.ts` (outside sandbox due local Node passwd ENOMEM in sandbox)
- PASS: `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts/api-docs-verify.ts` (outside sandbox due local Node passwd ENOMEM in sandbox)
- PASS: `hrms-client`: `node scripts\api-implemented-route-guard.mjs`
- PASS: `hrms-client`: `node scripts\frontend-contract-route-coverage.mjs`
- PASS: `hrms-client`: direct Vite plus `E2E_SKIP_WEB_SERVER=1 .\node_modules\.bin\playwright.cmd test e2e/dashboard-attendance-evidence.spec.ts e2e/attendance-accessibility.spec.ts --workers=1` (7 tests)
- PASS: `git diff --check`

## Notes

- The default Playwright webServer command uses `pnpm exec vite dev`; on this machine pnpm attempted an install/status check and failed with `ERR_PNPM_IGNORED_BUILDS` for `esbuild@0.27.7`. The focused browser validation used the project-local `vite.cmd` binary directly.
- The full backend contracts suite was attempted, but the configured Postgres dependency was not available at `127.0.0.1:55432`, producing `ECONNREFUSED`. Generated docs verification and frontend API route guards passed.
