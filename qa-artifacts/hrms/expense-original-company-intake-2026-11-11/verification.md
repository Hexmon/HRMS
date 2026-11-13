# TEN-S25-007 clean extraction verification

Date: 2026-11-11

Owner: Anurag Kumar

Branch: `sprint-25/ten-s25-007-expense-cutover`

Uncommitted base: `eb6e94a86d8a9447eba9b42aed9dd2a9a02ebdf8`

Reference only: PR #123 head `c44a01bb3067cac20d513bfcd8105746b25d8ade`

## Scope exercised

This evidence belongs to the clean extraction, not to the cumulative reference branch. It covers typed original-company expense ownership, current authority, transaction-owned commands, durable replay, routing locks, request-local expense report/dashboard/notification visibility, receipt fail-close policy, generated contracts and stable frontend command keys. Attendance workflow behavior, authentication bootstrap and API-mirror infrastructure are excluded; dashboard-only attendance aggregate parity with the existing canonical reporting projection is included.

## Clean-worktree results

- Backend typecheck passed.
- Backend lint passed for 491 files.
- Post-remediation focused backend units passed: 5 files, 7 tests. Earlier extraction units also remain green.
- An earlier combined seven-file PostgreSQL integration run passed 27/27: expense workflow 8/8, original-company authority 1/1, security/reviewer-routing 4/4, dashboard 5/5, notifications 2/2, and reports plus release adapters 7/7. After the employee self-attendance defect was corrected, the affected dashboard integration file was rerun against fresh isolated PostgreSQL/Valkey and passed 6/6; the other six files were not rerun for that final dashboard-only correction. Notification acknowledgement coverage includes concurrent Reviewer-role revocation and company-transfer denial with unchanged notification state. Security coverage includes fresh Admin/session authority, transfer scoping, relationship-owned/null-owner notification denial, bounded notification pagination, stale platform-flush fencing, exact lifetime dashboard aggregates including 10,001 additional pending tickets, globally company-bound lost-response expense and reviewer-routing create retries, immutable reviewer-routing company ownership across participant/Admin transfer, preliminary non-locking Admin screening followed by subject-independent governance-first locking, locked Admin/company revalidation before client-selected subject/mapping access, a forced company-row/platform-flush interleaving that completes without deadlock/rollback and replays exactly once, tenant-scoped revoke lookup/locking, identical foreign/nonexistent revoke behavior, Reviewer-role denial before both new execution and durable replay, revoked-Admin replay denial, same-key concurrency, OCC revoke, and unchanged mapping/journal/outbox counts on rejected replay. Current dashboard coverage proves an ordinary Employee with no descendants sees their own exception while excluding their Manager and peer, a Manager sees self plus descendants, and both exception and detailed evidence/source outputs match the canonical service. It also compares exact SQL attendance evidence/source aggregates with the canonical reporting model across geo fallback, provisional outbox, mobile warning and regularization inputs; all pooled sessions are forced to Asia/Kolkata and a near-midnight UTC punch proves UTC day matching. Active company departments include zero headcount while inactive, foreign and corrupt references are excluded.
- Contracts passed: 1 file, 27 tests.
- Disposable 0068/0069/0070 verifier passed: historical tickets and every legacy reviewer mapping quarantined (current memberships are not accepted as historical evidence), new routing typed, immutable mapping owner enforced, eight old-writer guards and ticket/routing journal subjects verified, and `EXPLAIN` selected the cross-company replay lookup index. The temporary database was dropped after the run.
- OpenAPI docs verification and API consumer handoff verification passed.
- Frontend typecheck and lint passed with zero errors and 43 pre-existing Fast Refresh warnings. The full unit run passed 4 files/37 tests; the focused expense command, command-key and notification run passed 3 files/35 tests. Manager-backup cases assert exact POST/DELETE paths, create body, revoke query version, generated UUID command keys, retry reuse after uncertain failure, rotation after confirmed success, assignment 101 through the shared adapter/query consumer seam, the 10,000-record safety bound and inconsistent-page failures.
- Deactivated or soft-deleted requesting actors and participants are fresh-authority denials; historical record ownership remains with the original company after employee transfer/deactivation. Separately, inactive original-company direct detail, receipt, Finance approve/payment/settlement and committed-key replay regressions assert the exact `400 COMPANY_CONTEXT_REQUIRED` envelope and unchanged ticket/child/audit/notification/outbox/journal state. Whether all other read surfaces should match that inactive-company behavior remains explicitly undecided and unchanged.
- The current leaf inventory is 60 paths: the prior 55 plus 0070, dashboard exact-aggregate/service, reviewer repository, and frontend query/store seams.
- The full document integration file intentionally remains red at exactly two assertions: general document listing returns 409 where the legacy test expects 200, and SQL expense receipt upload returns 409 where the legacy test expects 200. The other 2/4 document tests pass. These expectations were not weakened. This extraction provides a receipt authorization classifier only; approved raw receipt-byte storage/upload/download journeys are not implemented and remain owned by TEN-S25-021.

Generated mirrors are byte-identical after regeneration from this extraction:

- four OpenAPI artifacts: `3f3daf9d5cc03433f9b7675e4acada5837661929b09dd8cbde15a24e39f65b57`;
- two endpoint indexes: `e45a41c58f077e38497e8553e3f47d8cb96c1c50d995e5a969cfb5ac277966b5`.

## Reference CI, not clean-worktree evidence

PR #123 run `43068078751` completed normally. It is useful only as reference because that head contains excluded work. Frontend passed; backend unit 560/560 and contracts 28/28 passed; integration passed 50 files/354 tests and failed 4 files/5 tests. Expense 8/8, original-company 1/1, reports 5/5 and release adapters 2/2 passed. Failures were attendance work-date expectations, an attendance regularization fence, excluded auth bootstrap behavior, general document listing, and the SQL expense receipt upload intentionally blocked pending TEN-S25-021.

## Remaining gates

- The full S25-026-U/P/N/F families remain Not Tested; focused automated checks do not replace browser/human-role UAT or independent exact-head review.
- SQL receipt bytes remain deliberately unavailable pending TEN-S25-021; the current classifier is not an implemented positive byte/storage journey. Do not weaken the general-document or receipt-upload expectations to make them green.
- Migrations 0068/0069/0070 must not be promoted until asset PR #118 supplies 0065/0066 and holiday PR #122 supplies 0067 on the release base and migration history is reverified.
- Historical owner reconciliation, changed-coverage clearance, hosted verification and shared-sheet publication remain pending.
- Implementation commit `4419292f139a411f541744a390a06afbe7f34db6` was exact-reviewed locally before publication; no deployment or hosted-system mutation was performed. Publication status is tracked in the PR and delivery handoff.
