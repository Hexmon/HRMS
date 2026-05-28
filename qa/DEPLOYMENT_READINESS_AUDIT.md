# Deployment Readiness Audit

Date: 2026-05-29

Scope: Hawkaii HRMS deployment hardening, CI/CD branch mapping, environment isolation, agile process, and QA artifact upgrade.

## 1. Current Branch Model

- Proven current branch: `main`.
- Proven remote branch visible locally: `origin/main`.
- `origin/HEAD` is not configured locally, so the safest production branch decision from current repo evidence is `main`.
- Requested branch mapping:
  - `dev` deploys hosted dev.
  - `qa` deploys QA/UAT.
  - `main` deploys production.
- `master` should not actively deploy unless the repository default branch is later changed and the workflow is intentionally updated.

Evidence:

- `git branch --show-current` returned `main`.
- `git branch -a` returned `main` and `remotes/origin/main`.
- `git remote -v` returned `origin https://github.com/anuragkmr45/HRMS.git`.

## 2. Current Deploy Model

- Backend production deploy is represented by root `render.yaml`.
- Hosted dev and QA deploys are represented by `infra/render/render.dev.yaml` and `infra/render/render.qa.yaml`.
- Frontend hosting is Cloudflare-oriented because the frontend includes `@cloudflare/vite-plugin` and `wrangler.jsonc`.
- GitHub Actions workflow `.github/workflows/branch-ci-cd.yml` runs checks and triggers Render deploy hooks after checks pass.

## 3. Current Frontend Hosting Model

- Production frontend: `https://hawkaii.in`.
- QA frontend: `https://qa.hawkaii.in`.
- Hosted dev frontend: `https://dev.hawkaii.in`.
- Frontend env files:
  - `hrms-client/.env.production.example`
  - `hrms-client/.env.qa.example`
  - `hrms-client/.env.dev.hosted.example`
- Frontend deployment itself should be handled by Cloudflare Git integration or a dedicated Cloudflare deploy path, not duplicated blindly in the backend deploy hook workflow.

## 4. Current Backend Hosting Model

- Backend API services are Docker-based Render web services.
- Worker services are Docker-based Render workers.
- Docker is appropriate because backend PDF compression depends on Ghostscript and the backend Dockerfile installs `ghostscript`.
- API migration command is configured as Render pre-deploy on API services only.
- Worker services do not run migrations.

## 5. Current Database Model

- Backend uses PostgreSQL.
- Hosted recommendation is one Neon project with long-lived branches:
  - `main` or `prod` for production.
  - `qa` for QA/UAT.
  - `dev` for hosted dev.
- Each environment must use a different pooled `DATABASE_URL`.
- Local development can keep using local Docker Postgres.

## 6. Current Valkey / Session / Outbox Model

- Backend uses Valkey for session/rate/outbox-related runtime state.
- Each hosted environment has a separate Render Key Value service:
  - production: `hawkaii-hrms-valkey`
  - QA: `hawkaii-hrms-qa-valkey`
  - hosted dev: `hawkaii-hrms-dev-valkey`
- This prevents cross-environment sessions, rate limit counters, and outbox stream contamination.

## 7. Current Cloudinary Model

- Hosted env files set `CLOUDINARY_MOCK_UPLOADS=false`.
- Recommended best option is separate Cloudinary product environments for prod/QA/dev.
- Safe fallback is one Cloudinary product environment with strict folders:
  - `hawkaii-hrms/prod`
  - `hawkaii-hrms/qa`
  - `hawkaii-hrms/dev`
- Local development may use mock storage only where docs/config allow it.

## 8. Current Email Model

- Backend supports Resend transactional email.
- Production and QA hosted examples use `EMAIL_DELIVERY_MODE=send`.
- Hosted dev uses `EMAIL_DELIVERY_MODE=log` in examples to avoid accidental real email sends.
- Production requires real Resend API key/webhook secret and verified sender.

## 9. Current CI/CD Model

- Workflow file: `.github/workflows/branch-ci-cd.yml`.
- PRs run checks but do not deploy.
- Pushes to deploy branches run checks, then trigger Render API and worker deploy hooks.
- Required GitHub environments:
  - `development`
  - `qa`
  - `production`
- Production environment should require manual approval in GitHub Environment protection settings.

## 10. Current Test / QA Artifacts

- Existing QA workbook and tester run book exist under `qa/`.
- Existing workbook needs expansion to include deployment smoke, CI/CD validation, DNS/SSL/CORS, data isolation, secrets/config, rollback, and branch promotion.
- Existing P0/P1/P2 model should remain but deployment-specific suites must be added.

## 11. Gaps And Risks

- GitHub Environment approvals cannot be enforced by code alone; they must be configured in GitHub repository settings.
- Render deploy hooks must be created in Render and copied into GitHub secrets.
- Cloudflare frontend branch/project mapping must be configured in Cloudflare dashboard.
- Hosted services are not yet live from this local validation, so live smoke commands remain manual until DNS/services exist.
- Contract tests require local test DB at port `55432` or a real `.env.test`; this environment was not available in the previous verification.

## 12. Exact Files That Must Change

- `.github/workflows/branch-ci-cd.yml`
- `docs/deployment/hosted-deployment.md`
- `docs/deployment/environment-matrix.md`
- `docs/deployment/ci-cd-runbook.md`
- `docs/deployment/rollback-runbook.md`
- `docs/deployment/secrets-checklist.md`
- `docs/deployment/dns-checklist.md`
- `docs/process/*`
- `qa/TESTING_TEST_CASES.xlsx`
- `qa/TESTER_RUN_BOOK.md`
- `qa/TESTING_CHECKLIST_INTERNAL.md`
- `qa/TESTING_CHECKLIST_CLIENT.md`
- `qa/RELEASE_SIGNOFF_SUMMARY.md`
- repo task sheets if present.

## 13. Exact Files That Must Not Change

- Real secret env files such as `.env`, `.env.local`, `.env.prod`, `.env.qa`.
- Lockfiles unless dependency installation requires legitimate updates.
- Product source files unless a deployment safety issue requires it.

## 14. Verification Commands To Run

- `ruby -e "require 'yaml'; ..."` for Render and GitHub workflow YAML parsing.
- `cd hrms_backend && pnpm typecheck`
- `cd hrms_backend && pnpm build`
- `cd hrms-client && pnpm api:production-config-guard`
- `cd hrms-client && pnpm build`
- QA workbook validation script after regeneration.

## 15. Deployment Sanity Checks

| Check | Result |
| --- | --- |
| No active deployment file has `yourdomain.com` | Verified by `rg` on active deployment docs/envs. |
| No active deployment file uses `app.hawkaii.in` as production frontend | Verified by `rg` on active deployment docs/envs. |
| Hosted QA/prod Cloudinary mock disabled | Hosted env examples and Render YAML use `CLOUDINARY_MOCK_UPLOADS=false`. |
| Hosted QA/prod frontend mock fallback disabled | Frontend hosted env examples use `VITE_API_MOCK_FALLBACK=false`. |
| CORS/FRONTEND/API URLs match envs | Verified in hosted env examples and Render YAML. |
| Production docs/OpenAPI exposure controlled | `OPENAPI_PUBLIC=false` in production env/Render and backend gates docs route. |
| Render web/worker do not share Valkey across envs | Separate blueprints and service names per env. |
| Migrations run only in API pre-deploy | Render web services include `preDeployCommand`; worker services do not. |
