# HRMS SaaS Discovery Handoff

Snapshot: 2026-11-09, branch `sprint-24/agt-s24-001`, HEAD `af89c6ac60fc32417ee2fcfea54399e0a0358411` plus a preserved dirty worktree. This is a **discovery handoff**, not an implementation, release, hosted security assessment or claim that the SaaS target is deployed. No product API, workflow or schema was changed for this discovery. Pre-existing user changes, including an untracked migration and backend scripts, were left in place; no commit, push, deployment or external tracker update was made.

## Branch Scope And Preserved Work

The `sprint-24/agt-s24-001` commits contain shared agent instructions, workflow/verification documentation, and this dated discovery record with its source traces, local synthetic probes, and prioritized backlog. They do not contain product behavior, schema, or deployment changes. The discovery artifacts describe the inspected dirty worktree at `af89c6a`; their references to migration `0065` and `.env.test.example` are inspection/reproduction context, not files in this branch.

Older, unrelated work is excluded from these commits: the October authentication/ERD diagrams, migration `0065`, and the November test-environment defaults and their backend documentation. Preserve these on separate sprint branches before handing this branch to the owner. The visual diagrams in this discovery are the November runtime-source diagram only.

## Review Order

1. [Implementation map](implementation-map.md) and [current runtime architecture](../architecture/current-runtime-source-2026-11-09.md) for components, module ownership and source versus target boundaries. The [standalone diagram](../architecture/hrms-runtime-source-2026-11-09.html) has 9/9 deterministic checks; browser visual review was not possible.
2. [Owner decisions](owner-decisions.md) and [SaaS acceptance matrix](saas-acceptance-matrix.md) for approved target rules, superseded QR choice, proposed examples and open policy questions.
3. Focused source journeys for [identity](identity-company-journey.md), [employee lifecycle](employee-lifecycle-journey.md), [attendance/leave/timesheets](attendance-leave-timesheet-journey.md), [finance/documents/reports](finance-documents-reports-journey.md), [projects/assets/helpdesk](projects-assets-helpdesk-journey.md), [Admin/dashboard/notifications](admin-platform-dashboard-notifications-journey.md) and [operations](operations-health-webhooks-journey.md).
4. [Ranked implementation backlog](implementation-backlog.md), [19-category adversarial QA inventory](../../qa-artifacts/hrms/discovery-2026-11-09/adversarial-qa-coverage.md) and [skill registry](../../.agents/skill-registry.md).

## Most Material Findings

| Finding | Evidence and practical limit | Proposed work |
| --- | --- | --- |
| Two API instances can erase committed asset state. | [Disposable PostgreSQL/Valkey probe](../../qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.evidence.md): after instance A assigned an asset, instance B created an unrelated asset and its whole-domain flush restored the first asset's stale version while the assignment row remained. Sequential two-instance reproduction, not a hosted test or proof for every domain. | `ARCH-STATE-014`: request-scoped, versioned transactions and reconciliation before multi-instance scale. |
| Current company preference does not protect several resource IDs. | [In-memory A/B API probe](../../qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.evidence.md): B saw an A-assigned asset and A ticket/project after synthetic preference reassignment. This did not run the proposed HR transfer or every API. | Immutable original-company ownership and actor/resource checks for the affected modules. |
| Admin security policy is globally shared. | [In-memory Admin mutation probe](../../qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.evidence.md): B's password-minimum update was visible after reassignment to A. Independent Admin accounts and PostgreSQL remain untested. Static source also shows globally stored workflow, channel, template, RBAC and finance settings. | `SAAS-CTRL-019`: company overrides over versioned platform defaults, a mandatory security floor, real workflow/channel consumers and A/B tests. |
| Approved business rules have source gaps. | DEC-007 proof gate, DEC-008 office calendar, DEC-009 timesheet lock, DEC-010 payroll overlap, DEC-011 raw-proof access and historical ownership are compared with current code in the focused journeys; these are source findings unless the individual local probe above says otherwise. | Follow the dependent backlog items and unresolved decision questions before implementation. |
| API-backed team utilization creates a browser CSV without formula neutralization. | `hrms-client/src/routes/_app/team-utilization.tsx` maps API employee/department/designation strings into quoted CSV; backend `generated-exports.ts` neutralizes formula-leading strings. No malicious spreadsheet execution. | Include this reachable client export in `SAAS-RPT-013` and category-6 QA. |
| Public asset QR detail is now approved by the owner. | DEC-016 supersedes DEC-014. Current route returns name/type/code/status/assigned flag and also echoes the QR hash; no employee identity or procurement cost. Existing integration test checks only ID/cost omission. | `ASSET-QR-022` now concerns QR revocation/rotation, echo decision, rate/enumeration and exact public contract, rather than reducing fields. |

## Executed Verification

- Focused existing tests passed on 2026-11-09: auth preference unit 12/12, onboarding integration 2/2, core unit 14/14, leave/WFH plus timesheet integration 6/6, project visibility unit 1/1, Resend webhook unit 25/25, and project/asset/helpdesk integration 6/6. Integration tests used disposable local PostgreSQL/Valkey when applicable and the containers were stopped afterward. These are baseline checks, not full role or tenant certification.
- The three linked synthetic API/database probes above exited 0 and retain their source, result JSON and environment limits. No cloud service or external application was mutated.
- `scripts/agent/validate-agent-setup.sh` passed 54 guide files and references; `git diff --check`, `git diff --cached --check`, the sensitive-file guard, JSON parse and the bundled `hrms-product-ui` structural validator passed. `verify-change.sh --plan` selected broader backend checks because it sees the whole pre-existing dirty worktree; that full selected plan was not run as a discovery-only change gate.
- The in-app browser refused `http://127.0.0.1:5173`. No browser, mobile, accessibility, human-role or independent penetration result is claimed. Automated diagram visual review was also unavailable. Later in this session Docker Desktop's current context stopped responding; no additional container test was attempted after that.

## Human Decisions And Next Work

- The owner still needs to choose cross-employer person assurance, an exception when old HR cannot approve transfer, document evidence/retention, office-change effective dates, timesheet-correction authority, payroll-overlap disposition, and QR hash echo/revocation; see `DEC-Q01` onward in the decision log. Do not turn these into code defaults silently.
- An approved browser surface is needed for the promised real-user journeys. Human UAT for Employee, Manager, HR, Finance, Auditor and Admin, and independent penetration testing, remain later gates.
- Implementation should start with the reproduced persistence defect and immutable tenant ownership, then company control-plane settings and the rule gaps, using the backlog dependencies and acceptance matrix. Review migrations, rollback, test data and hosted cutover separately. No deployment approval or release readiness is implied here.
