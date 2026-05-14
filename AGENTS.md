# AGENTS.md - Standalone HRMS Backend Engineering Directive

This project is the backend-only standalone extraction of the enterprise HRMS/ERP platform. It is a single Node.js/TypeScript package and must not be converted back into a monorepo.

## Architecture

- Backend: Node.js, TypeScript, Fastify.
- Database: PostgreSQL with schema-per-domain: `core`, `expenses`, `documents`, `assets`, `timesheets`, `platform`.
- ORM/migrations: Drizzle schema plus SQL migrations under `src/db`.
- Runtime dependencies: PostgreSQL, Valkey, and S3-compatible object storage.
- Validation: Zod schemas and typed route contracts.
- Tests: Vitest unit/integration/contract tests using Fastify inject where practical.

## Required Layout

```text
src/
  app.ts
  server.ts
  modules/<module>/
    index.ts
    routes.ts
    schemas.ts
    service.ts
    repository.ts
    policy.ts
    state-machine.ts
    events.ts
    errors.ts
  auth/
  shared/
  db/
  testing/
  workers/
scripts/
infra/docker/
docs/api/
docs/qa/runs/
```

## Boundaries

- Do not add `apps/*`, `packages/*`, or `pnpm-workspace.yaml`.
- Do not add frontend dependencies such as Next.js, React, or React DOM.
- Frontend clients must consume Fastify APIs only.
- Business logic belongs in services, not route handlers.
- No cross-schema SQL foreign keys.
- Use transactional outbox for business writes that emit events.
- All workflow-critical mutations must write audit events.
- Preserve soft delete behavior and immutable audit history.

## Verification

Run affected checks after every change, then the full loop before handoff:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm db:verify:no-cross-schema-fks
pnpm verify:business
pnpm verify:quality
pnpm verify:implementation
pnpm verify:scalability
pnpm verify:regression
```

Write QA artifacts under `docs/qa/runs/` for completed implementation work.

## Work Tracking

- Maintain the project work tracker at `/Users/anuragkumar/Desktop/Tasks/HRMS-Server.xlsx` after meaningful HRMS-Server work.
- Use project name `HRMS-Server`, the columns `Task`, `Project`, `Priority`, `Story Points`, `Status`, `Start date`, `End date`, `Deliverable`, `Notes`, `Remarks`, and the sprint-sheet pattern (`HRMS`, `Sprint N <date-range>`).
- Record the work date, story-point estimate, deliverable, verification notes, and related commit or QA artifact references when available.
- Story points must use Fibonacci-style values `1`, `2`, `3`, `5`, `8`, or `13`; split work larger than `13` into smaller tracker rows.
- Keep one workbook per project; add sprint sheets inside the same workbook instead of creating duplicate files.
