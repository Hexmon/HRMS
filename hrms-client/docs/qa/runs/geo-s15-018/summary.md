# GEO-S15-018 QA Summary

Date: 2026-10-08
Branch: sprint-15/geo-s15-018

## Task

- Task ID: GEO-S15-018
- Domain: QA stabilization
- Scope: Final Sprint 15 attendance QA fix support and confirmation for the manager review model stale assertion.
- Production frontend/backend business logic changes: none.

## Evidence Reviewed

- Sprint 15 release signoff material and internal/client checklist coverage.
- Tester runbook and QA timeline validation evidence.
- Frontend and backend final-regression JSON evidence.
- GEO-S15-010 through GEO-S15-017 QA artifacts and release evidence.

No confirmed production frontend release blocker remains from the inspected final-regression evidence.

## Issue Ledger

| Fix Item | QA Bug ID | Severity | Type | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| GEO-S15-018-F01 | Not supplied | High QA blocker | Stale test contract | Developer verified / Pending QA retest | Current manager review evidence output is canonical; stale assertion updated; coordinate privacy assertions preserved. |

## GEO-S15-018-F01

- Original failure: `attendance-manager-review-model.spec.ts`, test `whitelists location evidence and discards raw coordinates`.
- Root cause: the test expected an older location evidence label/detail representation after the manager review model had already standardized the geolocation summary output.
- Canonical behavior: manager review evidence keeps an `Outside` title with confidence context, preserves `Manual fallback`, and exposes the canonical `Reason code: geo_boundary_uncertain` detail line.
- Test correction: the assertion now locates the `geo-summary` evidence item and verifies the canonical title tokens, display detail, canonical reason code, existing evidence detail lines, and privacy filtering.
- Production behavior changed: no.

## Privacy Assertion Preservation

The existing coordinate-stripping assertions remain in the focused test:

- Raw latitude fragment `19.076` must not appear in the rendered manager review model.
- Raw longitude fragment `72.8777` must not appear in the rendered manager review model.
- Raw evidence key `raw_coordinates` must not appear in the rendered manager review model.

Exact-location reveal flow was not changed or retested as part of this task.

## Release Blocker Assessment

- Confirmed production blocker: none found in the reviewed final-regression evidence.
- Actionable QA blocker: stale automated assertion only, resolved by updating the expected manager review model contract.
- Browser matrix expansion, demo seed runtime validation, and UAT feedback tracking remain covered by their owning Sprint 15 artifacts rather than this task.

## Deferred / Environment Non-Defects

- Native Safari validation remains outside this Windows host and is documented under GEO-S15-017.
- Default Playwright web server limitations are harness/environment concerns, not production behavior defects.
- GEO-S15-016 attendance demo seed runtime database mutation validation remains blocked by local environment policy/errors documented in that task.
- GEO-S15-014 UAT feedback remains deferred to its owning feedback process.

## Validation Results

| Command | Result |
| --- | --- |
| `hrms-client`: `.\node_modules\.bin\playwright.cmd test attendance-manager-review-model.spec.ts --project=chromium --workers=1 --reporter=list` | PASS, 7 passed |
| `hrms-client`: `.\node_modules\.bin\eslint.cmd e2e\attendance-manager-review-model.spec.ts` | PASS |
| `hrms-client`: `.\node_modules\.bin\prettier.cmd --check e2e\attendance-manager-review-model.spec.ts` | PASS |
| `hrms-client`: `.\node_modules\.bin\prettier.cmd --check e2e\attendance-manager-review-model.spec.ts docs\qa\runs\geo-s15-018\summary.md` | PASS |
| `git diff --check` | PASS; Git reported only the existing LF-to-CRLF working-copy warning for the touched spec |
| `git status --short --untracked-files=all` | PASS; shows one modified focused test and this new QA summary |
| `git diff --stat` | PASS; tracked diff limited to the focused test assertion |

Note: `.\node_modules\.bin\playwright.cmd test e2e\attendance-manager-review-model.spec.ts --project=chromium --workers=1 --reporter=list` did not match tests under this repository's current Playwright `testDir` configuration. The focused test was rerun with the matching spec name shown above and passed.

## QA Retest Status

- Developer verification: PASS.
- External QA retest: Pending.

## Scope Confirmation

- Production frontend changed: no.
- Backend changed: no.
- APIs/contracts changed: no.
- Migrations changed: no.
- Dependencies changed: no.
- Exact-location reveal flow changed: no.
- Attendance business logic changed: no.

## Git Diff Summary

- Updated the focused manager review model test assertion for canonical geolocation evidence output.
- Added this GEO-S15-018 QA evidence summary.
