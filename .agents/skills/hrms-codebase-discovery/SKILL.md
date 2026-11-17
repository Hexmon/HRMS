---
name: hrms-codebase-discovery
description: Map Hawkaii HRMS implementation and trace product behavior across frontend, Fastify, storage, workers, contracts, and tests. Use for repository onboarding or broad source-backed discovery; not for a narrow bug fix or as proof of runtime behavior.
---

# HRMS Codebase Discovery

Use the root and nearest package `AGENTS.md`, `docs/README.md`, and `docs/agent/evidence-policy.md` first. Record the inspected Git revision and dirty worktree state. Preserve existing documentation and user files.

1. Locate package manifests, entry points, module registration, route trees, schema/migrations, infrastructure adapters, CI, tests, and documentation. Use `rg` and bounded file reads. Separate a document's stated intent from code that implements it.
2. For each domain, record its responsibility, entry points, dependencies, persisted ownership, side effects, tests, and discovery depth. Mark unknowns and contradictory documentation explicitly. Do not infer a business rule from a module name or an API shape.
3. Trace critical actions using `user → UI state → API → auth/tenant policy → service → transaction/storage → event/worker → read model → visible result`. Cite files and symbols for each observed link; mark missing links `UNTRACED`.
4. For current tenancy, inspect `src/platform/company-membership-context.ts`, auth/session preference, domain ownership columns, and query filters. Keep the approved target distinct: one person belongs to one company at a time, may hold several authorized roles there, and later transfers through separate employer logins. Earlier simultaneous-membership direction was superseded. Do not present current session preference as durable employment history.
5. Use `docs/discovery/implementation-map.md` for the repository-wide map and append focused traces or conflict records as needed. Update canonical architecture guidance only after a trace is verified; avoid copying old counts or hosted status.
6. Validate every cited path, distinguish static evidence from local runtime evidence, and list the next owner questions and test seams. A green static check does not prove a user journey.

For product rule discovery or test-oracle generation, also use `qa-master-checklist` in its applicable mode. For an architecture decision, record current behavior and alternatives before drafting an ADR. This skill does not authorize product code edits, external writes, or production probes.
