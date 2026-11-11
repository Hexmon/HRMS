# Change Verification Matrix

Use `scripts/agent/verify-change.sh` for local change-aware checks and `scripts/agent/verify-full.sh` for the repository-wide gate. Add targeted tests for the behavior being changed; these commands are a floor, not complete proof.

| Change type | Minimum evidence |
| --- | --- |
| Backend service or policy | Lint, typecheck, focused unit/integration tests, affected business invariants, tenant/role denial cases. |
| Backend route or schema | Backend checks, contract tests, OpenAPI verification, consumer verification, negative validation and authorization cases. |
| Authentication or RBAC | Session lifecycle, role change/removal, account deactivation, cross-tenant denial, stale-token behavior, rate-limit and audit evidence. |
| Database schema or migration | Migration-history and schema-drift checks, no-cross-schema-FK check, forward migration on an isolated DB, rollback/backfill plan, representative query/index review. |
| Events, worker, cron or queue | Idempotency, duplicate/reordered delivery, bounded retry, DLQ/replay, outbox reconciliation, overlapping-run protection and recovery evidence. |
| Frontend component or route | Lint, typecheck, production build, meaningful unit/component input/render/state assertions, loading/empty/error states, relevant Playwright journey, keyboard/mobile impact. |
| Frontend API adapter | Frontend checks, unit tests for response/error/abort/stale mapping, implemented-route guard, route coverage, contract compatibility, stale/double-submit/error behavior. |
| File upload/export | MIME/content validation, size limits, authorization, storage failure, malicious filename/content, CSV formula injection, download access and audit. |
| Deployment/configuration | Example/config docs, production guard, dry run, secret/environment separation, health/smoke plan and rollback. |
| Documentation/agent workflow | Link/path accuracy, command dry run, skill validation, shell syntax, workflow syntax and `git diff --check`. |

## Human UI Verification

For affected user-facing workflows, validate through the running application using representative Employee, Manager/Reviewer, HR, Finance, Auditor, Asset Manager, Helpdesk and Admin roles as applicable. Include stale-tab, refresh, back-button, double-click, slow/disconnected network, mobile viewport and accessibility behavior based on risk.

## Release Gate

Before release, run the full automated gate, targeted browser journeys, environment smoke tests, migration/rollback review, tenant and privilege regression, worker recovery checks where relevant, and human UAT. Record anything not executed as `Not run` or `Blocked`; do not imply release readiness from static inspection alone.

## Mandatory Completion Evidence

The matrix selects execution layers; [test and QA completion](test-and-qa-completion.md) defines the Done gate. Every executable change requires meaningful unit input/output contracts, full changed executable line coverage, all changed business/security decision branches and separate independent QA evidence. Report unit and actual integration/component/browser coverage separately. The verification scripts do not currently implement that coverage/diff gate; QA-S25-003 in [Sprint 25](../discovery/sprint-25-saas-remediation.md) owns the tooling prerequisite. Required missing tooling or independent review blocks a Done claim, while documentation-only changes use N/A executable coverage with reference/workflow verification.
