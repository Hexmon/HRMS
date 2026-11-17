---
name: coordinate-delivery
description: Coordinate an explicitly authorized Hawkaii HRMS backlog delivery run with source-backed prioritization, sequential task implementation, independent multi-agent review, task branches and release-01 PRs, tracker evidence, owner merge order and integrated regression. Use for team-led multi-task delivery, not an ordinary isolated edit or read-only question.
---

# Coordinate Hawkaii HRMS Delivery

Read root/package AGENTS, the owner's activation scope, [delivery procedure](../../../docs/process/coordinated-delivery.md), current task tracker, owner decisions and canonical test/QA policy. Preserve pre-existing work and the difference between current code, approved target and proposals.

1. Establish actual repo/remote/base/head, backlog, cases, available agents/tools and missing test prerequisites; write a durable run plan/ledger with a risk/dependency order. Never claim unreviewed code is cleared.
2. Honor the session's delegation permissions. The lead owns task dispatch, git and tracker writes; one implementer owns one task worktree at a time. Parallelize independent analysis/review within actual agent limits; rotate security/database/QA specialists as relevant. No self-review as independent QA and no invented team activity.
3. For each task, deep-trace the real vertical slice and approved rule, discuss concrete cases, publish their full bodies in the shared workbook, then implement using implement-feature/fix-bug and applicable domain skills. Record necessary adjacent corrections; put unrelated improvements in separate identified tasks. Ask material business questions rather than deciding unknown entitlements/permissions.
4. Run meaningful unit and required component/contract/real infrastructure/browser checks; apply qa-completion-gate at the exact head. Independent senior review and QA return evidence-backed findings. Fix/retest/re-review until required gates pass; replan repeated non-progressing failures without declaring a false pass or running forever.
5. When authorized, commit/push one focused task branch and open its PR to release-01. Independent branches start at current origin/release-01; approved dependent stacks record ancestry, task-local/cumulative diffs and draft dependencies. Only the owner merges. Reconcile/retest/review new child heads after parent merges; never force protected/shared branches.
6. Keep task/case/PR/secret/evidence status truthful and resume from the ledger after compaction. Produce the dependency-ordered owner merge table, post-merge regression plan and QA-team handoff. After actual owner merges, verify release-01 and fix regressions through new PRs. Main promotion/deployment stays an owner gate; missing human/hosted/penetration evidence is not certified readiness.

Use [credential register](../../../docs/agent/credential-register.md) for names, scopes, approved locations and blockers only; actual values stay in existing secret stores or verified ignored local files. Discover authorized existing configuration without exposing values; missing account/domain/credential actions go to the owner while independent tasks continue.

Use find-skills only for a demonstrated gap; inspect actual source and compatibility, preserve local rules and do not install a remote recipe merely from its popularity. The current project specialist and test workflows remain authoritative. Preparing this skill or reading it does not start a goal, authorize an external mutation or bypass a side-chat no-delegation boundary.
