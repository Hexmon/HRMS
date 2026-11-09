---
name: implement-feature
description: Plan and implement a Hawkaii HRMS product change across backend, frontend, data, tests, and documentation. Use when a requested feature or behavioral change requires code edits; not for read-only analysis or isolated typo fixes.
---

# Implement A Feature

1. Read root and applicable nested `AGENTS.md`, then inspect the current worktree and relevant architecture, contract, migration, tests, and UI journey.
2. Identify actors, tenants, roles, invariants, state transitions, side effects, audit/event requirements, failure behavior, compatibility, and rollback impact. Separate approved intent from current implementation and inference using `docs/agent/evidence-policy.md`.
3. For a cross-module, migration, authentication, authorization, worker, or deployment change, maintain `docs/plans/<date>-<topic>.md` from `docs/plans/TEMPLATE.md`, including verification and recovery steps. Resolve material product decisions before encoding them.
4. Implement the smallest coherent vertical slice. Keep backend authorization authoritative, validate inputs, preserve tenant scope, update contracts through generators, and prevent duplicate/stale UI actions.
5. Add targeted positive, negative, tenant, role, state-transition and regression tests appropriate to the risk. Update documentation, environment examples, QA scope and rollback notes when affected.
6. Run `scripts/agent/verify-change.sh`, plus browser/human verification from `docs/agent/verification-matrix.md` for changed user journeys.
7. Inspect the final diff for unrelated changes, generated drift, secrets and missing evidence. Report exact checks, outcomes, unverified areas and follow-up decisions. Do not commit, push, deploy or update external systems unless explicitly requested.
