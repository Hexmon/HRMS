# Internal QA Checklist

This checklist summarizes `qa/TESTING_TEST_CASES.xlsx` after the deployment/agile upgrade. The workbook is the execution source of truth.

## Coverage

- Total cases: 51
- P0: 28
- P1: 16
- P2: 7
- Sprint totals: Sprint 1: 41 SP, Sprint 2: 20 SP, Sprint 3: 8 SP, Sprint 4: 10 SP, Sprint 5: 9 SP

## Added Deployment Coverage

- Domain/DNS/SSL/CORS for `hawkaii.in`, `api`, `qa`, `qa-api`, `dev`, and `dev-api`.
- GitHub branch CI/CD and Render deploy hooks.
- Neon, Cloudinary, and Valkey isolation.
- Secrets/config readiness.
- Rollback and post-deploy smoke.

## Evidence

- `qa/DEPLOYMENT_AGILE_EVIDENCE_REGISTER.md`
- `qa/DEPLOYMENT_READINESS_AUDIT.md`
- `docs/deployment/*`
- `.github/workflows/branch-ci-cd.yml`
