# Sprint 25 Per-Feature Test Design And Completion Workflow

## Objective And Success Criteria

- Owner: Anurag Kumar; date: 2026-11-11; source baseline: 87618f88.
- Make root/backend/frontend agent entrypoints route every behavior task through case design, actual test execution and the existing independent QA gate.
- Add detailed, traceable initial cases for all current Sprint 25 leaf tasks, with no fabricated execution results or changed story points.

## Scope

- In scope: agent/skill/testing documentation, public primary-source skill research, versioned QA planning artifacts and the existing HRMS workbook's Sprint 25 task/case views.
- Out of scope: application implementation, dependency/skill installation, app execution, hosted probes, deployment, commits, git changes and unrelated concurrent planning edits.
- Test design covers applicable Employee, Manager, HR, Finance, Auditor, Admin, asset/helpdesk and service roles across isolated companies A/B.

## Evidence And Decisions

- Existing test-and-qa-completion.md already requires meaningful assertions, changed executable line/decision-branch coverage, real boundary/browser tests and independent review.
- Backend has Vitest projects; inspected frontend has Playwright but no unit script. QA-S25-003 owns actual tooling/CI implementation. Documentation cannot enforce CI.
- Preserve all approved decisions and historical results. Unresolved oracles stay NEEDS_BUSINESS_CONFIRMATION; no finite suite proves every possible input.
- Live workbook intake: 140 task rows, 12 parents, 128 leaf tasks. Explicitly authorized sheet modifications are test-case additions and task links, not task rescoping.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | Inspect agent/QA policies, package scripts and Sprint 25 intake | Staged before.json/tasks.json preserve workbook values/formulas; no app requests. |
| Complete | Research authentic skills and current primary documentation | Microsoft Playwright agents, Anthropic webapp-testing and Vitest coverage; no external install. |
| Complete | Strengthen reusable feature-case workflow and package entrypoints | Narrow additions; preserve concurrent source/docs changes. |
| Complete | Validate and publish detailed test design | Initial 482 cases, all Not Tested; existing QA static validator reports 0 errors/warnings. |
| Complete | Verify workbook preservation, docs and handoff | Compare authored existing values/formulas; retain exact commands and review gaps. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Complete | QA planning-artifact static lint | Existing validate_qa_artifacts.py --mode plan; staging output only; not app tests. |
| Complete | Every leaf task mapped, unique case IDs, unresolved oracles explicit | CSV/traceability/workbook readback. |
| Complete | Skill frontmatter, links and documentation-only verification | Existing validators and change verification selection. |
| Not run | Product unit/integration/browser/security/UAT | Not part of this planning request; required before implementing tasks become Done. |
| Pending | Independent review | No subagents authorized in this side conversation; hand off for separate review. |

## Risks, Compatibility And Recovery

- No runtime/API/schema/config changes. Pre-existing dirty files remain owned by their original work.
- Snapshot task A:N and formulas before sheet edits; append case details and links without resetting history, estimates or totals.
- Cases are initial target contracts, not a completed inventory of all changed branches. Refine against the implementation base/head and actual controls.
- Remove only this dated addition/new detail tab if rollback is needed; never replace the workbook.

## Handoff

- Artifacts: qa-artifacts/hrms/sprint-25-test-design-2026-11-11/.
- Workflow: .agents/skills/qa-master-checklist/references/feature-case-workflow.md.
- Remaining blockers: missing unit/coverage tooling, unresolved business oracles, all product execution and independent review.
- No commit/PR/deployment performed by this task.
