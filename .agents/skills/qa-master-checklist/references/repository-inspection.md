# Repository and Architecture Investigation Playbook

## Stage 1: Freeze the analysis scope
Obtain or infer working directory, repository identity, SHA, source revision and code ownership. Record the current deployment/release tag separately from working tree. Do not assume the local branch is deployed. Respect any files excluded by user authorization. Record code-generation and external packages as boundaries rather than reading massive vendored trees.

Suggested **read-only** inspection tools when authorized: list tracked files (e.g. `git ls-files`), inspect `git status`, `git rev-parse HEAD`, search targeted file types and symbols, read relevant documentation and configuration examples. Do not use `npm install`, `docker compose up`, network calls, test runners, or secrets retrieval for discovery.

## Stage 2: Answer where this software runs
Find: application manifests, workspaces, entrypoints, deploy targets, runtime processes, containers, ingress/reverse proxy routes, queues, scheduled workers, database connections, object stores, caches, infrastructure and local/on-prem/cloud topology. Infer architecture only from the deployment evidence (services independently deployable? unique lifecycle? per-service data ownership?) not folder naming. Record hybrid patterns.

## Stage 3: Public and internal entrypoint index
- Web: paths and router guards; mobile/native deep links; desktop/CLI/edge ingress; unauthenticated flows.
- APIs: method, route, input schema, response contract, authn/authz, rate limit, idempotency, client version.
- Messages/events: topics, producers/consumers, schema and version, retry/dead-letter, ordering, dedup.
- Background: cron/schedulers/queues, locks/leases, reprocessing, long jobs, external callbacks.
- Data: schemas, constraints, views/projections, migrations, backups, audit, retention, partitioning.
- Platform: secrets references (never values), flags, feature toggles, migrations, config defaults, health checks, metrics, tracing, dashboards/runbooks, CI/CD.

Tag the inventory with the mandatory `ARU-01`–`ARU-19` families from `adversarial-and-real-user-assurance.md`. In particular, enumerate protected object identifiers and role boundaries; session invalidation and auth/recovery endpoints; file/import/parser and export/rendering sinks; user-controlled fields; rate/resource limits; stateful/concurrent and offline/event entrypoints; browser/network-sensitive mutations; unauthenticated/tokenized resources; supported clients; production-scale dependencies; and hosted-provider control planes. Record independent penetration and human UAT as evidence sources to be obtained, not code entrypoints.

## Stage 4: Trace an actual business flow (vertical slice)
For a high-risk journey, start from a user action or API call, and find:
1. What can the actor see or request? Differentiate hiding a button from enforcing server permission.
2. Where is identity resolved, tenant and resource ownership validated, and feature eligibility computed?
3. What conditions and validations branch the flow? Are there duplicate validators or disagreeing constants?
4. What gets committed, under what DB lock/transaction/isolation level, with what uniqueness keys?
5. Which jobs, events, webhooks, exports, notifications or financial side effects are emitted? In what order?
6. Which read-model/reporting code turns this into user-visible truth? Is it synchronous or eventually consistent?
7. What happens if execution crashes **before/after** each write or remote side effect?
8. Can two actors/requests race across the code path? Can retry cause repetition or loss?
9. What does the UI/API say on success, failure, network drop and ambiguous response?
10. Can a privileged actor reverse/override/correct the action? Is it audited and tenant-scoped?
11. Which legitimate-but-unexpected or adversarial `ARU` variants reach this path, and where are they rejected or bounded?
12. After rejection, timeout or interruption, are persistence, files, messages, notifications, exports, audit and user-visible state unchanged or safely reconcilable?

Record explicit path/symbol, traced signal and missing link. Verify multiple channels (web/mobile/batch/admin/API) for business-rule drift; watch for tests stubbing away the critical path.

## Stage 5: Reviewer-focused conclusion
Return (a) actual architectural shape; (b) critical user journeys; (c) trace map with evidence; (d) known implementation-vs-document disagreements; (e) unavailable code/decision sources; (f) targeted engineering questions. Avoid speculating about runtime availability or performance solely from static source.
