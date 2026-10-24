# Risk Prioritization, Coverage Evidence and Traceability

## Risk rating is calibrated, not mechanical
Capture impact to real users/business, prevalence/exposure, occurrence evidence, exploitability, detectability, reversibility, blast radius, availability of workaround, current controls, release change frequency and source confidence. Optionally record historical Impact×Likelihood as a secondary compatibility score. Do not allow low probability to auto-downgrade catastrophic safety, irreversible data loss, systemic tenant disclosure, ledger corruption or core legal/mission impact.

- `P0`: catastrophic/irreversible/widespread security, privacy, safety, financial or critical-core-flow risk; full release blocker unless formal senior waiver policy permits and captures rationale (waiver **cannot** assert safe or compliant).
- `P1`: material business interruption, authorization/integrity problem or dominant journey; deep coverage.
- `P2`: important but recoverable, limited impact and measurable workarounds.
- `P3`: cosmetic/noncritical, low user impact, little operational consequence.

Priority controls test-selection order. Severity of a proven defect, confidence in discovery, and case execution status are separate fields. Do not claim a control is verified when no execution evidence exists.

## Assurance layers
Define **planned** (scenarios specified), **covered by existing code tests** (tests map but not executed here), **owner-approved** (expected behavior approved), and **executed** (requires independent execution evidence not produced by this skill). This skill does not create the executed layer.

## Minimum coverage matrices and cross-checks
1. Actor × role × resource × action × tenant/organization × state.
2. Entity state × event × guard/override × valid transition × forbidden transition × audit.
3. API × method × authn × authz × input × error/timeout × retry × idempotency.
4. Integration × producer × consumer × good/invalid/duplicate/out-of-order/late messages × compensation.
5. Journey × channel × client version × offline/slow/invalid/revoked auth × continuation.
6. Critical domain invariant × API/worker/job/report/export × persistence/audit.
7. Architecture dependency × failure × resilience expectation × observability × recovery.
8. Release change × consumers × schema/feature flag compatibility × migration rollback.
9. User base × accessibility need × locale/timezone × device/network × customer tier.
10. Requirement/rule × code reference × risk × planned cases × owner approval × coverage gap.

For each matrix enumerate applicable cells and explicitly justify `NOT_APPLICABLE` entries. Do not claim 100% coverage where an inventory is incomplete. P0/P1 items without an accepted oracle remain **blocked/provisional**, even if a proposed test case exists.

## Incremental updates
Diff base/head revisions of application code, schemas, contracts, flags and operations. Revisit upstream and downstream dependencies of changed domain code, including all client surfaces and exports; roll forward stable rule/test IDs and preserve previous results. Highlight new/changed/retired cases, newly untestable paths, and decisions newly invalidated by code changes.

## Assurance gating
`G0` authorized scope + source inventory; `G1` engineering/product questions documented and critical business rule decisions approved or explicitly deferred; `G2` every critical risk traced to scenarios or explicit named gap; `G3` QA Lead review plus cross-discipline review and evidence requests for execution/release. Missing execution results are `Not Tested`, not silent pass.
