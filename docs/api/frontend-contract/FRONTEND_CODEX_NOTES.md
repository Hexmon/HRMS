# Notes For Frontend Engineers Using Codex

Use this file as prompt context when asking Codex to build HRMS frontend screens.

## Hard Rules

- Do not invent routes. Use only `docs/api/frontend-contract/openapi.json` and `ENDPOINT_INDEX.md`.
- Do not query PostgreSQL, Drizzle, Valkey, Cloudinary, migrations, or backend repositories from frontend code.
- Do not put production secrets, bearer tokens, cookies, signed download URLs, or database URLs into prompts, logs, fixtures, screenshots, or committed files.
- Preserve Manager -> Finance vocabulary. Do not recreate legacy reviewer/director queues, labels, or approval pages.
- Keep frontend role checks as UX hints only; backend RBAC/ABAC is authoritative.
- Always surface or retain `request_id` from API errors.
- Handle `409` with refetch-and-retry UX. Handle `429` with `Retry-After`.
- Treat money as decimal strings; do not use JavaScript floating-point math for persisted finance amounts.
- Use backend-generated document URLs only at the moment of download/preview; never store them long-term.

## Recommended Codex Prompt Context

When asking Codex to implement a screen, include:

1. The target frontend route/screen name.
2. The exact API operations from `ENDPOINT_INDEX.md`.
3. The relevant business rules from `BUSINESS_RULES.md` or `EXPENSE_FINANCE_FLOW.md`.
4. The desired loading, empty, error, `403`, `409`, and `429` behavior.
5. A statement that the frontend must consume Fastify APIs only.

## Screen Implementation Checklist

- Fetch session from `GET /api/v1/auth/me` or existing app session state.
- Use typed API clients generated from `openapi.json` where possible.
- Add pagination controls for list endpoints.
- Read and pass `version`/`expected_version` for workflow mutations.
- Use toasts or inline errors for backend validation messages.
- Refetch after mutations instead of manually guessing next backend state.
- Keep object storage and internal infrastructure invisible to the browser.
