# Synthetic Admin Settings Company Boundary Probe

Executed 2026-11-09 09:43 IST, revision `af89c6ac60fc32417ee2fcfea54399e0a0358411` plus dirty worktree. From `hrms_backend/`:

```bash
pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.ts > ../qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.result.json
```

The [probe source](admin-settings-cross-company-probe.ts) builds one in-memory Fastify app with seeded synthetic data. It adds Company B, sets the seeded Admin's company preference to B, signs in locally, reads the global security settings, and changes only the minimum password length through the real `PUT /api/v1/admin/security-settings` route. It then reassigns the same synthetic Admin preference to A, signs in again, and reads the settings through the real GET route. This direct fixture reassignment is **not** the proposed old/new-HR-approved transfer workflow and does not model two simultaneous employer accounts. No Docker, browser, cloud endpoint, or external service was used.

| Step | Observed result |
| --- | --- |
| B Admin updates minimum password length from 10 to 11 | HTTP 200, settings version advances from 1 to 2. |
| Later A Admin reads security settings | HTTP 200, sees minimum length 11 and version 2. |

The [JSON result](admin-settings-cross-company-probe.result.json) records the exact statuses and values. The probe exited 0 twice. This reproduces the shared-settings effect at the in-memory API/auth/service seam and strengthens the source finding behind DEC-013 and backlog `SAAS-CTRL-019`. It does not establish how independent A and B Admin accounts, PostgreSQL instances, browser tabs, or hosted deployments behave. Run those isolated cases during implementation verification.
