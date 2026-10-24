# Performance, Reliability, SRE, Recovery and Operations Planning

## Start with user outcomes
For each critical persona and journey, identify success/failure from the user's viewpoint: correct completion, eventual processing, data visibility, inability to double charge or duplicate irreversible actions, bounded wait and recovery. Map to possible SLIs: eligible successful completed transactions / attempted transactions, workflow completion latency, event-to-visible delay, error rate, authorization denials and reconciliation lag. Do not substitute raw CPU or pod uptime for end-user availability.

## NFR evidence and governance
Capture `SLO/SLA/SLI owner | approved target | measurement window | traffic mix | dataset size | percentiles | tolerance for incomplete work | error budget | approval source | effective release`. If unknown, record `TBD (BQ...)` rather than inventing numeric load, availability, p95/p99, RPO or RTO. If an older runbook says one value and product uses another, surface a decision conflict.

## Plan table by scenario
`Scenario ID | journey/dependency | normal/peak/burst/soak/stress/recovery | user model | arrival rate & distribution (approved/TBD) | concurrency | data volume | think time | workload steps & ratio | duration/ramp | environment fidelity | measured p50/p95/p99 | business-success SLI | relevant resource measures | threshold source | safe abort condition | evidence to collect | recovery oracle`.

Include stateful characteristics: saturated connections, hot tenants, heavily contended records, high-cardinality filters, large exports, unbounded queues, cold cache, long-lived sessions, schedule overlap, spike during failover, last-day-of-period batch processing. Distinguish planned stress from approved production capacity expectations.

Reconcile the workload with `ARU-08`, `ARU-10`, `ARU-11`, `ARU-13`, `ARU-15`, `ARU-16` and `ARU-17`: distributed rate-limit behavior, excessive pagination/export requests, contested workflow records, retries after browser/network ambiguity, constrained clients, production-sized normal/peak/burst/stress/soak/recovery, and actual hosted-provider quotas/failure controls. Security abuse load and legitimate capacity load may use different models and authorization; do not conflate them.

## Reliability drill planning (no execution)
For each real dependency: normal operation -> degraded/slow -> unavailable -> retry/recover -> reconcile -> final user state. Select failure type by topology: app restart, DB primary switch, cache restart, queue pause, worker crash after commit, object-store outage, partial network partition, proxy TLS handshake problem, external provider timeout, botched deployment, expired cert, disk full, clock drift, backup/key failure. Capture blast radius, tenant impact, safety conditions, observability and operator response.

## Backup and DR
A completed backup is not a restore proof. Plan restore to isolated environment with consistency checks across DB, event logs, object storage, cache-derived projections, secrets/key material, system identity and scheduled task state. Measure approved RPO/RTO and business recovery correctness. After restore, detect duplicate processed events, missing records, stuck workflows and misaligned data-store snapshots. Obtain specialist approval before fault injection.

## SRE and operational metrics
Use traces/metrics/logs with cross-service request IDs and low-cardinality labels; avoid logging PII or high-cardinality unbounded values. Check error taxonomy, alerts, readiness/liveness meaning, queue lag, DLQ processing, transaction settlement, reconciliation metrics and runbooks. Distinguish business-critical alerts from noisy implementation metrics.

## Sources
Google SRE Workbook, Implementing SLOs: https://sre.google/workbook/implementing-slos/
Google Well-Architected Reliability: https://docs.cloud.google.com/architecture/framework/reliability
Google Restore/Recovery test guidance: https://docs.cloud.google.com/architecture/framework/reliability/perform-testing-for-recovery-from-data-loss
OpenTelemetry conventions (version/date sensitive): https://opentelemetry.io/docs/specs/semconv/

These sources inform the **questions and test designs**; they do not supply project-specific numeric acceptance targets.
