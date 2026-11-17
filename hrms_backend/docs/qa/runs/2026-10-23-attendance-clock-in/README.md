# Clock-in conflict recovery — 23 October 2026

## Cause

The reported request was denied with `already_checked_in`. Employee E1 had a
durable session opened on 30 September that remained `working`, although a
legacy API-generated automatic checkout already existed for that day. Legacy
summary reads could create checkout punches in memory without closing the
PostgreSQL session or command state. Summaries also read cached punches after
transactional commands.

The UI separately treated `geo_policy.allowed=true` as attendance success even
when the overall command returned HTTP 409. This produced the contradictory
“Clock-in was not recorded” and “Your punch was recorded” messages.

## Changes

- Rejected commands retain the rejected badge and actual server rejection
  message, independently of a successful location-policy evaluation.
- PostgreSQL self summaries load committed employee punches into an isolated
  projection. A due checkout preview cannot write shared punch or day arrays.
- PostgreSQL reads no longer generate legacy automatic checkout punches.
- Before clock-in, overdue sessions close through the existing transactional
  auto-checkout command. Matching legacy system checkout evidence is reused
  without creating a duplicate punch or publishing a second punch-recorded event.
- Company-scoped reads, session locks, policy cutoffs, command replay, and
  transactional projection/outbox behavior are retained.

## Local recovery

The stale 30 September session was closed at its existing checkout time,
`2026-09-30T18:29:00.000Z` (23:59 IST), through the corrected command service.
**Zero new punches were created.** The local backend was restarted. A read-only
service check returned work date `2026-10-23`, no first check-in, and
`next_allowed_actions: ["check_in"]`. No live clock-in was submitted during QA.

## Verification

- Frontend and backend TypeScript checks passed.
- ESLint passed for the four changed frontend source/test files.
- Attendance regression and browser geolocation suites: **33 passed** with
  one browser worker, including six new command-conflict cases on both pages.
- Focused attendance service, transition, tenancy, and worker unit suites:
  **135 passed**.
- Database recovery and concurrent check-in cases: **3 passed**, including both
  overdue sessions without a checkout and sessions with a legacy checkout.
  Checks cover read isolation, exactly one checkout, fresh summary actions, and
  identical idempotent replay.
- Existing PostgreSQL auto-checkout worker suite: **7 passed**.
- Backend API contract suite: **27 passed**.
- Scalability verification and `git diff --check` passed.

The initial integration runs encountered 30-second database setup hook
timeouts; 11/13 runtime cases passed on the second run. The remaining recovery
and concurrent check-in cases passed using a temporary configuration with a
90-second setup allowance. The committed test configuration was not changed.

The full backend test command stopped in unit tests. Its tenancy mock failure
was fixed and verified above. Two unrelated failures remain: the production
signup dev-token assertion and a team-reporting fixture dated 20 October that
is recomputed as absent on the current date. Repository-wide lint, quality,
foreign-key remediation, and implementation guards also report existing
failures in untouched scripts/docs, migrations, the outbox runner, and the
Resend webhook authentication check. Full business/regression gates therefore
cannot be reported as passing.

The work-tracker location in `AGENTS.md` is a macOS path absent on this Windows
workspace; this QA record captures the deliverable and verification instead.
