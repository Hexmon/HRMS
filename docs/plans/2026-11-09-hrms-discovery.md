# HRMS Product And Architecture Discovery

## Objective And Success Criteria

- Objective: Discover current product rules, code, data, infrastructure, and observed local behavior; improve shared agent guidance and verification; propose prioritized implementation work without changing product behavior.
- User/business outcome: Product and engineering owners can distinguish implemented behavior, approved intent, open decisions, and verified journeys before the SaaS redesign.
- Observable success criteria: Complete the deliverables and evidence audit in the goal objective, including skill provenance and evaluation, module/runtime map, critical journey traces, local browser evidence, and a ranked backlog.

## Scope

- In scope: Repository and documentation investigation, stakeholder questions, isolated synthetic local journeys, agent skills, guidance, and verification tooling.
- Out of scope: Public API/product workflow/schema changes, hosted operations, external tracker writes, and Git publication.
- Affected roles, tenants, modules and environments: All modules and roles; local synthetic companies only for execution.

## Evidence And Decisions

- Current implementation evidence: `af89c6a` plus the explicitly identified dirty worktree; source and migration files take precedence over older architecture snapshots.
- Approved requirements/decisions: One tenant has one company with multiple offices; latest clarification says one person belongs to one company at a time, can hold multiple authorized roles there, uses a new work email at the next employer, and historical payroll/audit stays with the original company. Old and new HR approve a transfer. HR verifies required identity, address, education and applicable experience proof before activation/login; company Admin can add requirements. Raw proofs are visible to the employee, assigned HR and company Admin. Leave/timesheet calendars follow the employee's office; timesheet segments lock on submission and corrections need approval; HR reviews worked-time/approved-leave overlaps before payroll resolution. Expense submission blocks without independent Manager and Finance approvers. Company Admin settings inherit versioned platform defaults until overridden, subject to a mandatory platform security floor. Public asset QR may show current name/type/code/status/assigned-flag details; this supersedes the earlier limited-status answer. Initial market is Indian SMBs on responsive web. These are target decisions, not implemented claims.
- Unknowns requiring an owner: Cross-employer person verification, unavailable-old-HR exception, accepted document evidence/retention, domain policy exceptions, reliability objectives, and observable acceptance criteria. `docs/discovery/owner-decisions.md` records latest answers and superseded direction.
- Assumptions explicitly accepted for this task: Preserve all pre-existing changes. Record discovery artifacts separately from executable QA evidence.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Completed | 0. Inventory and evaluate skills, record provenance and loop routing. | `.agents/skill-registry.md` v0.5 records pinned source/license reviews and fit decisions for the named candidates, loop routing, evaluation scenarios and hashes of original project skills. `hrms-product-ui` was added and structurally validated. No external skill was copied or helper executed; browser and independent behavioral evaluation limits are explicit. |
| Completed with named depth limits | A. Map packages, modules, runtime entry points, contracts, tests, integrations, and conflicts. | `docs/discovery/implementation-map.md` links each registered module group to responsibility, dependencies, source journey and discovery depth. India-reference route, company-qualified Admin geo repository, and report/browser CSV paths were inspected. Untested failure paths remain in the backlog and QA inventory. |
| Completed with owner questions open | B. Investigate identity/company/employee rules, then attendance/leave/timesheets, finance, remaining domains, and reports/operations. | Focused source journeys cover the named domains; `owner-decisions.md` records approved, superseded and open rules, and `saas-acceptance-matrix.md` links each approved target to a proposed or partial oracle. The open questions are explicit rather than filled by assumptions. |
| Completed with execution limits | C. Trace critical actions across all layers and document architecture/failure modes. | `current-runtime-source-2026-11-09.md` and source-backed standalone diagram added; Archify 9/9 deterministic checks passed, automated visual check skipped (Chrome unavailable). Two-instance asset overwrite reproduced in disposable PostgreSQL; other domains remain source-inferred until implementation verification. |
| Completed to available environment; browser blocked | D. Run isolated browser journeys and targeted integration/fault checks. | Baseline suites, narrow A/B API probes and two-instance PostgreSQL fault reproduction have dated evidence. Browser origin approval rejected the local app; no browser journey or workaround is claimed. Exact browser/UAT cases remain a later gate. |
| Completed with ranked follow-up | E. Reconcile intent/source/runtime, amend skills and guidance, and rank implementation backlog. | 22 provisional ranked items in `docs/discovery/implementation-backlog.md`, accepted-decision examples in `saas-acceptance-matrix.md`, 19 adversarial QA categories and a final discovery handoff. Remaining runtime evidence can change ranking during implementation. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Completed with behavioral limit | Validate new skill structure/references and realistic evaluation scenarios. | Original `hrms-codebase-discovery` and `hrms-architecture-review` structures were validated earlier; `hrms-product-ui` passed the bundled validator. Source journeys and the later asset probe forward-checked architecture findings. No independent blind agent evaluation ran under the no-delegation boundary; browser behavior validation is blocked. |
| Completed | Validate agent/discovery document references and negative missing-link detection. | `validate-agent-setup.sh` checked 55 guide files on 2026-11-09; deliberate missing reference fixture returned failure in an earlier run. `git diff --check` passed. |
| Completed | Validate original `hrms-product-ui` skill structure. | Bundled `quick_validate.py` returned `Skill is valid!` on 2026-11-09. This checks packaging/frontmatter only; browser behavior evaluation remains blocked. |
| Completed | Focused identity and employee source tests. | Auth preference unit: 12/12; onboarding integration: 2/2 against isolated Docker PostgreSQL/Valkey; core unit: 14/14 on 2026-11-09. |
| Completed | Existing leave/WFH and timesheet integration suites. | 2 files, 6/6 tests passed against isolated Docker PostgreSQL/Valkey on 2026-11-09. Does not cover cross-company IDs, assigned-office calendar, timesheet correction or leave-attendance conflict. |
| Completed | Project and webhook unit plus project/asset/helpdesk integration baseline. | 2 unit files, 26/26 tests; 3 integration files, 6/6 tests against isolated Docker PostgreSQL/Valkey on 2026-11-09. Containers stopped/removed after. Does not cover two-company transfer or multi-instance races. |
| Completed | Focused synthetic A/B in-memory API read probe. | `qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.evidence.md`: B asset list contained A employee-assigned asset, B Admin got A-requester helpdesk ticket and A project after current manager/assignee preferences moved, all HTTP 200. Security-settings global read also 200; mutation untested. No PostgreSQL, browser or hosted claim. |
| Completed | Synthetic sequential B-to-A Admin settings mutation probe. | `qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.evidence.md`: B Admin changed global password minimum through HTTP 200 PUT; after reassignment to A, the same synthetic Admin read the change through HTTP 200 GET. Independent company Admins, PostgreSQL and browser remain untested. |
| Completed | Two-instance asset write consistency probe. | `qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.evidence.md`: two Fastify instances shared disposable PostgreSQL/Valkey; A assignment HTTP 200/version 2, then B unrelated create HTTP 200 reverted original asset to version 1 while assignment row remained. Containers stopped/removed. Other domains and hosted behavior untested. |
| Blocked | Execute local browser journeys. | Browser origin approval gate declined `http://127.0.0.1:5173`; no browser action or workaround attempted. |
| Blocked | Automated runtime diagram browser inspection. | Archify `visual-check` exit 2: Chrome/Chromium unavailable; deterministic delivery passed 9/9, perceptual review not performed. Artifact SHA-256 `59ee29a86ad4a6dfee66456ae049435fc72aa91247ce4f655f5f9de362aaa162`. |

## Risks, Compatibility And Recovery

- Tenant/security risks: Existing single-company context must not be described as completed membership-based SaaS tenancy.
- Data/migration risks: No product migration is authorized in this goal.
- API/deployment compatibility: No runtime behavior or hosted configuration change.
- Observability: Each runtime claim requires a dated environment and executed scenario.
- Rollback or recovery: Discovery documents and skills are reversible edits; preserve prior user worktree files.

## Handoff

- Files/artifacts and review order: `docs/discovery/discovery-handoff-2026-11-09.md` links the implementation map, owner decisions, acceptance examples, source journeys, architecture/diagram, 19-category QA inventory, skill registry and ranked backlog.
- Commands and results: The handoff identifies the exact passed narrow suites, three synthetic probes, documentation/skill checks, and cases not run. `verify-change.sh --plan` was inspected; its broader backend selection includes pre-existing dirty code outside this discovery's edits.
- Remaining blockers or human actions: Browser origin approval, human role UAT, independent penetration testing and unresolved owner decisions remain explicit. The goal's discovery deliverables are complete with these limits; no release or security certification is claimed.
- Commit/PR/deployment references: None authorized by this goal.
