# Authentication Source Review And Remediation Planning Evidence

Date: 2026-11-10. Source baseline `87618f88`, branch `sprint-25/saas-s25-001`. Implementation/task owner: Anurag Kumar. This artifact distinguishes the earlier local source-review probes from the subsequent documentation and tracker planning task.

## Earlier Local Reproductions In This Conversation

Ran two inline commands with `node --import tsx --input-type=module` from `hrms_backend`, importing current `AuthService`, `CoreService`, `createMemoryDataStore`, password verification and, for two cases, Fastify `buildApp`. Used synthetic memory state, locally chosen test credentials, disabled/absent mail transport and supplied stores; no real database/Redis/object/email service was used. No raw token/password was printed in the result. Both commands exited 0. The inline scripts were not retained as repository tests; implementation must add durable regression cases.

| Case | Observed result | Evidence boundary |
| --- | --- | --- |
| Foreign pending-company resend/bootstrap | `claimedOtherPendingCompany: true`, `callerBecameAdmin: true` | Service reproduction; owned synthetic mailbox and pending companies. Full production attack not executed. |
| Pending-signup password replacement | `unauthenticatedRetrySetsChosenPassword: true` | Synthetic owner verification simulated after unauthenticated retry. Requires mailbox-owner interaction; not mailbox compromise. |
| Rejected weak-password signup | `rejected: true`, `usersAdded: 1`, `companiesAdded: 1` | Residual memory only; no claim those records committed to PostgreSQL. |
| Production continuation | `nextStep: set_password`, `hasSetupToken: false`, `hasBootstrapToken: false` | `NODE_ENV=production` suppression at service response; not a real browser journey. |
| Reset after Admin disables login | `credentialBefore: revoked`, `credentialAfter: active` | Real core disable method and auth reset method against synthetic memory. |
| Setup after Admin termination | `setupTokenAfterTermination: active`, `employmentAfterSetup: active` | Real core employee create/deactivate and auth setup against synthetic memory. A separate direct status fixture also reproduced the missing guard. |
| Local trust-all proxy rate bucket | Same forwarded IP returned `[401,429]`; changed forwarded IP returned `401` | Fastify injection with authMax=1 and trustProxy=true. Does not establish Render forwarding-chain behavior. |
| Counter store unavailable | `status: 500`, `code: INTERNAL_SERVER_ERROR` | Injected `incr()` exception, not a real Redis outage/reconnect. |

## Planning Review

- Read root/package guidance, evidence/environment policy, architecture-review/security-review and commit-and-track skills; current owner decisions, security plan/audit and Sprint 25 task cards.
- Rechecked auth/session/core lifecycle, config/middleware/persistence/email/frontend paths and representative expense/timesheet/EMS/platform policies to map authorization fan-out. Existing domain journeys and route inventory inform future loops; all routes were not freshly traced or tested.
- Inventory readback: 620 records, 175 partially reviewed, 444 unreviewed, one excluded. No coverage statuses were promoted by this task.
- Owner answered AUTH-Q01–03: verified-company/domain platform approval, assigned-role union, password recheck now and MFA later. Other policy questions remain open.
- Live tracker intake confirmed Sprint 25, headers and 82 task/header rows. Story Point Rules read: 1/2/3/5/8/13, complexity/risk/verification rather than hours. New eight-task draft total 52 SP; existing estimates unchanged pending refinement.

## Documentation And Tracker Checks

- `git diff --check`: passed. `./scripts/agent/protect-sensitive-files.sh`: passed.
- `./scripts/agent/verify-change.sh --plan`: selected documentation/integrity gates only. `./scripts/agent/verify-change.sh`: passed, exit 0; agent documentation/reference validation passed for 71 files.
- Six initial edited/new documents: relative-link validation passed, zero broken links. Proposal contains exactly 36 unique AUTH-RV-01–36 rows and no missing finding. Current runtime tracked files remain unchanged.
- Hash comparison confirmed all tracked dirty R2 documentation present at intake was preserved. This task did not rewrite those files or their independent evidence.
- Shared tracker [Sprint 25 Nov07-Nov13](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?gid=1812876151#gid=1812876151): added A83:N90 for AUTH-S25-001–007 and QA-AUTH-S25-001. Owners Anurag Kumar; roles Development except QA row 90; numeric points 8/5/8/5/5/5/8/8. Status Planned except AUTH-S25-006 Needs decision. Actual implementation start/end dates blank; no implementation commit or passing QA invented.
- Appended 16 existing remarks cells M20/M21/M22/M24/M35/M37/M38/M42/M47/M48/M49/M50/M51/M56/M61/M80, preserving each prior value exactly as a prefix. Other existing task values/statuses/estimates/dates remained unchanged.
- New rows use wrapped Arial 10 text and middle alignment, with Fit to data row height. Existing filter expanded from A1:N82 to A1:N90. Browser visual inspection showed new task titles, assignee and role; screenshot output was ephemeral, not retained as a repository image.
- Exported workbook before/after through the browser Google Workspace API; parsed values and formula XML read-only with Python stdlib ZIP/XML. Eight new-task assertions passed; all 16 original remarks were retained. Complete formula XML unchanged. No unrelated value changes found.
- SP Calculation recalculated assigned K19 568 -> 620, completed O19 stays 70, pending P19 498 -> 550 and above-minimum R19 538 -> 590. Cached subtotal/shared-formula cells P20/R20 also recalculated by +52. Updated the stale authored T19 narrative from the old 539-point checkpoint to the current 620 = 70 + 550 breakdown. No formula edits or changes to unrelated tabs' authored values.
- [Tracker machine-check summary](tracker-verification.json) records exact cells/IDs/booleans and formula-preservation results without copying the shared workbook into the repository. All counts/estimates are planning scope, not demonstrated capacity or completed fixes.

## Not Executed

No runtime implementation, retained regression test addition, database migration, real SQL/Redis concurrency/outage/recovery, hosted proxy/config/security probe, browser application role journey, load/soak benchmark, provider credential change, deployment, commit or push in the planning task. Independent QA and human UAT remain open. Google Sheets editing is tracker verification, not HRMS application QA.
