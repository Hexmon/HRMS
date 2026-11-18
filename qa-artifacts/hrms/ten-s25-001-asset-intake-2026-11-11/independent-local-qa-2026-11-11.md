# TEN-S25-001/018 independent local QA — 2026-11-11

Status: **partial API/SQL pass; real browser Not Tested; SaaS tenant isolation blocked by TEN-S25-010/016/017.** This record covers an uncommitted stable worktree snapshot on `sprint-25/ten-s25-001` before its initial commit. Recheck after parent reconciliation and at the exact committed head. Owner: Anurag Kumar.

## Environment and safety

- Dedicated disposable local PostgreSQL database `hrms_asset_browser_test` on loopback Docker port 55432, Valkey on loopback port 56379, ignored `.env.browserqa`, backend on loopback port 3003 and Vite prepared on port 5173. The implementer's separate `hrms_asset_test_s25_001` database was not reset or modified by this QA.
- Browser-QA database was created empty. `HRMS_ENV_FILE=.env.browserqa pnpm db:migrate` applied all 65 ordered migrations, including 0065, with exit 0. `GET /api/v1/health/ready` returned `status=ok`, database/Valkey ready. The backend and Vite sessions were stopped after the run; no hosted request, deployment or configuration change occurred.
- The temporary HTTP QA script at `/tmp/hrms-asset-http-qa-20261111.mjs` reads the local demo password and database URL from the ignored environment at runtime, asserts the database host/port/name before connecting, and prints statuses/counts only. Tokens, password, raw QR hash and synthetic user IDs are not recorded here. The script creates disposable synthetic assets and does not reset any database.

## Independent HTTP and SQL result

Command: `HRMS_ENV_FILE=.env.browserqa pnpm exec tsx scripts/run-with-env.ts .env.browserqa -- node /tmp/hrms-asset-http-qa-20261111.mjs` from `hrms_backend/`. The first run selected a manager-visible target other than the employee used for the own-assets assertion, so it verified the transaction but could not prove that employee's feed. I changed only the temporary script to select the seeded employee by local SQL and reran it; the second run exited 0 with the following assertions:

| Check | Observed |
| --- | --- |
| Synthetic Asset Manager and Employee HTTP login | 200 each. |
| Asset Manager assignee lookup; Employee denied the same lookup | 200; 403. |
| Create one synthetic asset; assign it to the seeded employee; identical-key retry | 200, 200, 200; replay body equal to first assignment result. |
| Direct SQL after retry | Asset `Assigned`, version 2, assigned to intended employee, exactly one active assignment row. |
| Manager asset detail and employee `/assets/my` | 200 each; employee response contained the newly assigned asset. |
| Public asset QR scan | 200; returned the new synthetic asset code. |

This was a real local HTTP server plus direct SQL check, not a browser/user-interface journey. It does not establish all 14 mutation routes, two-company asset ownership, full restart recovery, production-sized performance or hosted configuration safety. Author integration suites cover additional branches but require independent exact-head review.

## Browser policy block

The first `cua.createBrowserTab("iab", "http://127.0.0.1:5173/login", { visible: true })` call was rejected by automatic browser approval review. The stated reason was a saved user permission or managed policy denying network egress to that localhost origin. The rejection explicitly forbids attempting the same outcome via another browser surface, Playwright, raw CDP or indirect commands. No browser page was opened and no browser case passed. A user choice to allow the origin or retain human browser QA is pending; no alternate browser automation was attempted.

## Follow-up finding

The local backend request logger emitted the raw public QR scan path, including its QR lookup token, during the API run. Do not reproduce the token in reports. Review logger path redaction and QR token handling as a security/logging task before release; the root engineering contract prohibits sensitive payloads in logs. This finding has not been fixed or independently regression-tested here.
