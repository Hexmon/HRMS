# AGENTS.md - Hawkaii HRMS Frontend

This directory is the TanStack Start/React frontend package inside the Hawkaii HRMS product repository. Root `AGENTS.md` applies first; this file adds frontend-specific conventions.

## Architecture And Contracts

- Use the backend OpenAPI/generated frontend contract and domain adapters as the API source of truth.
- Keep remote-data access in the shared/domain API layer rather than embedding fetch logic across components.
- Frontend roles and route guards control navigation and presentation only. The backend must authorize every operation.
- Production and QA must use real backend APIs with mock fallback disabled.

## UI Behavior

- For a user-facing flow, use `.agents/skills/hrms-product-ui/SKILL.md` to trace the route, API adapter, role state, mock fallback and visible recovery path before changing the screen.
- Model loading, empty, success, partial-data, validation, authorization, network, and server-error states explicitly.
- Show success only after confirmed backend success. Prevent accidental double submission and stale responses from overwriting newer state.
- Do not expose controls the active role cannot use, but never treat hidden controls as a security boundary.
- Preserve filters, pagination and user input predictably across back navigation, refresh, stale tabs and recoverable network failures.
- Keep list/export requests within backend limits; do not request unbounded ranges.
- Validate uploads for user feedback while relying on backend validation as authoritative.
- Maintain keyboard access, semantic labels, visible focus, usable contrast, mobile layouts and low-bandwidth behavior for changed journeys.

## Verification

Use targeted Playwright coverage for affected journeys and run the relevant package checks:

```bash
pnpm lint
pnpm typecheck
pnpm api:production-config-guard
pnpm api:implemented-route-guard
pnpm api:frontend-contract:route-coverage
pnpm build:vercel
```

Run the relevant Playwright configuration in an isolated, seeded environment when behavior changes. Record the actor, active role, tenant, viewport/browser, environment and any scenarios not executed.

## Unit Contracts And Independent QA Gate

Follow docs/agent/test-and-qa-completion.md and .agents/skills/qa-completion-gate/SKILL.md. Unit/component tests must exercise every added/changed executable behavior with actual inputs and observable validation/rendered/error/state outcomes, including stale responses, double actions, forbidden roles, account/company changes and failure recovery. Require full changed executable line coverage and all changed decision-branch cases; retain Playwright for real API-backed role journeys, keyboard/mobile and slow/offline behavior. A hidden control never proves backend security. Run `pnpm test:unit` for component/domain tests and `pnpm test:unit:coverage` for the report. QA-S25-003 adds the PR gate in `docs/agent/changed-coverage-gate.md`; its exact PR run and independent review must pass before a behavior task claims completion. No E2E-only substitute. Obtain independent QA, resolve material gaps and include base/head, commands, coverage and sanitized artifacts in the PR before Done.

## Per-Task User-Journey Cases

For every sprint, discuss real-user success, rejection and recovery cases during refinement and publish their full bodies with the task under `docs/process/task-tracker.md`. Use the repository-root `.agents/skills/qa-master-checklist/references/feature-case-workflow.md` before a UI/API-adapter change. Cases cover actual user actions and observable loading, empty, validation, denial, success and recovery states; include back/refresh/stale-tab/double-click, stale async responses, disconnection, keyboard/mobile and relevant role/company boundaries. Add and run meaningful unit/component tests plus affected real-API Playwright journeys after the slice. Tie cases and execution evidence to the task/head; QA-S25-003 remains the missing unit/coverage tooling prerequisite. No E2E-only or hidden-control claim satisfies the unit/backend security gates.
