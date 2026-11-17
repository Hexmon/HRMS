# Authentication Remediation And Sprint 25 Planning

## Objective And Success Criteria

- Reconcile the 36 source-review findings with existing auth/security/SaaS tasks and the approved product decisions.
- Publish a phased database/backend/browser/configuration and cross-feature review plan, assigned to Anurag Kumar, without runtime implementation.
- Success: every finding maps to a task and acceptance case; unanswered policy remains explicit; repository links and live Sprint 25 edits are verified.

## Scope

- Auth/signup/verification/setup/reset/invitations, company approval and HR lifecycle, permissions/sessions, mail/outbox, rate limits/proxies, config/JWT/KDF, affected feature policies and browser recovery.
- This work documents implementation and QA obligations. No application code, migration execution, dependency installation, credential/config changes, deployment, commit or push is part of it.
- Preserve concurrent R2 planning changes. Use existing storage and transaction workstreams rather than duplicating their implementation scope.

## Evidence And Decisions

- Source baseline `87618f88`, branch `sprint-25/saas-s25-001`; R2 documentation work present at intake. Runtime files unchanged at inspection.
- Earlier local source-review reproductions covered eight distinct synthetic behaviors; no persistent test script or independent review exists. Real SQL/Redis/two-replica/browser/hosted/load cases remain proposed.
- Approved in this conversation on 2026-11-10: platform approval after company/domain verification; union of all currently assigned company roles for backend access; password recheck for sensitive privileged actions at launch, MFA later. Canonical owner decision log records provenance.
- Keep DEC-Q01/02/04/05, DEC-BQ05/06/13 and numeric timeout/retention/budget decisions open where applicable. No first-Admin document exception or automatic transfer override is invented.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | Read existing security plan, owner decisions, current source and cross-feature policies | 36 findings and module matrix in the proposal; complete route audit not claimed. |
| Complete | Read live Sprint 25 and point rules; identify overlap | Existing rows 20–82 already cover transaction, settings, sessions, limits, recovery and R2 tasks. |
| Complete | Ask owner questions and incorporate answers | AUTH-Q01–03 answered; other policy details remain explicit. |
| Complete | Draft phased repair, data responsibilities, failure contracts and task mapping | `docs/discovery/authentication-remediation-2026-11-10.md`; eight new tasks, 52 provisional SP. |
| Complete | Save repository docs and verify integrity | Six initial documentation/evidence files saved; 36 unique finding mappings, zero broken links, sensitive-file/diff/agent verification passed. Runtime files unchanged. |
| Complete | Refine existing tracker rows and append only uncovered tasks | Saved A83:N90, appended 16 existing remarks, expanded filter to A1:N90 and refreshed SP Calculation T19 narrative. Exported readback preserved all formulas and unrelated values. |

## Verification

| Status | Check | Environment/evidence |
| --- | --- | --- |
| Complete | Coverage inventory truthfully retained | 620 rows: 175 partially reviewed, 444 unreviewed, one excluded; not cleared by this plan. |
| Complete | Live tracker intake | Sprint 25 Nov07-Nov13, 14 headers, 82 populated rows; rules 1/2/3/5/8/13 read. |
| Complete | Documentation links/IDs/diff/sensitive-file guard | `verify-change.sh` passed; 36 unique mapped findings, zero broken links, existing R2 content hashes preserved. |
| Complete | Sheet saved readback | Eight task ID/owner/role/SP/status/date assertions and 16 append-preservation checks passed; complete formula XML unchanged. |
| Not run | Application implementation, regression/browser/failure/load tests | Defined for future task execution; no new runtime checks needed for documentation edits. |

## Risks, Compatibility And Recovery

- New PostgreSQL security writers cannot coexist with old snapshot flush writers. Plan coordinated prelaunch cutover and capability invalidation, retain additive schema and secure forward recovery.
- Company/domain approval does not decide founding-Admin document verification. Role union does not bypass tenant/workflow/self-approval restrictions. Password recheck is assurance, not a new permission.
- New estimates overlap dependencies and remain provisional; no capacity commitment or delivery dates inferred.
- No customer data migration is presumed; actual developer/demo environment data cannot be deleted without separate authorization.

## Handoff

- Proposal, dated evidence, owner decisions and existing security plan/audit pointers; existing R2 files preserved.
- Tracker verified: `Sprint 25 Nov07-Nov13`, rows 83–90, IDs AUTH-S25-001–007 and QA-AUTH-S25-001, all Anurag Kumar, Planned except AUTH-S25-006 Needs decision. Existing remarks M20/M21/M22/M24/M35/M37/M38/M42/M47/M48/M49/M50/M51/M56/M61/M80 preserved and extended. SP Calculation T19 narrative refreshed; assigned 568 -> 620, pending 498 -> 550, completed unchanged at 70. No formula text changed.
- Commit/PR/deployment: not performed. Runtime remediation and independent QA remain open.
