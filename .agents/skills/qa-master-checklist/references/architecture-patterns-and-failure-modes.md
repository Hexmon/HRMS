# Architecture-Adaptive Failure and Recovery Models

## Apply by evidence, not by buzzword
A monorepo is not automatically a monolith; multiple containers are not automatically microservices. Classify by independently deployed unit, data ownership, runtime boundary, network calls, asynchronous flows, failover behavior and version compatibility. A modular monolith can still publish events. Architectures may mix patterns.

| Observed shape | Failure mechanism to examine | Product-level acceptance dimension | Relevant questions |
|---|---|---|---|
| Single-process monolith / single VM | process crash, DB pool saturation, whole-app downtime, single scheduler lock, migration rollback | no partial business commits, safe restart, recovery time | backups, alternative service, restart semantics, tenant blast radius? |
| Modular monolith with shared DB | two modules bypassing shared domain policy, competing updates, migration coupling | atomic cross-module invariant | source of truth, module ownership, lock order? |
| Multi-tier UI/API/DB | proxy misrouting, timeouts, TLS/cert mismatch, sticky session loss, server/client version drift | user understands failure, request not silently applied twice | ingress routes, gateway, session storage? |
| Microservices / service-owned DBs | saga compensation fails, partial write, ambiguous response, duplicate/out-of-order delivery, event/schema skew | eventual convergence (approved bounds), no repeated irreversibles | durable outbox/inbox? event schema/version and replay? |
| Shared database across services | hidden coupling, cross-service transaction contention, inconsistent ownership of columns | business invariant and migration compatibility | which service may write what? |
| Event/streaming pipeline | duplicate, delayed or missing message, consumer crash between side effect and ack, replay from DLQ | idempotent outcome, audit and reconciliation | ordering guarantee, dedup key scope, replay policy? |
| CQRS / projections / caches | stale UI/report/export, read-after-write mismatch, invalidation failure, refresh backlog | approved staleness / convergence semantics | how are projections rebuilt? |
| Multi-tenant SaaS | cache key collision, missing scope in query/report/export/job, admin elevation leaks | strict tenant/user isolation, data provenance | tenant hierarchy, support impersonation, multi-region? |
| Edge/mobile/offline sync | device clock skew, queued writes, repeated sync, conflicting edits, token expiry while offline | no silent loss, defined conflict authority, privacy | last-write-wins? revision tokens? conflict user messaging? |
| Air-gapped/on-prem | failed local upgrades, disconnected license/identity, local disk full, hardware replacement, no public email/DNS | core functions available offline, safe backup/cold restore | update chain of custody, time source, support response? |
| Kubernetes/cloud/serverless | autoscale race, cold-start, pod eviction, region/zone loss, ephemeral disk, throttling | latency/error budget, no duplicate job on redeploy | single vs multi-zone, real failover readiness? |
| IoT/device-control/OT | delayed commands, duplicate device actuation, stale telemetry, firmware skew, physical safety interlock | safe physical state, provenance and human override | test in simulator; formal safety approval? |
| Third-party pay/identity/email/AI | request accepted but callback lost, provider timeout, rate/credit exhaustion, external downtime | status reconciliation and user communication | authoritative side effect, refund/retry policy? |

## Boundary and failure graph
For each critical journey create nodes = actor/channel, ingress, identity, service, data owner, cache, broker, worker, third party, output/alert. Edges = sync call/event/batch/file, auth boundary and state transition; annotate timeout, retry, consistency, idempotency, deploy version, availability and privacy class. Record chain: `failure injection planned -> observable symptom -> invariant threatened -> recovery/compensation -> telemetry -> safe test prerequisite -> approved acceptance or TBD`.

Annotate the graph with applicable `ARU-01`–`ARU-19` surfaces from `adversarial-and-real-user-assurance.md`: tenant/object identifiers, role and session invalidation points, authentication/recovery endpoints, file/parser boundaries, export/rendering sinks, rate/resource controls, concurrent/offline inputs, browser/network transitions, public/tokenized resources and hosted-provider control planes. Record where enforcement is authoritative and where state is cached or eventually refreshed. Independent penetration assessment and human UAT are external assurance activities, not architecture components or inferred pass evidence.

## Partition the lifecycle into crash points
- Before validation / after authorization / before transaction commit.
- After DB commit but before event publish, after publish but before acknowledgement.
- After external side effect but before local success is recorded.
- Before/after idempotency key persisted; after client timeout; after worker retry.
- During migration and backfill with mixed-version service fleet.
- During restore where independent stores are restored to *different* points in time.

Ask about physical/financial irreversibility before proposing replay/compensation. A cross-service workflow that does not claim atomic global transactions must not be tested against an invented instantaneous-consistency oracle.

## Safe fault scenarios
Design but **do not execute** network partitions, process crashes, deliberate slowdowns, role revocation, queue pause, read-model lag, storage-full events and dependency errors. Identify isolated/synthetic test environment, test doubles, observability and emergency stop. Never plan production disruption as a default acceptance method; specialized operators approve any potentially destructive execution separately.

Production-sized stress/soak/recovery (`ARU-16`) and hosted control-plane testing (`ARU-17`) require an owner-approved model, isolated or explicitly authorized target, safe abort condition and recovery proof. An independent penetration test (`ARU-18`) requires separate rules of engagement; repository review cannot substitute for it.

## References and design patterns
Microsoft Azure Architecture Center Saga pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
Microsoft transactional outbox: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
Google Well-Architected reliability: https://docs.cloud.google.com/architecture/framework/reliability
These are **design pattern guidance**, not proof the target system implements the patterns.
