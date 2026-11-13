# AGENTS.md - Hawkaii HRMS Backend

This directory is the Fastify/PostgreSQL backend package inside the Hawkaii HRMS product repository. Root `AGENTS.md` applies first; this file adds backend-specific conventions.

## Architecture

- Node.js and TypeScript with Fastify.
- PostgreSQL schemas: `core`, `expenses`, `documents`, `assets`, `timesheets`, and `platform`.
- Drizzle schema plus ordered SQL migrations under `src/db`.
- Valkey for session/runtime state and backend-only S3-compatible private R2 object storage.
- Zod validation and typed route contracts.
- Vitest unit, contract, integration, and E2E projects.
- Cloudflare Queues and Cron Triggers for bounded background processing; no endless polling loop in Workers.

## Code Boundaries

- Keep business logic in services/policies/state machines, not route handlers.
- Repositories perform persistence; they do not decide authorization or workflow policy.
- Validate request data before service execution and reject protected undocumented fields.
- Do not introduce cross-schema SQL foreign keys.
- Preserve soft deletion and immutable audit history.
- Use transactions for multi-write invariants and the transactional outbox for business writes that emit events.
- Event/cron handlers must be idempotent, bounded, retry-safe, concurrency-safe, and observable. Define DLQ/replay and reconciliation behavior.
- Scope tenant-owned persistence by the authenticated company context inside the trusted backend path. Test mismatched IDs and transferred/deactivated/soft-deleted historical cases where relevant.
- Keep list endpoints bounded and paginated; use asynchronous jobs for large exports.

## Contracts And Migrations

- Planned APIs stay out of OpenAPI until route, schema, service behavior, tests, and generated docs are complete.
- Generate API documents through `pnpm api:docs:generate`; do not hand-edit generated contracts.
- Migrations are append-only after sharing. Include safe forward behavior, backfill/compatibility reasoning, and rollback or recovery notes.
- Never run production migration, seed, repair, restore, or worker activation commands without explicit authorization and the applicable runbook.

## Verification

Run targeted checks while developing. Before backend handoff, use the root verification scripts or run the relevant package commands:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contracts
pnpm test:integration
pnpm test:e2e
pnpm api:docs:verify
pnpm api:consumer:verify
pnpm db:verify:migrations
pnpm db:verify:no-cross-schema-fks
pnpm verify:cloudflare-queue-dlq
pnpm build
```

Add `verify:business`, `verify:quality`, `verify:implementation`, `verify:scalability`, and `verify:regression` when the affected area requires those repository gates. Store new backend execution evidence under `hrms_backend/docs/qa/runs/` (repository-relative) without overwriting accepted historical evidence.

## Unit Contracts And Independent QA Gate

Follow docs/agent/test-and-qa-completion.md and .agents/skills/qa-completion-gate/SKILL.md. Every added/changed executable line needs meaningful behavioral coverage, with unit inputs/preconditions and expected outputs/errors/state/forbidden side effects. Use existing domain-local .unit.test.ts, .integration.test.ts, .contract.test.ts and .e2e.test.ts conventions; test negative authorization, related IDs, branch boundaries, stale versions, concurrency, rollback, audit/outbox and dependency failures. PostgreSQL locks/constraints/RLS and Valkey/queue recovery need real isolated integration tests, not mocked SQL assertions. Run `pnpm test:unit:coverage` and the PR gate in `docs/agent/changed-coverage-gate.md`. Measure changed-line coverage against the submitted base/head and report unit versus integration coverage honestly. Run independent QA before Done and attach reproducible PR evidence; missing runner/coverage/reviewer keeps completion pending. CI runs changed TypeScript source coverage for PRs; its exclusions and independent QA remain separate. See QA-S25-003 in docs/discovery/sprint-25-saas-remediation.md.

## Per-Task Test Design And Execution

For every sprint, discuss allowed/denied/failure cases during refinement and publish their full bodies with the task under `docs/process/task-tracker.md`. Use the repository-root `.agents/skills/qa-master-checklist/references/feature-case-workflow.md` before implementing a service/route/job change. Map task and case IDs to policy partitions, allowed/denied resource relationships, transactions, audit/outbox and retry/rollback outcomes. Add and run domain-local unit tests after the slice; prove database/Redis/queue behavior at real isolated boundaries and browser outcomes where applicable. Required unexecuted/blocked cases, unmeasured changed branches or absent independent review prevent Done. Preserve concrete case/evidence links in the sprint task; no fixed case count proves completeness.
