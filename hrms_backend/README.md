# Hawkaii HRMS Backend

Standalone Fastify backend for Hawkaii HRMS. This project is extracted from the original monorepo as a single backend package and keeps the exact backend domains: Auth, Core Employee Management, Expense/Finance, Documents, Reports, Assets, Timesheets, Platform infrastructure, PostgreSQL migrations, outbox, object storage, API docs, and backend tests.

## Requirements

- Node.js 22+
- pnpm 10+
- Docker Desktop or Docker Engine with Compose

## Local Development

```bash
# Keep real local values in .env.local.
# The tracked .env.dev.example is for hosted dev; if you copy it, replace hosted URLs, Neon, Valkey, and R2 values with local ones.
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

Hosted development, QA, and production use a private Cloudflare R2 bucket. Local development and tests may use the process-local memory adapter; hosted QA and production reject that driver.

```env
OBJECT_STORAGE_DRIVER=memory
```

For hosted private R2 storage, configure environment-owned bucket credentials:

```env
OBJECT_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_private_environment_bucket
R2_REQUEST_TIMEOUT_MS=10000
```

Do not expose R2 credentials, bucket names, endpoints, or object keys to the frontend. Files go through the backend, and authorized clients fetch bytes through the authenticated content endpoint. Generic PostgreSQL document routes remain fail closed until immutable tenant ownership is implemented.

Image uploads are compressed in the frontend before they reach the backend. PDF uploads are compressed server-side before object storage when `PDF_COMPRESSION_ENABLED=true`; this uses Ghostscript (`PDF_COMPRESSION_BINARY`, default `gs`) and defaults to fail-open behavior so uploads continue if local Ghostscript is not installed. The production Docker image installs Ghostscript for this path.

API endpoints:

- API: `http://localhost:3001`
- Health: `http://localhost:3001/health/ready`
- Swagger UI: `http://localhost:3001/docs`
- OpenAPI JSON: `http://localhost:3001/api/v1/openapi.json`

## Transactional Email / Resend

Email verification and password reset delivery use the backend `EmailDeliveryService` with Resend as the transport provider. The backend still owns token generation, token hashing, expiry, single-use verification, resend limits, and user verification state.

Local development should usually keep email delivery in log mode:

```env
EMAIL_DELIVERY_PROVIDER=resend
EMAIL_DELIVERY_MODE=log
FRONTEND_URL=http://localhost:8080
```

For staging or production real delivery, set `EMAIL_DELIVERY_MODE=send`, provide `RESEND_API_KEY`, use a verified `RESEND_FROM_EMAIL`, set the public `FRONTEND_URL`, and configure `RESEND_WEBHOOK_SECRET`. The Resend webhook endpoint is:

```text
POST /api/v1/webhooks/resend
```

Apply migrations before enabling real delivery:

```bash
pnpm db:migrate
pnpm db:verify:no-cross-schema-fks
```

Detailed architecture and deployment guidance:

- `../docs/architecture/email-verification.md`
- `../docs/runbooks/resend-email-verification-deployment.md`

## Docker Runtime

```bash
# Use .env.local with local Docker database and Valkey values.
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

Integration tests require PostgreSQL, Valkey, and applicable object storage. Use `pnpm test:infra:up` before `pnpm test:integration` or point `TEST_DATABASE_URL` in your untracked env file to isolated services. Adapter integration can use a disposable S3-compatible service; no hosted R2 credentials are required for local unit tests.
