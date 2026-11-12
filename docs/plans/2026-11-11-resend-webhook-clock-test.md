# Resend webhook timestamp test stability

## Objective

Keep the signed webhook route test stable under CI scheduling while preserving the verifier's 300-second inclusive tolerance and rejection beyond that window.

## Scope and evidence

- Branch `sprint-25/auth-webhook-clock` starts at `origin/release-01` (`30783aa5`). The failing docs PR #119 was `a732f8e0`; this branch changes tests only.
- `auth-email-delivery.unit.test.ts` signs a timestamp at `Date.now() + 301s`, then sends it through Fastify. `SvixResendWebhookVerifier.verify` reads a later current time and rejects only when the absolute difference is greater than 300 seconds. A one-second delay can make the fixture valid.
- The same route suite's accepted `-299s` fixture can become too old after a two-second delay. Both route fixtures need margin. Exact inclusive and just-outside boundaries belong in deterministic verifier tests using its existing `nowSeconds` injection.
- No production code, secret, database, hosted service, or external tracker changes are in scope.

## Cases

| Case | Setup and action | Expected result and forbidden effect |
| --- | --- | --- |
| WEBHOOK-CLOCK-1 | Route signed future timestamp with ample margin; inject locally | HTTP 400 and no stored email event. Provider calls are outside this inbound-webhook test. |
| WEBHOOK-CLOCK-2 | Route signed past timestamp safely within tolerance; inject locally | HTTP 200 and one email event. |
| WEBHOOK-CLOCK-3 | Verifier fixed now=1000, signed timestamps at -300, +300, -301, +301 | Inclusive endpoints accept; just-outside endpoints reject and do not write an event. |
| WEBHOOK-CLOCK-4 | Verifier receives a timestamp created at 1000+301 but evaluates it at 1001 | It correctly accepts because it is then exactly +300; demonstrates the old route test race without changing the security rule. |

All fixtures are synthetic. These cases are local test evidence, not a shared sheet update or human UAT. Independent exact-head review remains required.

## Verification and recovery

At the uncommitted frozen worktree on 2026-11-11:

| Check | Result |
| --- | --- |
| Fixed-clock verifier unit file | 30/30 passed. |
| Fastify webhook route unit file | 22/22 passed. |
| `TEST_DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/hrms_coverage_unit_only APP_ENV=local pnpm test:unit` | 45 files, 540/540 passed, exit 0 (392.21 s). The URL is a synthetic unit-test placeholder; no hosted database was used. |
| `pnpm lint` | Passed across 476 backend files. |
| `pnpm typecheck` | Passed. |
| `git diff --check` | Passed. |

Independent QA and exact committed-head CI remain pending. No product behavior was changed. Revert only these test changes if necessary; the production verifier remains unchanged.
