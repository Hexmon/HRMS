---
name: hrms-product-ui
description: Review or change Hawkaii HRMS frontend journeys, responsive screens, form states, and accessible interactions against the real API and role model. Use for user-facing TanStack Start/React work; not for backend-only changes or visual styling in isolation.
---

# HRMS Product UI

Read the root and `hrms-client/AGENTS.md`, the affected route/component, its `src/domains/*` adapter, `src/shared/api/*` behavior, and the relevant product decision or journey in `docs/discovery/`. For visual consistency, inspect `src/styles.css` and existing `src/components/ui-kit/` patterns before adding a new primitive. Treat backend OpenAPI and server authorization as authoritative; a hidden control or a local role check is presentation only.

Map the user's task as `actor/role → entry route → form or list state → domain query/mutation → API response → invalidation/refetch → visible result`. Record where the chain stops. Distinguish API-backed UI from the development mock path: `shared/api/config.ts` disables mock fallback in production, while some providers retain browser-local seeded data. Do not present mock or cached rows as verified server data, and check that errors cannot be mistaken for empty success.

For the affected journey, decide which loading, empty, forbidden, validation, stale-version, duplicate-submit, partial upload, offline/retry, refresh and back-navigation states materially change the user's outcome. Keep the user's draft where recovery is possible; announce success only after confirmed server success. Check any query key or local state that could show a previous account's or company's data. Use current owner decisions for company, office and role behavior; do not invent a policy to fill a pending decision.

Prefer existing components and tokens, semantic controls, visible focus, clear labels, keyboard operation and content that works at narrow widths. Inspect real text lengths, long Indian names/addresses, dense tables, currency/date formatting and low-bandwidth behavior where the screen uses them. Measure layout and interaction through an authorized browser surface when available; static code review alone cannot establish accessibility or responsive behavior. Do not use another browser tool to bypass an origin or approval gate.

Verify the smallest relevant frontend checks in `docs/agent/verification-matrix.md` and an isolated role-based browser journey when permitted. Record actor, role, company, viewport/browser, network condition, action, expected and actual UI/API effect, and any blocked or unexecuted case. For tenant, role, upload or public endpoint risks, use the applicable QA/security procedure as well. This skill supplies UI method, not permission for hosted changes or product-rule decisions.
