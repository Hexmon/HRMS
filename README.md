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

Local and demo document uploads are MinIO-backed by default so uploads work without external credentials. The backend storage layer is provider-based, so Cloudinary can still be enabled later by changing env only.

```env
OBJECT_STORAGE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:19000
MINIO_PUBLIC_ENDPOINT=http://localhost:19000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=hawkaii-hrms-dev
MINIO_REGION=us-east-1
```

The local Docker stack starts MinIO with these endpoints:

- S3 API: `http://localhost:19000`
- Console: `http://localhost:19001`

To switch the same upload code to Cloudinary, set the provider and real Cloudinary dashboard values:

```env
OBJECT_STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=local-cloudinary-mock
CLOUDINARY_API_KEY=local-cloudinary-key
CLOUDINARY_API_SECRET=local-cloudinary-secret
CLOUDINARY_FOLDER=hawkaii-hrms-dev
CLOUDINARY_RESOURCE_TYPE=auto
CLOUDINARY_UPLOAD_TRANSFORMATION=q_auto:eco,f_auto
CLOUDINARY_MOCK_UPLOADS=true
```

For real Cloudinary uploads, disable mock mode:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_MOCK_UPLOADS=false
```

Do not expose `CLOUDINARY_API_SECRET`, `MINIO_SECRET_KEY`, or any object-storage credential to the frontend. Files are uploaded to the backend first; the backend stores them through the configured provider and returns a backend-issued download URL.

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
FRONTEND_URL=http://localhost:5173
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

Integration tests require PostgreSQL, Valkey, and object storage. Use `pnpm test:infra:up` before `pnpm test:integration` or point `.env.test` to your own services. Document storage tests use MinIO by default; set `OBJECT_STORAGE_PROVIDER=cloudinary` plus real Cloudinary credentials or `CLOUDINARY_MOCK_UPLOADS=true` only when intentionally testing the Cloudinary adapter.
