# Test Oracles

Read docs/discovery/owner-decisions.md and the exact task card before executing a case. DEC-001–047 include original company history, assigned-role union (DEC-031), password recheck now/MFA later (DEC-032), company-owned providers (DEC-037/038), business success despite mail failure (DEC-036), email deep-link reauthorization (DEC-040), verified personal email before activation (DEC-044/046), ordinary former-employee PDF (DEC-043), and Finance/Accounts release (DEC-047). Never convert implementation or a source defect into the expected rule.

Engineering test invariants come from root AGENTS: tenant/resource authorization, no undocumented protected assignment, soft-delete/audit history, atomic business/outbox writes, bounded retry/idempotency and honest evidence. A case marked NEEDS_BUSINESS_CONFIRMATION is not an executable acceptance oracle until its named question is resolved. The starting case list is not exhaustive input or branch coverage.
