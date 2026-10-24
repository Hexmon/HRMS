# Human Discovery and Engineering Conversations

## Philosophy
Ask *why* before asserting that an unconventional design is wrong. Separate business-policy decisions from technical facts and field usage. Ground every question in a prior discovery finding, unless required to obtain access, identify the product, or establish legal/operational ownership.

## First contact when no application source exists
Ask only for the intended product and a repository snapshot/read access. Optionally request a one-paragraph description of core users and deployment; do not demand long forms or ten unrelated answers. Offer a short example answer so a busy owner can respond quickly.

## Rank questions
Highest first: `Decision impact × uncertainty × potential harm × release proximity` (judgment, not a rigid quantitative score). A question qualifies if its answer changes an expected result, state transition, privilege boundary, critical use case, volume target or safe test method. Typically 5–7 per batch; separate Product vs Engineering vs SRE/Security reviewers; avoid unreviewable 20-question dumps.

## Product/business interview
- What promised outcome matters most to each persona, and who is blocked when it fails?
- What steps are mandatory vs convenience? Who may override rules, after what approval, for which record states?
- What business events can be repeated/cancelled/reversed? Which actions are irreversible?
- What are the exact formulas, rounding, thresholds, time cutoffs, regional exceptions, tenant customizations and source-of-truth data?
- What user-visible behavior is acceptable during delayed processing or dependency failure?
- What are the business consequences of corrupted results, information disclosure, blocked workflow, or partial outage?
- What product policies are inherited from previous systems, and where are they documented?
- Which surprising but legitimate user behaviors, prohibited actions, role boundaries, public links, accessibility contexts and recovery outcomes must the business explicitly support or reject? Who represents each role in human UAT?

## Developer/architecture interview
- Is it a modular monolith, a deployment monolith, separately deployed services, or hybrid? Show the runtime topology and independent deployment units.
- Why was that design selected: team size, data transactions, ease of operations, offline/air-gap requirements, cost, vendor constraints, migration path?
- What code modules own each business rule? Which data store is authoritative for each entity/aggregate?
- Where are transaction/locking boundaries? What consistency can clients rely on? Can consumers replay events?
- Which technical exceptions are deliberate, temporary workarounds or feature-flagged migrations? Which paths are legacy?
- What failure behavior is intentional: retry budget, timeout, DLQ, circuit breaking, backups, safe rollback, partial response?
- How does the system handle mixed client versions and schema evolution? What has broken in production?
- Which seams can QA use safely for fault simulation, deterministic clocks, synthetic data and tenant isolation?
- Where are object/tenant authorization, session invalidation, property allowlists, input/file/export encoding, request/resource limits and public-resource access enforced authoritatively? Which controls differ across nodes, workers or offline clients?

## Actual user/support/SRE interview
- What tasks happen under real-world poor networks, old devices, peak shift or season, or emergency conditions?
- What workarounds do users take when a screen hangs, a job completes late, a local device is disconnected, or records conflict?
- Which support tickets, incidents and near misses recurred? What was invisible in telemetry?
- Which SLI expresses **user success** rather than infrastructure uptime? Do accepted targets exist? Who approves them?
- What is the topology in staging vs production, and what fault types are safe to test without user disruption?
- What are restore drill frequency, business continuity tolerances, and real operational escalation paths?
- What production-sized traffic/data model, supported browser/device/assistive-technology matrix, hosted-provider test boundary, independent penetration scope and named role-based UAT approvers are authorized for this release?

Map answers to the relevant `ARU-01`–`ARU-19` IDs. Do not ask all nineteen topics as a single questionnaire; prioritize the highest-risk unknowns while keeping the complete applicability register visible.

## Question template
`BQ-ID | Intended decision owner | Relevance/risk | Observed behavior + cited evidence | What differs based on the answer | Plausible mutually distinguishable options (incl. Other/TBD) | Answer | Decided on / effective version | Affected BR/Test IDs`.

Do not tell stakeholders a technical architecture is inherently unscalable/insecure. Request details and evidence about **actual** bottlenecks before judging. Preserve unresolved decisions as questions; escalation is safer than hallucinated requirements.
