# Environment Matrix

| Environment | Branch | Frontend | API | Backend `NODE_ENV` | Backend `APP_ENV` | Frontend `VITE_APP_ENV` | DB | Valkey | Object storage | Email |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local | feature/local | `http://localhost:8080` or local Vite URL | `http://localhost:3001` | `development` | `local` | local/unset | Local Docker Postgres | Local Docker Valkey | Memory or disposable S3-compatible fixture | log/disabled |
| Hosted dev | `dev` | `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` | `production` | `development` | `development` | Neon `dev` branch | Upstash `hawkaii-hrms-dev` | Private R2 development bucket | log by default |
| QA/UAT | `qa` | `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` | `production` | `qa` | `qa` | Neon `qa` branch | Upstash `hawkaii-hrms-qa` | Private R2 QA bucket | disabled by default; send when Resend is configured |
| Production | `main` | `https://hawkaii.in` | `https://api.hawkaii.in` | `production` | `production` | `production` | Neon production branch | Upstash `hawkaii-hrms-prod` | Private R2 production bucket | disabled by default; send when Resend is configured |

## Rules

- Local development remains local.
- Hosted dev is for shared integration validation and demos, not normal feature coding.
- QA and production must not use API mock fallback or memory object storage.
- QA/dev/prod must not share database connection strings or Valkey services.
- Production OpenAPI/Swagger exposure should stay disabled with `OPENAPI_PUBLIC=false`.
