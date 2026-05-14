# Phase 1C Timesheet API Expansion QA Summary

Date: 2026-05-14
Project: HRMS-Server
Domain: Timesheets

## Scope

Expanded existing timesheet APIs in place without adding routes or increasing the public operation count. The OpenAPI contract remains at 68 implemented operations.

Covered endpoints:

- GET /api/v1/timesheets/queue/approver
- POST /api/v1/timesheets/submissions/{id}/approve

## Behavior Added

- Approver queue now returns compact project/member metadata, department/designation references, cycle context, expected/submitted/missing hours, billable/non-billable totals, project breakdown, workflow metadata, decision history, last decision, and action-required hints.
- Approver queue now supports scoped filters for status, employee_user_id, cycle_start, cycle_end, project_code, billable, page, page_size, and sort.
- Admin queue view can inspect pending/returned/rejected records using the status filter while normal approvers remain scoped to their current queue.
- Decision endpoint keeps top-level submission fields stable and adds previous_status, next_status, decision, audit_event, workflow_history, member/project/hour metadata, and allowed next-action hints.
- Return/reject remarks are trimmed and required; stale expected_version returns 409 before a workflow action is applied.
- Timesheet submit/approve/return/reject now emits transactional outbox events for backend workflow evidence.
- Fixed query parsing so billable=false remains false instead of being coerced to true.

## Manual/Integration Evidence

Targeted real-infra integration covered:

- Employee segment creation and cycle submission.
- Manager queue metadata, filters, expected hours, billable/non-billable totals, decision history, and action-required flags.
- Admin override queue visibility.
- Approve path with audit_event/workflow_history and outbox event.
- Missing remarks, unauthorized approver, return, reject, admin status view, and stale OCC 409 paths.

## Verification Commands

- pnpm lint: passed
- pnpm typecheck: passed
- npx vitest run --project integration src/modules/timesheets/__tests__/timesheets.integration.test.ts: passed
- pnpm api:docs:generate: passed, generated 68 operations
- pnpm api:docs:verify: passed
- pnpm api:consumer:verify: passed
- HRMS_ENV_FILE=.env.qa pnpm db:migrate: passed
- HRMS_ENV_FILE=.env.qa pnpm db:verify:no-cross-schema-fks: passed
- pnpm test: passed
- pnpm build: passed

## Notes

No new public timesheet endpoints were added in this phase. Planned Phase 7 timesheet enhancement APIs remain out of OpenAPI until implemented and tested.
