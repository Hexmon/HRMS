---
name: hrms-architecture-review
description: Trace Hawkaii HRMS architecture and failure modes from the current repository, then explain a bounded design decision or current-system concern. Use for cross-module, data, tenancy, worker, or infrastructure architecture analysis; not for an ordinary single-file edit or as proof of hosted behavior.
---

# HRMS Architecture Review

Read the root and nearest `AGENTS.md`, `docs/agent/evidence-policy.md`, and the applicable architecture and discovery index. Record commit, dirty worktree, environment and inspected paths. Current code, migrations, contracts, owner decisions, old ADRs and test execution are different evidence types; identify each in the output.

For a critical action, trace `UI/user → route → auth and resource ownership → service/policy → transaction and storage → outbox/worker → report/export → visible result`. Follow both successful and rejected paths. Mark an absent link `UNTRACED`; do not replace it with a presumed component. Identify the company and office on every owned record and query, including historical ownership after employment transfer. The current `company-membership-context.ts` resolves one assigned company from a session preference. The approved target is **one person at one company at a time**, with several authorized roles there and sequential transfer; do not describe simultaneous memberships as approved.

Inspect the relevant failure boundaries: concurrent requests and expected versions, API instance count and shared memory, DB transaction/rollback, idempotency and outbox identity, duplicate/reordered delivery, scheduled-job limits, Redis outage/session behavior, object-store partial writes, report/export scope, migration/backfill and restore. Select only boundaries that the feature actually crosses. Tie each failure to an affected user, persisted invariant, detection signal and recovery path. For security-sensitive paths, also use `security-review`; for business test oracles, use `qa-master-checklist` discovery guidance.

Before recommending an architecture change, state the current mechanism and concrete risk, owner-approved invariant or open question, viable alternatives, why one fits current constraints, compatibility/migration effects, rollback, and an observable acceptance check. Put proposals in discovery/backlog or a draft ADR; do not change product code or declare an ADR accepted under this skill. Use `docs/architecture/` for verified current architecture and `docs/discovery/` for investigations. If a diagram helps, derive nodes and edges from inspected source and validate labels against files before publishing it.

Report source-backed facts separately from inferences and runtime results. A passing narrow test cannot prove broad tenant isolation, recovery or production topology. This skill does not authorize deployment, hosted probes, data mutations, migrations, or external tracker writes.
