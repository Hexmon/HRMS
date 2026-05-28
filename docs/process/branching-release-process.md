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
