# Release Governance

## Release Gates

Production release requires:

- P0 tests pass or have approved waiver.
- No known cross-environment data leakage.
- No default/weak production secrets.
- Production Cloudinary mock disabled.
- Frontend API mock fallback disabled.
- API health passes.
- Login/logout passes.
- Rollback route identified.

## Approval

- Dev owner confirms implementation readiness.
- QA confirms test status.
- Product owner accepts known issues.
- Release owner approves production deploy.

## Production Smoke

Run immediately after deploy:

- Frontend loads at `https://hawkaii.in`.
- API health loads at `https://api.hawkaii.in/api/v1/health/ready`.
- Login/logout.
- One document/media smoke.
- One role navigation sanity check.
