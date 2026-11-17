# Business Rule Catalogue — <Project> @ <SHA>

## Rules
For each rule include:

### BR-<DOMAIN>-001 — <short business invariant>
- **Statement:** <testable language; no asserted intent unless approved>
- **Classification:** `IMPLEMENTED_RULE | CONFIRMED_BUSINESS_RULE | INFERRED_RULE | NEEDS_BUSINESS_CONFIRMATION`
- **Actor/resource/tenant/record state/channel:** <context>
- **Implemented behavior:** <code path trace + triggering conditions>
- **Intended behavior/oracle:** <decision/approved source, or TBD>
- **Evidence:** `<path :: symbol @ SHA>` <line range if stable>
- **Conflicting sources:** <none/links>
- **Calculation/time rules:** <known/TBD>
- **Invariants:** <must/must-not/eventually>
- **Failure/concurrency:** <duplicate/invalid transition/time window/etc>
- **Priority/risk:** <P0-P3, risk ID>
- **Human authority/confidence:** <owner, decision date, source / High/Medium/Low>
- **Questions/related tests:** <BQ-IDs and TC IDs>
