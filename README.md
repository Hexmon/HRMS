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

Local document uploads are Cloudinary-backed. The default local/test examples use mock Cloudinary uploads so development can run without real Cloudinary credentials:

```env
OBJECT_STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=local-cloudinary-mock
CLOUDINARY_API_KEY=local-cloudinary-key
CLOUDINARY_API_SECRET=local-cloudinary-secret
CLOUDINARY_FOLDER=hawkaii-hrms-dev
CLOUDINARY_RESOURCE_TYPE=auto
CLOUDINARY_UPLOAD_TRANSFORMATION=q_auto:eco,f_auto
CLOUDINARY_MOCK_UPLOADS=true
PDF_COMPRESSION_ENABLED=true
PDF_COMPRESSION_BINARY=gs
PDF_COMPRESSION_QUALITY=ebook
PDF_COMPRESSION_FAIL_OPEN=true
```

For real local or production uploads, set real Cloudinary dashboard values and disable mock uploads:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_MOCK_UPLOADS=false
```

Do not expose `CLOUDINARY_API_SECRET` to the frontend. Files are uploaded to the backend first; the backend signs and stores them in Cloudinary. MinIO is no longer part of the runtime.

Image uploads are compressed in the frontend before they reach the backend. PDF uploads are compressed server-side before Cloudinary storage when `PDF_COMPRESSION_ENABLED=true`; this uses Ghostscript (`PDF_COMPRESSION_BINARY`, default `gs`) and defaults to fail-open behavior so uploads continue if local Ghostscript is not installed. The production Docker image installs Ghostscript for this path.

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

Integration tests require PostgreSQL and Valkey. Use `pnpm test:infra:up` before `pnpm test:integration` or point `.env.test` to your own services. Document storage tests use `CLOUDINARY_MOCK_UPLOADS=true` unless you explicitly configure real Cloudinary credentials.
