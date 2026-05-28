# CI/CD Runbook

## Branch Flow

| Branch | Purpose | Deploys To |
| --- | --- | --- |
| feature branches | local development and PR work | no automatic hosted deploy |
| `dev` | shared integration | `dev.hawkaii.in` and `dev-api.hawkaii.in` |
| `qa` | QA/UAT | `qa.hawkaii.in` and `qa-api.hawkaii.in` |
| `main` | production | `hawkaii.in` and `api.hawkaii.in` |

## GitHub Actions

Workflow: `.github/workflows/branch-ci-cd.yml`

Pull requests to `dev`, `qa`, or `main` run checks and do not deploy.

Pushes to `dev`, `qa`, or `main` run checks and then trigger the matching Render API and worker deploy hooks. Production should use GitHub Environment protection with manual approval on the `production` environment.

## Required GitHub Secrets

- `DEV_RENDER_API_DEPLOY_HOOK_URL`
- `DEV_RENDER_WORKER_DEPLOY_HOOK_URL`
- `QA_RENDER_API_DEPLOY_HOOK_URL`
- `QA_RENDER_WORKER_DEPLOY_HOOK_URL`
- `PROD_RENDER_API_DEPLOY_HOOK_URL`
- `PROD_RENDER_WORKER_DEPLOY_HOOK_URL`

## Frontend Deployment

The frontend is Cloudflare-oriented. Configure Cloudflare branch/project deployment:

- `main` -> `https://hawkaii.in`
- `qa` -> `https://qa.hawkaii.in`
- `dev` -> `https://dev.hawkaii.in`

The GitHub workflow validates frontend builds but does not directly deploy Cloudflare. Do not enable duplicate frontend deploy mechanisms unless one is explicitly disabled.

## Post-Deploy Smoke

Run after each hosted deploy:

```bash
curl -i https://dev-api.hawkaii.in/api/v1/health/ready
curl -i https://qa-api.hawkaii.in/api/v1/health/ready
curl -i https://api.hawkaii.in/api/v1/health/ready
```

Then validate the matching frontend URL and login flow.

## Failure Handling

- If checks fail, do not deploy.
- If a Render deploy hook secret is missing, add the secret and rerun the workflow.
- If a deploy hook succeeds but Render build fails, inspect the Render service build logs.
- If API health fails after deploy, roll back the Render service to the previous successful deploy and inspect migrations/config.
