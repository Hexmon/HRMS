# Hawkaii HRMS Documentation

Last verified from the repository: 2026-06-30.

This directory is the main documentation entry point for the Hawkaii HRMS monorepo. It contains knowledge-transfer material for new developers, deployment runbooks, process references, architecture notes, and implementation status.

## Start Here

New developers should start with the KT pack:

- `knowledge-transfer/README.md` - reading order and onboarding path.
- `knowledge-transfer/project-overview.md` - product, repo, modules, and ownership map.
- `knowledge-transfer/local-development.md` - local backend/frontend setup.
- `knowledge-transfer/frontend-guide.md` - frontend architecture and route conventions.
- `knowledge-transfer/backend-guide.md` - backend architecture and module conventions.
- `knowledge-transfer/database-and-data.md` - schemas, migrations, persistence, and seed data.
- `knowledge-transfer/api-contract-and-integrations.md` - API contract, client integration, and external services.
- `knowledge-transfer/mobile-api-handoff.md` - employee mobile app API handoff, attendance retry rules, registered-device behavior, and privacy boundaries.
- `knowledge-transfer/modules-and-roles.md` - role/module matrix and business workflows.
- `knowledge-transfer/testing-release-qa.md` - verification, CI, QA handoff, and release checks.
- `knowledge-transfer/operations-runbooks.md` - hosted operations and incident references.
- `knowledge-transfer/new-developer-checklist.md` - day-one checklist and first PR checklist.

## Existing Documentation Map

| Area | Documents |
| --- | --- |
| Architecture | `architecture/README.md`, `architecture/current-runtime-source-2026-11-09.md`, `architecture/system-architecture.md`, `architecture/frontend-architecture.md`, `architecture/backend-architecture.md`, `architecture/data-architecture.md`, `architecture/security-auth-rbac.md`, `architecture/integrations-events.md` |
| Product and implementation status | `implementation/README.md`, `implementation/implementation-status-index.md`, `implementation/HRMS_PRODUCTION_TASK_SHEET.md` |
| Documentation coverage | `implementation/documentation-coverage-audit.md` |
| Email verification architecture | `architecture/email-verification.md`, `resend-email-verification-architecture-report.md` |
| Email verification deployment | `runbooks/resend-email-verification-deployment.md` |
| Hosted deployment | `deployment/README.md`, `deployment/hosted-deployment.md`, `deployment/environment-matrix.md`, `deployment/deployment-verification-checklist.md`, `deployment/secrets-checklist.md` |
| CI/CD and rollback | `deployment/ci-cd-runbook.md`, `deployment/rollback-runbook.md`, `deployment/dns-checklist.md` |
| Delivery process | `process/README.md`, `process/agile-delivery-plan.md`, `process/branching-release-process.md`, `process/release-governance.md`, `process/documentation-maintenance-process.md` |
| Agent engineering | `agent/README.md`, `agent/evidence-policy.md`, `agent/environment-safety.md`, `agent/verification-matrix.md` |
| Discovery in progress | `discovery/discovery-handoff-2026-11-09.md`, `discovery/implementation-map.md`, `discovery/identity-company-journey.md`, `discovery/employee-lifecycle-journey.md`, `discovery/attendance-leave-timesheet-journey.md`, `discovery/finance-documents-reports-journey.md`, `discovery/projects-assets-helpdesk-journey.md`, `discovery/admin-platform-dashboard-notifications-journey.md`, `discovery/operations-health-webhooks-journey.md`, `../qa-artifacts/hrms/discovery-2026-11-09/adversarial-qa-coverage.md`, `discovery/identity-verification-options.md`, `discovery/owner-decisions.md`, `discovery/saas-acceptance-matrix.md`, `discovery/backend-saas-review-inventory.md`, `discovery/backend-saas-review-inventory.csv`, `discovery/saas-rule-traceability.md`, `discovery/session-media-failure-boundaries.md`, `discovery/backend-resource-scenarios.md`, `discovery/modular-monolith-saas-proposal.md`, `discovery/implementation-backlog.md`, `../qa-artifacts/hrms/discovery-2026-11-09/sprint-25-current-source-check.evidence.md`, `../.agents/skill-registry.md` |
| Execution plans | `plans/README.md`, `plans/TEMPLATE.md` |
| QA process | `process/qa-handoff-process.md`, `process/definition-of-ready.md`, `process/definition-of-done.md`, `process/sprint-ceremonies.md`, `process/developer-handoff-template.md` |
| Sprint tracking | `process/task-tracker.md` and the linked shared task sheet |
| Operations runbooks | `runbooks/README.md`, `runbooks/health-and-smoke-runbook.md`, `runbooks/incident-response-runbook.md`, `runbooks/database-backup-restore-runbook.md`, `runbooks/worker-operations-runbook.md`, `runbooks/media-storage-runbook.md` |

