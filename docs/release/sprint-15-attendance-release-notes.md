# Sprint 15 Attendance Release Notes

## Release Summary

Sprint 15 completes the web-first attendance release package for employee punching, one-time browser geo checks, manager review, reporting/export evidence segmentation, privacy controls, accessibility polish, and release/demo readiness.

This release note is scoped to Sprint 15 attendance work. It does not claim completion of GEO-S15-014 stakeholder/UAT fixes because no authoritative UAT feedback packet was available for that task.

## GEO-S15-016 Release Gap Traceability

| Gap               | Release artifact                                   |
| ----------------- | -------------------------------------------------- |
| `GEO-S15-016-R01` | Sprint 15 attendance release notes                 |
| `GEO-S15-016-R02` | Live demo walkthrough                              |
| `GEO-S15-016-R03` | Persistent synthetic attendance demo seed          |
| `GEO-S15-016-R04` | Demo coordinate/site sanitization                  |
| `GEO-S15-016-R05` | Consolidated Sprint 15 QA/release evidence mapping |

The internal release checklist is a required release artifact, but it is not a replacement Rxx item.

## Highlights

- Employee attendance now supports the release demo path for manual web attendance, browser geo attendance, and policy-controlled manual fallback.
- Manager review can demonstrate geo fallback review and regularization queues after the synthetic seed runs successfully in an approved non-production database.
- Attendance reports expose evidence categories, source categories, review state, work-site labels, and export columns for QA/release validation.
- Accessibility polish from GEO-S15-015 improves contrast for attendance statuses and result panels.
- GEO-S15-016 adds release notes, a live walkthrough, a guarded attendance demo seed, demo sanitization notes, and consolidated QA evidence mapping.

## Employee Attendance

- Primary route: `/attendance`
- Supporting routes: `/attendance/calendar` and `/attendance/privacy`
- Demo personas: `E1` for manual/fallback scenarios and `E2` for geo/reporting/regularization scenarios.
- The demo seed inserts a deterministic rolling four-day window ending on the seed execution date in `Asia/Kolkata` so presenters can show current records without relying on today's browser/device state.

## Geo and Manual Fallback

- Primary admin route: `/admin-settings/geo`
- Policy route: `/admin-settings/policies`
- The release supports one-time browser location checks for attendance. It does not add background location tracking.
- Manual fallback remains policy-controlled and reviewable. Routine queues and reports show safe evidence summaries, not exact coordinates.
- Exact-location reveal remains separately permissioned, confirmation-gated, and audited.

## Browser Compatibility

- GEO-S15-017 adds focused browser compatibility verification for Sprint 15 attendance flows without changing production attendance behavior.
- Verified browser targets are the current Playwright Chromium runtime, the installed Chrome channel, the installed Edge channel, and Playwright WebKit.
- Safari-compatible engine coverage was verified with Playwright WebKit. Native Safari permission prompts, iOS/macOS OS-level location authorization, and device-specific Safari browser chrome behavior were not directly validated in this Windows environment.
- Compatibility checks cover manual-only attendance, synthetic geo success, permission-denied fallback, unsupported geolocation, narrow responsive attendance, date/time regularization controls, and manager sheet/dialog smoke.
- Browser geolocation still requires a secure browser context; localhost may work as a development exception. The compatibility tests validate application behavior for standard API outcomes, not native operating-system permission UI.

## Manager Review

- Primary route: `/attendance/approvals`
- The demo seed is designed to create a pending synthetic geo fallback review assigned to `D1`.
- The seed is also designed to create a pending regularization request for `E2`, so the manager queue can show both review types after seed execution succeeds.
- Recommended demo action is to inspect or return a review item. Avoid approving/rejecting the seeded fallback if the presenter wants to preserve the queue for another run; rerunning the seed on the same seed date resets the current generated demo review rows.

## Reporting and Exports

- Primary route: `/reports/attendance`
- Use the `date_range` printed by `pnpm release:seed:attendance-demo`.
- Demo rows cover manual web attendance, web geo attendance, manual fallback review, and pending correction segmentation.
- Export-ready fields include evidence category, attendance channels, source categories, work-site label/type, geo outcome/action, review type, reason codes, and review outcome.

## Privacy and Security

- Demo data is synthetic and tagged as `GEO-S15-016`.
- No seeded passwords, bearer tokens, production credentials, personal documents, or real employee coordinates are documented here.
- The seed script refuses production-marked environments and refuses remote database hosts unless `S15_ATTENDANCE_DEMO_SEED_ALLOW_REMOTE=true` is explicitly set for an approved non-production target.
- The demo work site and geofence are explicitly labeled as synthetic Sprint 15 demo data.
- Exact-coordinate values exist only inside the synthetic seed script/database fixture so exact-location permission and audit controls can be exercised. They are not printed in this release note or walkthrough.

## Accessibility and Responsive Experience

- GEO-S15-015 improved text contrast for attendance result panels, report badges, and monthly attendance percentages.
- Keyboard/focus behavior for permission-denied fallback and manager review actions remains part of the Sprint 15 regression evidence.
- Responsive attendance/report views are mobile-web ready. This does not claim a shipped native mobile application.

## Mobile Readiness

- Mobile API handoff remains backend/API readiness, not native app delivery.
- Mobile attendance requires registered-device semantics where applicable.
- Offline sync remains provisional until verified and must not be treated as payroll-final before server reconciliation.
- `client_event_id`/idempotency behavior remains the contract for mobile retry safety.

## QA Evidence

- GEO-S15-010 through GEO-S15-015 summaries remain under `hrms-client/docs/qa/runs/`.
- GEO-S15-016 evidence is recorded in `hrms-client/docs/qa/runs/geo-s15-016/summary.md`.
- GEO-S15-017 browser compatibility evidence is recorded in `hrms-client/docs/qa/runs/geo-s15-017/summary.md`.
- The release demo seed command is `pnpm release:seed:attendance-demo` from `hrms_backend`.
- Local GEO-S15-016 validation confirms seed implementation/static checks only; seed execution/database mutation validation is blocked by local runtime/package-manager issues and is not claimed as passed.

## Known Limitations

- GEO-S15-014 remains documentation-only until stakeholder/UAT feedback is available.
- Native mobile application delivery is not part of this release.
- Real macOS/iOS Safari validation remains a separate manual/UAT activity if native Safari certification is required.
- Exact-location reveal depends on role/permission configuration and may show restricted/unavailable states for manager personas without that permission.
- Hosted environment seeding requires explicit approval for a non-production remote database target.

## Configuration / Migration Impact

- New database migrations: none.
- New runtime dependencies: none.
- New API contracts: none.
- New optional seed command: `hrms_backend` package script `release:seed:attendance-demo`.

## Rollback Notes

- Production frontend/backend behavior is not changed by GEO-S15-016.
- To remove seeded demo rows from a non-production database, delete rows tagged with `demo_seed = GEO-S15-016` from attendance demo fixture tables, or refresh the local/QA database from the approved reset process.
- If release notes or walkthrough content needs correction, update the Markdown docs and regenerate QA evidence without touching application code.
