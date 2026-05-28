# Hawkaii HRMS QA Checklist

This is the client-friendly QA summary for the hosted deployment and full product test cycle.

## Environments

- Production: `https://hawkaii.in`
- QA: `https://qa.hawkaii.in`
- Hosted dev: `https://dev.hawkaii.in`

## Tester Execution Order

1. Release Gate P0.
2. Deployment Smoke.
3. Sprint Regression.
4. Full Regression.
5. Signoff.

## Release Blockers

- Login/session failure.
- Cross-environment or cross-company data leak.
- Production or QA using mock storage/API fallback.
- Broken expense approval/payment/settlement flow.
- Document upload/open/delete failure in hosted QA.
- Failed production deployment smoke without approved rollback.
