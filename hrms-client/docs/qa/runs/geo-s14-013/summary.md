# GEO-S14-013 QA Summary

Date: 2026-10-06

## Scope

- Implemented offline/provisional attendance evidence display for employee daily self-evidence and manager selected employee/day daily reads.
- Kept monthly calendar, offline sync writes, payroll state, and manager decision workflows unchanged.
- Limited the read model to durable `attendance.attendance_events` rows linked from `attendance.offline_event_inbox` with `accepted` or `deferred` sync status.

## Backend

- Added safe offline evidence metadata to daily self-evidence events and selected employee/day daily items.
- Exposed `sync_status`, `verification_status`, safe `reason_code`, safe `reason`, and `server_received_at`.
- Kept client event IDs, registered device IDs, installation hashes, raw payloads, exact coordinates, `processed_at`, and `payroll_eligible` out of read responses.
- Added OpenAPI schemas and examples for offline evidence, including `Mobile - captured offline`.

## Frontend

- Added employee calendar evidence badges driven by offline `verification_status`, with secondary sync state and server receipt time.
- Added manager report drill-in by row selection using the existing daily calendar query with `date`, `user_id`, `page=1`, and `page_size=1`.
- Added fixed payroll copy: `This offline evidence is not payroll-final.`
- Preserved internal `employee_user_id` only for API drill-in wiring; it is not displayed.

## Validation

- Passed: `hrms_backend`: `./node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`
- Passed: `hrms-client`: `./node_modules/.bin/tsc.cmd --noEmit --project tsconfig.json`
- Passed: OpenAPI generation and `scripts/api-docs-verify.ts`
- Passed: frontend contract generation and `scripts/api-consumer-verify.ts`
- Passed: `hrms-client` focused ESLint on touched files
- Passed: `hrms-client` focused Playwright: `attendance-employee-day-evidence-model.spec.ts` and `attendance-mobile-responsive.spec.ts` (8 tests)

## Blocked Checks

- Backend Vitest contract and offline-sync integration suites could not reach Postgres at `127.0.0.1:55432`.
- Attempted to start the repo test stack, but `docker` is not installed on this host.
- Backend lint also reports pre-existing unrelated issues in docs, scripts, migrations, and existing attendance/report files.
