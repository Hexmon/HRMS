# Enterprise QA Test-Design Techniques and Coverage Facets

## Trace system to tests
For each material capability, enumerate `Persona × Goal × Channel × Permission/Ownership × State × Data Variant × Time/Device/Network × Dependency Failure × Recovery`. Do not test the Cartesian product. Use equivalence partitioning and risk-aware pairwise to sample benign combinations, and *explicit* mandatory tests for all known high-impact intersections (e.g. privileged role + cross-tenant export + revoked session).

Before sampling, complete the `ARU-01`–`ARU-19` applicability register from `adversarial-and-real-user-assurance.md`. Use those IDs as coverage tags in risks, tests and traceability. Pairwise reduction must not eliminate known hazardous intersections or turn an untested assurance family into implicit coverage.

## Techniques and when to use
- **Use-case and journey tests:** business outcomes across layers with persona and preconditions.
- **Decision table:** complex Boolean/multi-condition rules; infeasible conditions excluded with rationale.
- **State-transition:** statuses, allowed/forbidden transitions, retries, reversal, expired approvals.
- **Equivalence / boundary value:** validation limits, currency precision, file size, date cutoff, limits, pagination.
- **Property-based:** invariant across broad generated inputs; inputs safe and rule approved.
- **Metamorphic:** outcome relationships when standalone oracle costly, only if relationship owner-validated.
- **Contract / consumer-driven contract:** independent clients/services, schema evolution, version compatibility.
- **Model-based:** lifecycle graphs, event-sequence correctness, coverage of adverse transitions.
- **Concurrency schedules:** parallel sessions, double submission, lock contention, write skew, stale versions.
- **Security/privacy abuse-case tests:** permission/trust boundaries, predictable IDs, incorrect masking, role downgrade.
- **Exploratory charters:** uncertain use patterns and usability exceptions; charter, risk hypothesis, evidence goals and timebox.
- **Fault/recovery:** planned non-prod process/network/storage failures, evidence before/after and no lost/doubled side effect.
- **Accessibility/compatibility:** WCAG-level and supported client matrix confirmed by organization.
- **Adversarial and real-user assurance:** cross-object/role/session/auth abuse; hostile files, exports and input sinks; mass assignment and resource abuse; concurrency/offline/browser interruption; public resources; production-scale recovery; hosted controls; independent penetration and human UAT. Apply only evidenced surfaces and preserve separate evidence types.

## Coverage dimensions by architecture
- Pure backend/API: contracts, auth, state, concurrency, data integrity, service QoS and event delivery.
- Web/mobile: UX transitions, offline, browser cache, keyboard, accessibility, multi-tab, auth lifecycle, locales.
- Enterprise multi-tenant: tenant isolation, scoped search/reports, delegated admin, export/bulk ops, support tools, audit.
- High-stakes domain: approved invariant ledger, reconciliations, approval overrides, immutable evidence, human safety.
- Distributed: outbox/inbox, delivery semantics, replay, migration compatibility and consistency assertions.

## Quality characteristics
ISO/IEC 25010:2023 offers a product-quality model for requirements and evaluation, not a certification achieved by checklist completion. Evaluate applicable quality characteristics using *actual product expectations* and avoid reproducing proprietary standard text.

## False confidence to avoid
Line coverage does not equal policy correctness. A test with a mock authorization layer cannot prove server-side authorization. An API contract test does not validate DB transaction rollback. One browser doesn't represent the customer support matrix. An uptime check cannot validate transaction success, and successful backups do not prove restore capability.

References: ISTQB CTFL 4.0.1 https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/ ; ISO product quality model https://www.iso.org/standard/78176.html ; W3C WCAG https://www.w3.org/TR/WCAG22/.
