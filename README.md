# Hawkaii HRMS Backend

Standalone Fastify backend for Hawkaii HRMS. This project is extracted from the original monorepo as a single backend package and keeps the exact backend domains: Auth, Core Employee Management, Expense/Finance, Documents, Reports, Assets, Timesheets, Platform infrastructure, PostgreSQL migrations, outbox, object storage, API docs, and backend tests.

## Requirements

- Node.js 22+
- pnpm 10+
- Docker Desktop or Docker Engine with Compose

## Local Development

```bash
cp .env.local.example .env.local
cp .env.test.example .env.test
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

API endpoints:

- API: `http://localhost:3001`
- Health: `http://localhost:3001/health/ready`
- Swagger UI: `http://localhost:3001/docs`
- OpenAPI JSON: `http://localhost:3001/api/v1/openapi.json`

## Docker Runtime

```bash
cp .env.local.example .env.local
pnpm docker:dev:up
pnpm docker:dev:verify
```

QA runtime:

```bash
cp .env.qa.example .env.qa
pnpm docker:qa:up
pnpm docker:qa:verify
```

Production-style runtime:

```bash
cp .env.prod.example .env.prod
# replace every production secret before starting
pnpm docker:prod:config
pnpm docker:prod:up
```

## Verification

```bash
pnpm lint
pnpm typecheck
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

Integration tests require PostgreSQL, Valkey, and MinIO. Use `pnpm test:infra:up` before `pnpm test:integration` or point `.env.test` to your own services.
