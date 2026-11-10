# Company Email Communication Requirements Capture

## Objective And Success Criteria

- Objective: preserve the product owner's email, provider, recovery and payslip decisions in the repository, with a source-backed target design and unresolved rules.
- User/business outcome: future engineering and product work can implement automatic company-owned email without treating current Resend-only behavior or payroll attendance snapshots as a finished system.
- Observable success criteria: canonical decision log and docs index link a dated discovery document; current behavior and proposed behavior remain separate; no source or deployment behavior changes.

## Scope

- In scope: documentation of business rules, module communication opportunities, provider connection, delivery/recovery, payroll spreadsheet and former-employee payslip journey, QA scenarios.
- Out of scope: code, migration, provider configuration, spreadsheet content, hosted mutation, sending mail, sprint-sheet mutation, commit or deployment.
- Affected roles, tenants, modules and environments: company Admin, platform operator, Employee, former employee, Manager, HR, Finance and other approvers; all company tenants; auth, core, EMS, attendance, leave/WFH, timesheets, expenses, helpdesk, assets, projects, documents, reports and proposed payroll; design only.

## Evidence And Decisions

- Current implementation evidence: commit 87618f88 source paths and pre-existing dirty worktree; email service and config are Resend-only, worker lacks business-event notification consumer, payroll periods are attendance snapshots, EMS personal email lacks verification metadata.
- Approved requirements/decisions: DEC-033–047 in owner-decisions.md plus DEC-013/015/030; see email-communication-requirements-2026-11-11.md.
- Unknowns requiring an owner: MAIL-Q01 is resolved by DEC-046, MAIL-Q02 is explicitly deferred, and MAIL-Q03 is partly resolved by DEC-047. Other MAIL-Q items remain open.
- Assumptions explicitly accepted for this task: no production behavior is inferred from source, and no implementation is authorized by documentation approval alone.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Completed | Inspect current email, event, EMS profile and payroll source plus repository documentation. | Source references in the discovery document; no hosted inspection. |
| Completed | Record approved answers and outstanding product questions. | Owner decision log and MAIL-Q list. |
| Completed | Write the target requirements/architecture and link it from the documentation index. | New discovery document and docs/README.md. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Completed | Review documentation diff and local relative links; check whitespace. | Local repository; exact commands in handoff. |
| Not run | Backend, browser, provider sandbox or hosted user journeys. | Documentation-only change; future implementation acceptance matrix is in the discovery document. |

## Risks, Compatibility And Recovery

- Tenant/security risks: requirements include cross-company provider and recipient denial; no runtime enforcement was changed.
- Data/migration risks: future company-scoped provider and personal-email verification schema require design; no migration in this task.
- API/deployment compatibility: none changed.
- Observability: future delivery and provider-health telemetry specified, not implemented.
- Rollback or recovery: remove the new discovery/plan files and the two appended index/decision sections if this documentation direction is rejected; preserve other pre-existing dirty worktree edits.

## Handoff

- Files/artifacts: docs/discovery/email-communication-requirements-2026-11-11.md, docs/discovery/owner-decisions.md, docs/README.md, this plan.
- Commands and results: reported in the assistant handoff.
- Remaining blockers or human actions: resolve the remaining MAIL-Q details; obtain the spreadsheet layout during the later payslip planning step.
- Commit/PR/deployment references: none; not requested.
