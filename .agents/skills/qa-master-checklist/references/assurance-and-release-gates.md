# QA Deliverable Gates, Human Approval and Release Evidence

## G0 — Intake completeness
Document product scope, repository SHA/branch, deployment revision (if known), inspected files, excluded paths, approved output location, key owners, role/userbase hypotheses and preliminary architecture. If no actual app repo, stop source-code claims.

## G1 — Discovery and expected-result authority
For every P0/P1 journey: roles/resources known; vertical code path traced or marked untraced; material business rules classified; product/engineering contradictions documented; high-priority business questions owner-assigned. Only approved business rules may produce final expected results; unknowns remain `TBD` with a named owner. Developer confirmation of topology doesn't confer authorization to approve domain policy.

## G2 — QA package coherence
- Original SOP twelve filenames preserved, with additional architecture and assurance artifacts where useful.
- Critical risk -> requirement/rule -> current code evidence -> test -> approved oracle trace.
- Test case says exactly what an independent tester must do, preconditions/data/dependencies, and what to observe in user state, persistence, side effects and audit logs.
- Missing/rejected/Not Applicable all explicitly documented; `Not Tested` default; no plan claims that tests have passed.
- Applicable architecture failure, auth/tenant, concurrency, recovery, migration and privacy cases included without generic filler.
- Unknown target load/latency/SLO/RPO/RTO and regulatory obligations never populated with made-up values.
- User experience, support/operational consequences and rollback/recovery are part of critical journeys.
- All `ARU-01`–`ARU-19` families have an evidence-backed applicability status and every applicable P0/P1 family is traced to a case or explicit owned gap.
- Automated checks, manual exploratory testing, hosted-environment verification, independent penetration assessment and human role-based UAT remain separately reported evidence types.

## G3 — Handoff and release review
QA Lead: scenario relevance and execution feasibility. Product Owner: intended outcomes and human UAT. Engineering Lead: accurate call chains and topology. Security/Privacy: applicable controls, jurisdiction and independent penetration scope. Performance/SRE: production-sized load model, hosted controls, recovery and instrumentation. Accessibility/UX: supported assistive technology, viewport, browser and constrained-network expectations. Every owner must be identified even when review is pending.

A planning result can say `Required evidence missing`, `Needs decision`, `Release blocker pending testing`, `Planned check not executed`. It **cannot** say product is secure, certifiable, compliant, production-ready, or all tests passed.

## Quality check of generated artifacts only
The included optional `scripts/validate_qa_artifacts.py` verifies file structure, CSV integrity, status placeholders, broken basic references and suspicious empty expected-result fields. It is NOT an application test and does not approve rule correctness, coverage completeness, deployment safety or business sign-off.

## Feedback/refresh cycle
At product change, incident, new persona, permission model, infrastructure migration, deployment topology shift, integration change, compliance decision, or performance objective revision, use incremental mode and record affected case IDs rather than regenerating a new unrelated checklist.
