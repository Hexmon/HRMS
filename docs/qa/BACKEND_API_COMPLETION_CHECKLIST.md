# Backend API Completion Checklist

Use this checklist for every remaining HRMS backend API phase. A phase is not complete until the tracker, code, tests, OpenAPI, docs, QA artifact, and commit evidence are all updated.

## Phase Setup

- Create or update the tracker row in `/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx` before coding.
- Set `Project = HRMS-Server`, `Domain` to the backend domain, and `Status = In Progress` when implementation starts.
- Keep each phase at `13` story points or less; split larger work before coding.
- Confirm planned APIs are still listed in `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` and are not already implemented.

## API Implementation Rules

- Keep the standalone Fastify module layout: `routes`, `schemas`, `service`, `repository`, `policy`, `state-machine`, `events`, and `errors` where the domain needs them.
- Put business logic in services/policies, not route handlers.
- Use Zod validation for request and response contracts.
- Preserve audit logs, outbox events, soft deletes, OCC/version checks, and no cross-schema SQL foreign keys.
- Use compact paginated list responses. Default `page_size` is `25`; maximum normal list `page_size` is `100`.
- Use `include=` for optional nested data instead of returning large objects by default.
- Use async export jobs for large report/download workloads.
- Do not add infrastructure beyond PostgreSQL, Valkey, MinIO/S3-compatible storage, Fastify, and the existing worker unless explicitly approved.

## Required Tests

- Unit tests: schema validation, state transitions, policy decisions, permission boundaries, invalid payloads, and edge cases.
- Integration tests: happy path, validation errors, `401`, `403`, `404`, `409`, pagination, audit/outbox behavior, and role/object scoping.
- Contract tests: every route appears in generated OpenAPI with auth, request, response, and shared error schemas.
- Regression tests: existing implemented APIs continue to pass and old removed finance flow routes/statuses do not reappear.

## Verification Gates

Run the affected targeted tests first, then these gates before marking the tracker row complete:

```bash
pnpm lint
pnpm typecheck
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
pnpm api:docs:generate
pnpm api:docs:verify
pnpm api:consumer:verify
pnpm test
```

For the final phase, also run:

```bash
pnpm build
pnpm verify:business
pnpm verify:quality
pnpm verify:implementation
pnpm verify:scalability
pnpm verify:regression
```

## QA Artifact And Commit

- Write a concise QA artifact under `docs/qa/runs/<phase-name>/` with commands, results, manual API checks, known gaps, and timestamps.
- Update frontend contract docs only after OpenAPI generation proves the API is implemented.
- Change the tracker row to `Completed` only after verification passes.
- Record the commit hash and QA artifact path in the tracker `Commit / QA Artifact` column.
