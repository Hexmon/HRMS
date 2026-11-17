# Backend Resource Scenarios (Planning Estimates)

Source baseline: `6a8d11f7` on 2026-11-09. These are **inferences for sizing and test design**, not measured production usage or pricing. The current API loads database domains into process-local arrays on startup (`src/platform/postgres-data-store.ts:reload`) and many list/report services filter and sort those arrays before slicing a page. `src/app.ts:onSend` flushes whole domains for mutations. The Cloudflare entry creates a `pg.Pool` with `max: 2` per invocation and uses 50-row outbox, 25-session attendance and 500-row purge job batches (`src/workers/cloudflare-worker.ts`, `cloudflare-jobs.ts`). API pool construction sets no explicit `max` (`postgres-data-store.ts`); the installed library default and actual concurrent connection ceiling must be measured before capacity claims.

## Assumptions and formulas

| Driver | Illustrative assumption | Formula and use |
| --- | --- | --- |
| Attendance history | 250 worked days and two punch events per employee per year, plus one daily record for each of 365 days; two years retained in the hot store. | `(250 × 2 + 365) × 2 = 1,730` attendance rows per employee, excluding breaks, location evidence, offline events, audit, shifts and indexes. |
| Hydrated JS object cost | 0.5–2 KiB per row **assumed**, not benchmarked. | `employees × 1,730 × assumed bytes × API replicas`. This estimates only those two row families; full process memory is higher. |
| Outbox work | Event generation is unknown; use 5 or 20 events per employee per day as scenarios. | `employees × events per employee ÷ 1,440` average arrivals/minute; compare with 50 per outbox job, noting follow-up jobs, bursts, retries and queue concurrency. |
| DB connections | `R` API replicas plus `C` simultaneous Worker invocations. | `R × measured API pool max + C × 2 + migration/admin headroom`; Hyperdrive/Neon limits and actual pool behavior are unknown. |
| Uploaded proofs | Four initial proofs per employee, 2 MiB average **assumed**, plus replacements. | `employees × 8 MiB` base object bytes; versions, backups, access logs and retention add usage. |

| Scenario | Employees | Two-year attendance rows from formula | Illustrative process memory for those rows, per API instance | 5 / 20 outbox events per employee/day |
| --- | ---: | ---: | ---: | ---: |
| Small | 100 | 173,000 | 84–338 MiB | 500 / 2,000 per day |
| Medium | 1,000 | 1,730,000 | 845 MiB–3.30 GiB | 5,000 / 20,000 per day |
| Larger planning case | 10,000 | 17,300,000 | 8.25–33.0 GiB | 50,000 / 200,000 per day |

The memory formula is intentionally a stress signal: actual hydrated size, retention, array duplication during reload, GC overhead and domain mix must be measured with synthetic data. More API replicas multiply duplicated memory and may make whole-domain stale flushes more frequent. SQL row size, index amplification, WAL, vacuum, backups, I/O and object-store billing cannot be inferred from this table. A 50-row outbox job is a bounded unit, not a proven sustained throughput limit because full batches enqueue follow-up jobs.

## Measurement gate before architecture rollout

1. With disposable PostgreSQL/Valkey, measure startup/reload RSS and heap at 100, 1,000 and 10,000 synthetic employees with realistic records; record p50/p95 startup and per-route latency.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` on company-scoped lists, historical attendance/payroll, outbox lag and export reads after target indexes; capture plans without production data.
3. Measure pool demand and limits with two API instances and configured Worker queue concurrency; include connection exhaustion and Valkey outage recovery.
4. Test burst outbox, poison event, DLQ/replay, attendance sweep backlog and coordinate purge lag. Use `readOperationalLag` fields as a starting signal, then add latency/error/queue metrics.
5. Measure `ValkeySessionStore.revokeUser` at 100, 1,000 and 10,000 live sessions; current source uses global `KEYS` plus sequential reads/writes. Define a bounded revocation design before a multi-tenant session load.
6. Define retention, archive and export bounds with the owner before choosing instance sizes or a pricing plan.

No capacity SLO or hosted resource bill is asserted here. Docker Desktop was unavailable for a fresh PostgreSQL run in this review; see `qa-artifacts/hrms/discovery-2026-11-09/sprint-25-current-source-check.evidence.md`.
