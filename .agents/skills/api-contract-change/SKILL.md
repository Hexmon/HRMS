---
name: api-contract-change
description: Implement or review a Hawkaii HRMS API contract change across Fastify routes, schemas, services, OpenAPI, frontend adapters, and tests. Use when endpoints, payloads, errors, pagination, or generated contracts change.
---

# API Contract Change

1. Trace current route, schema, service/policy, repository, tests, generated OpenAPI, frontend adapter and consuming UI.
2. Define authentication, authorization, tenant scope, validation, error/status behavior, idempotency, pagination limits, compatibility and audit/event side effects before editing.
3. Keep planned endpoints out of OpenAPI until implementation and tests exist. Prefer backward-compatible additions; explicitly document removals or semantic changes.
4. Update backend implementation and tests, then generate contracts with `pnpm api:docs:generate`. Never hand-edit generated OpenAPI or frontend-contract output.
5. Update frontend adapters and consumers together. Handle old/new payload compatibility when deployments may overlap.
6. Run contract, OpenAPI, consumer, frontend route-coverage and production-config checks through `scripts/agent/verify-change.sh`, plus targeted positive/negative tenant and role tests.
