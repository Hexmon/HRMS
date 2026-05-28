# Release Signoff Summary

## Current Scope

Deployment hardening, branch CI/CD, environment isolation, agile delivery process, and QA workbook upgrade.

## Release Gate

- All P0 tests in `qa/TESTING_TEST_CASES.xlsx` must pass or have approved waiver.
- Hosted QA/prod must use real DB, Valkey, Cloudinary, and API mode.
- Production frontend is `https://hawkaii.in`.

## Sprint Plan

- Sprint 1: 41 story points
- Sprint 2: 20 story points
- Sprint 3: 8 story points
- Sprint 4: 10 story points
- Sprint 5: 9 story points

## Known Manual Inputs

- DNS records.
- Render deploy hooks and secrets.
- Neon branch connection strings.
- Cloudinary credentials/product environments.
- Resend secrets and verified sender.
- GitHub Environment protection settings.
