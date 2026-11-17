---
name: qa-completion-gate
description: Review completed Hawkaii HRMS behavior changes for meaningful input/output tests, changed-line and decision-branch coverage, independent QA and reproducible PR evidence before marking a ticket Done. Use after feature or bug implementation and for PR readiness; planning-only discovery does not execute application tests.
---

# QA Completion Gate

Read root and applicable package AGENTS.md, the ticket and approved business rules, then [completion policy](../../../docs/agent/test-and-qa-completion.md). Inspect the actual base/head diff, new files, test configuration and reports before judging coverage.

1. Map every changed executable behavior and decision branch to inputs/preconditions, allowed/denied outputs, state and forbidden side effects. Include wrong-company/role/related IDs, stale/double/concurrent actions and dependency failures when relevant. Missing expected behavior remains an owner question.
2. Verify domain-local unit tests with meaningful observable assertions, 100% added/modified executable line coverage and all changed business/security decision branches. Extract testable decisions; prove real SQL/RLS/queue/browser boundaries with the appropriate integration/component/E2E tests. Report layers separately. Never infer coverage from build success, mock calls or test counts, or hide gaps using ignores/skips.
3. Run only the authorized checks selected by docs/agent/verification-matrix.md. For a bug, retain failing-before/passing-after evidence where a reliable seam exists. Missing runner/coverage instrumentation is a prerequisite blocker, not a fabricated passing report.
4. Request a separate [QA specialist](../../specialists/qa-reviewer.md) when available and authorized; otherwise hand off to an independent human reviewer and keep QA pending. Give raw ticket/diff/results, record the reviewed SHA and reviewer findings, resolve material issues and recheck affected paths. Honor no-delegation restrictions.
5. Prepare sanitized PR evidence: ticket IDs, base/head, input/output-to-test mapping, exact commands/results, unit/branch/changed-line coverage, real boundary/browser evidence, reviewer identity, gaps and rollback. Follow .github/pull_request_template.md and docs/process/developer-handoff-template.md. Mark Done only when all required gates pass; external submission still needs authorization.

For documentation-only work, validate paths, rules, templates and realistic workflow scenarios and classify executable coverage N/A with a reason. Do not manufacture unit tests for prose. Do not claim exhaustive possible-input coverage, independent penetration testing, human UAT or hosted verification from this gate.

## Case Inventory Reconciliation

Read [per-feature workflow](../qa-master-checklist/references/feature-case-workflow.md). Compare the task's pre-implementation cases with the final source/diff decision branches, actual user controls and observed failures. Add missing cases, document N/A and approved unresolved questions, and check every required case has actual evidence at the reviewed head. Not Tested in the planning CSV means Not run, never Passed. Keep independent review and tooling gaps visible in the sheet; preserve historical results and parent/child estimate ownership.