## Source Of Truth Rules

- Backend API behavior is sourced from `hrms_backend/docs/api/openapi.json` and generated frontend contract docs under `hrms_backend/docs/api/frontend-contract/`.
- Frontend API adapter behavior is sourced from `hrms-client/src/domains/*` and `hrms-client/src/shared/api/*`.
- Database schema and migration order are sourced from `hrms_backend/src/db/schema.ts` and `hrms_backend/src/db/migrations/`.
- Hosted environment values must come from the tracked example files and secret stores, not from `.env.local`.
- Stale or older handoff notes should not override the KT pack when they conflict with current code.

## Sprint 25 Remediation And QA Completion

- [Sprint 25 SaaS delivery backlog](discovery/sprint-25-saas-remediation.md): all 35 findings, ten workstreams, sole owner Anurag Kumar and modular test contracts.
- [R2 document-storage review](discovery/r2-document-storage-remediation-2026-11-10.md): source-backed file/metadata/access/replacement failures, proposed private R2 lifecycle and Sprint 25 implementation/QA refinements. Proposed architecture, not deployed behavior.
- [Test and QA completion](agent/test-and-qa-completion.md): meaningful unit inputs/outputs, changed executable line and branch coverage, independent review and PR evidence.


## Current Business-Rule Review

- [Sprint 25 business rules](discovery/business-rule-gaps-2026-11-10.md): seven existing gaps, 17 additional gaps/policy questions, approved decisions and proposed test oracles.
- [Owner decisions](discovery/owner-decisions.md): DEC-021–029, including the normal-WFH refinement, with unresolved policy retained.
- [Business-rule QA evidence](../qa-artifacts/hrms/business-rules-2026-11-10/verification.md): actual documentation checks and unexecuted application verification.


## Email Communication Discovery — 2026-11-11

- [Company email communication and payslip-delivery requirements](discovery/email-communication-requirements-2026-11-11.md): owner-approved target rules, current Resend-only source boundary, company-owned Brevo/Resend/SES/SendGrid connections, workflow event catalogue, spreadsheet-to-payslip proposal, failure/abuse cases and open decisions. This is design discovery, not implemented or tested behavior.
- [Owner decision log](discovery/owner-decisions.md#email-communication-checkpoint--2026-11-11): DEC-033–047 and their resolved, deferred and unresolved details.

## Sprint 25 Communication Delivery Plan

- [Email automation gap analysis and deduplicated delivery tasks](discovery/email-automation-sprint-25-backlog.md): all existing templates/channels and new cross-module automation, four company-owned providers, 16 task refinements, 34 future delivery/QA cards, dependencies and unresolved payslip rules. All assigned to Anurag Kumar; planning only.

## Supplied Audit Reconciliation — 2026-11-11

- [Thirty supplied findings mapped to source and Sprint 25](discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md): missing EMS/licence/import/financial/worker work, 29 existing refinements, approved-role correction and precise acceptance scope. Planning only; no runtime assurance implied.

## Sprint 25 Per-Feature Test Design — 2026-11-11

- [Reusable case workflow](../.agents/skills/qa-master-checklist/references/feature-case-workflow.md): task-linked decision, boundary, tenant/role, failure and rendered-user cases, followed by actual execution and the existing QA gate.
- [Testing skills research](agent/testing-skills-research-2026-11-11.md): official Playwright/Anthropic sources, stack fit and adoption limits; no external skill installed.
- [Sprint 25 initial case inventory](../qa-artifacts/hrms/sprint-25-test-design-2026-11-11/00_SYSTEM_UNDERSTANDING.md) and [verification](../qa-artifacts/hrms/sprint-25-test-design-2026-11-11/verification.md): 482 planned cases for 128 leaf tasks; all Not Tested, shared-sheet case links and original tracker history preserved.

## Coordinated Backlog Delivery

- [Team delivery procedure](process/coordinated-delivery.md): source/dependency prioritization, one task branch/PR, approved stacks, independent review, owner merge sequence and regression gates.
- [Main-chat Goal activation prompt](agent/main-chat-delivery-goal-prompt.md): copyable owner authorization and execution scope; preparation does not start the run.
- [Credential readiness register](agent/credential-register.md): exact key names/scopes/locations and owner actions only; secret values stay outside tracked files.
