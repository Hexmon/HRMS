# Branching And Release Process

## Branches

- Feature branches: developer work.
- `dev`: hosted development/integration environment.
- `qa`: QA/UAT environment.
- `main`: production.

## Promotion

```text
feature branch -> PR -> dev -> QA promotion -> qa -> release approval -> main
```

## Rules

- PRs run checks and do not deploy.
- Push to `dev` deploys hosted dev.
- Push to `qa` deploys QA.
- Push to `main` deploys production after GitHub Environment approval if configured.
- Backend permissions and policies remain source of truth.
- Frontend route guards are UX only.

## Release Notes

Each promotion to `qa` and `main` should include:

- Features changed.
- Migrations.
- Env/config changes.
- QA scope.
- Known risks.
- Rollback notes.

## Owner-Activated Release-01 Delivery

For the coordinated remediation run approved 2026-11-11, [coordinated-delivery.md](coordinated-delivery.md) defines the explicit integration path: one sprint task branch/PR to release-01, with dependent stacks permitted and recorded. The owner merges PRs in dependency order; actual merged heads receive regression before any later main promotion. A stacked PR remains draft until its prerequisites and new-head checks are resolved. Show task-local and cumulative diffs and reconcile children after ordinary/squash/rebase merges. Never infer hosted dev/QA/production deployment behavior from this workflow change; inspect CI and environment rules. The generic dev/qa promotion flow above remains a separate hosting process, and main/deployment require owner approval.
