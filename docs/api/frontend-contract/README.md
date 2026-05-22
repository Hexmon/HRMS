# Frontend API Contract Pack

This folder is the frontend handoff contract for the standalone HRMS backend. It combines the generated OpenAPI snapshot with frontend-facing business rules and Codex guardrails.

## Runtime URLs

| Purpose                 | URL                                         |
| ----------------------- | ------------------------------------------- |
| Local/QA API base       | `http://localhost:3101`                     |
| Swagger UI              | `http://localhost:3101/docs`                |
| OpenAPI JSON            | `http://localhost:3101/api/v1/openapi.json` |
| Static OpenAPI snapshot | `docs/api/frontend-contract/openapi.json`   |

Production base URLs must come from environment/config. Do not hard-code localhost into production builds.

## File Map

| File                               | Use                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `openapi.json`                     | Machine-readable API contract for client/type generation.                                                                |
| `ENDPOINT_INDEX.md`                | Generated operation-by-operation detail for all public API operations.                                                   |
| `BUSINESS_RULES.md`                | Cross-cutting auth, RBAC, pagination, OCC, rate-limit, document, audit, finance, asset, timesheet, and report rules.     |
| `EXPENSE_FINANCE_FLOW.md`          | Manager -> Finance expense workflow, statuses, actors, blocked actions, and document gates.                              |
| `FRONTEND_BACKEND_GAP_AUDIT.md`    | Feature-wise frontend route coverage, backend gaps, and keep/change/add/remove decisions.                                |
| `BACKEND_API_COMPLETION_REPORT.md` | Docs-only backend completion plan for implemented APIs and the remaining 94 planned APIs after the Phase 3 EMS slice. |
| `FRONTEND_CODEX_NOTES.md`          | Direct notes for frontend engineers using Codex.                                                                         |
| `FRONTEND_QA_CHECKLIST.md`         | Manual frontend integration scenarios by persona/module.                                                                 |

## Consumer Rules

- All business routes are under `/api/v1`; health also exposes `/health/live` and `/health/ready`.
- Browser clients may use the HttpOnly session cookie. API/mobile clients should send `Authorization: Bearer <access_token>`.
- Frontend clients must call Fastify APIs only. Do not access PostgreSQL, Valkey, MinIO/S3, Drizzle, or migrations.
- Money values are strings, timestamps are ISO 8601, and UUIDs are strings.
- List views must use backend pagination.
- Workflow mutations use `expected_version`; handle `409` by refetching latest state.
- Document files and download URLs must go through backend APIs. Never call object storage directly.
- Frontend role checks are UX only. Backend RBAC/ABAC remains authoritative.

## Planned API Reports

- Planned APIs documented in `BACKEND_API_COMPLETION_REPORT.md` are not implemented until they appear in `openapi.json`.
- Frontend teams should keep those features mocked or behind integration flags until the backend route, tests, and generated OpenAPI contract are complete.
