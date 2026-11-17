# Architecture and Failure Model — <Project> @ <SHA>

**Validated deployment shape:** <units, environment, data owners, runtime boundaries, unknowns>
**Engineering rationale:** <confirmed by whom, date; else TBD>

## Critical dependency graph
`persona/channel -> identity -> ingress -> service/monolith module -> DB/cache/event bus -> worker/provider -> report/user view`

## Fault scenario — FM-001
- Trigger/dependency: <actual node/edge>
- Scope and source: <repo/diagram evidence>
- Failure/crash window: <before/after commit/side effect/ack>
- User-visible symptom and blast radius: <persona, tenants>
- Invariant and intended behavior: <approved source/TBD>
- Recovery and reconciliation: <expected state, duplicate handling, rollback>
- Test approach: <nonproduction simulator/test double/isolated environment; no automatic execution>
- Measurement and safety stop: <logs/traces/metrics/timeout/abort, approved/TBD>
- Related risk/BR/TC/BQ: <...>
