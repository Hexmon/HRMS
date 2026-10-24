# Business Logic Reconstruction and Test Oracles

## Discover real decision logic
Source: domain service/validation functions, DB schema, authorization policies, state machine, UI guards, migrations, feature flags, jobs, exports, API contracts, seed data and previous tests. For each critical action produce a *rule card*:

- `Rule ID`, domain vocabulary, actor + resource + tenant + lifecycle state.
- `Precondition` and feature/tenant/version flag; time interpretation and effective date.
- `Implemented condition` with source path/symbol/branch; any fallback/default and side effects.
- `Business intent` with approved requirement/decision, or `TBD`.
- `Invariants`: must always, must never, must eventually (with owner-approved bounds).
- `Decision table`: combinations of guards -> allowed outcomes; eliminate infeasible combinations with reason.
- `State machine`: valid transitions, invalid transitions, transition authority and compensation/reversal.
- `Concurrency`: duplicates, races, stale reads and ambiguous retries; unique/idempotency key scope.
- `Unexpected/adversarial behavior`: applicable `ARU` IDs; another tenant/resource ID, unauthorized role, stale session, undocumented field, hostile data/file/export value, excessive/repeated request, browser/offline interruption and public entrypoint variants.
- `Test oracle`: approved observable result, both user-facing and database/event/audit effect.
- `Known implementation variance`: mismatch, regression risk, prior customer exception.

## Four distinct findings (do not conflate)
1. *Business-intent gap*: no authorized expected result (`NEEDS_BUSINESS_CONFIRMATION`).
2. *Implementation discrepancy*: approved rule differs from code; capture branch and **suspected** defect, not confirmed execution failure.
3. *Coverage gap*: rule/transition exists but tests do not validate it (do not claim defect).
4. *Observability/testability gap*: behavior cannot be measured in an approved test environment; propose instrumentation/test seam for developer review, without modifying code.

## Derive test oracles safely
- **Normative oracle**: approved rule or external binding contract validated by the domain/legal owner.
- **Contract oracle**: versioned OpenAPI, protobuf, schema, event contract; only for behavior it actually defines.
- **Invariants/properties**: approved conservation, monetary balance, referential integrity, uniqueness, monotonic state, access boundaries.
- **Reference/cross-implementation**: independently validated ledger/client/algorithm, not simply same source duplicated.
- **Metamorphic**: safe relation between multiple inputs/outputs, *but must itself be approved*. E.g. adding an unrelated user should not change another tenant's totals, if the tenant policy guarantees isolation.
- **Observed current implementation**: diagnostic baseline, **never normative by itself**.

If no oracle exists, the test's expected outcome must read `TBD — NEEDS_BUSINESS_CONFIRMATION (BQ-...)`. A likely industry practice can be offered as an *option for owner decision*, not an implicit default.

## Detect contradictions across layers
Examples: client accepts an input server rejects; list screen filters by tenant but export doesn't; approval action checks manager scope, bulk action bypasses it; UI displays provisional state but reports treat it as final; data correction leaves audit evidence inconsistent; offline event timestamp differs from server receive time; one client's enum differs from current API schema. Only report a mismatch when cited code shows different conditions; otherwise record a test hypothesis.

For every state-changing rule, distinguish: ordinary permitted behavior; legitimate but unexpected user behavior; prohibited business behavior; unauthorized/adversarial behavior; and dependency/client interruption. Trace whether rejection occurs before mutation and whether transactions, side effects, audit, caches, downloads and queued work remain unchanged. Use `references/adversarial-and-real-user-assurance.md` for the mandatory applicability families; a missing approved abuse oracle is a business/security question, not permission to choose one.

## Example (fictional illustration)
`BR-ORDER-014`: Spec says cancellation is forbidden after shipping. `src/order/cancel.ts::canCancel` seems to allow admin override for `SHIPPED`. Do **not** assert admin override is correct or a proven bug. Create `BQ-ORDER-003` asking Product/Security whether overrides are permitted, under what approval/audit conditions; note two provisional test outcomes and affected risk. Until approved, keep acceptance TBD.

## Defect confidence tags
`STATIC_DISCREPANCY` (clear source contradiction), `SUSPECTED_DEFECT` (risk hypothesis), `CONFIRMED_DEFECT` (requires approved execution evidence outside this skill). Use these tags in the gap report, not execution status.
