# Endpoint Index

This file is generated from `docs/api/openapi.json` by `pnpm api:frontend-contract:generate`.

OpenAPI title: HRMS/ERP API

OpenAPI version: 0.1.0

Documented operations: 68

Use `openapi.json` for exact schemas and this index for frontend behavior notes.

## Platform / Health

Health and OpenAPI routes support runtime readiness checks and API tooling.

### GET /health/live

| Field | Contract |
|---|---|
| Purpose | Liveness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /health/ready

| Field | Contract |
|---|---|
| Purpose | Readiness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/health/live

| Field | Contract |
|---|---|
| Purpose | Versioned liveness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/health/ready

| Field | Contract |
|---|---|
| Purpose | Versioned readiness check |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/openapi.json

| Field | Contract |
|---|---|
| Purpose | OpenAPI JSON |
| Frontend use | Runtime status, deployment diagnostics, or API tooling. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public health/OpenAPI surface only; no sensitive config values. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Auth & Sessions

Authentication uses one platform session. Browser clients may rely on the HttpOnly cookie; API clients should use bearer tokens.

### POST /api/v1/auth/login

| Field | Contract |
|---|---|
| Purpose | Login |
| Frontend use | Login form. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public login; protected session routes require token/cookie. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string<email> | required | Seeded local QA user email. Example is the Finance Manager persona. |
| `password` | string<password> | required | Local Docker QA demo password. Never send this in URLs or logs.; minLength 8 |
| `employee_code` | string | optional | DEV-only fallback for legacy local QA scripts. Primary UI and consumer docs use email/password.; minLength 1 |



Example:

```json
{
  "email": "finance@example.test",
  "password": "LocalDev@123"
}
```

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Invalid email/password or inactive session. |
| `403` | Inactive or blocked user if policy denies login. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | object | required | - |
| `access_token` | string | required | JWT access token for API clients. Do not hard-code this value. |
| `expires_at` | string<date-time> | required | Session expiration timestamp |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/auth/logout

| Field | Contract |
|---|---|
| Purpose | Logout |
| Frontend use | Logout action. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/auth/me

| Field | Contract |
|---|---|
| Purpose | Current session |
| Frontend use | Session bootstrap, route guards, topbar user menu, and role-aware navigation. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Authenticated current user only. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | object | required | - |
| `active_role` | object | required | - |
| `available_roles` | array of object | required | - |
| `permissions` | array of string | required | - |
| `navigation` | array of object | required | - |
| `company` | object | required | - |
| `preferences` | object | required | - |
| `session_metadata` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Core / Employees & Hierarchy

Core APIs expose active employee identity and hierarchy context for role-aware frontend screens.

### GET /api/v1/core/users

| Field | Contract |
|---|---|
| Purpose | List users |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `q` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `designation_id` | query | no | string<uuid> | - |
| `role` | query | no | string | - |
| `employment_status` | query | no | string enum("active", "inactive", "terminated", "suspended") | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `login_state` | query | no | string enum("enabled", "disabled") | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/{id}

| Field | Contract |
|---|---|
| Purpose | Get user |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Authenticated user UUID |
| `employee_code` | string | required | - |
| `email` | string<email> | required | - |
| `full_name` | string | required | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `designation_id` | string<uuid> | optional | Designation UUID |
| `manager_user_id` | string<uuid> | optional, nullable | Manager user UUID |
| `hierarchy_path` | string | optional | - |
| `employment_status` | string | optional | - |
| `timezone` | string | optional | - |
| `roles` | array of string | required | - |
| `department` | object | required, nullable | - |
| `designation` | object | required, nullable | - |
| `manager` | object | required, nullable | - |
| `display_label` | string | required | - |
| `status` | string | required | - |
| `login_state` | string enum("enabled", "disabled") | required | - |
| `role_labels` | array of string | required | - |
| `reporting_line` | array of object | required | - |
| `role_assignments` | array of object | required | - |
| `direct_reports_summary` | object | required | - |
| `documents_summary` | object | required | - |
| `assets_summary` | object | required | - |
| `attendance_summary` | object | required | - |
| `leave_summary` | object | required | - |
| `timesheet_summary` | object | required | - |
| `expense_summary` | object | required | - |
| `profile_tabs_available` | array of string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/core/users/{id}/subtree

| Field | Contract |
|---|---|
| Purpose | Hierarchy subordinate subtree |
| Frontend use | Employee directory, hierarchy, selectors, and audit context. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/HR/Auditor broad read; other users scoped to self or own hierarchy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `total_active_descendants` | integer | required | Total active, non-deleted descendants under the requested root.; minimum 0 |
| `max_depth` | integer | required | Deepest relative level returned in the full active subtree.; minimum 0 |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Admin / Configuration

Configuration APIs are admin-only operational surfaces for finance governance, manager backups, and workflow definitions.

### GET /api/v1/platform/finance-governance

| Field | Contract |
|---|---|
| Purpose | Read finance governance configuration |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PUT /api/v1/platform/finance-governance

| Field | Contract |
|---|---|
| Purpose | Update finance governance configuration |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `primary_finance_manager_user_id` | string<uuid> | required | Configured primary finance manager UUID |
| `manager_backup_user_id` | string<uuid> | required, nullable | Configured manager backup UUID |
| `finance_approval_backup_user_id` | string<uuid> | required, nullable | Configured finance backup UUID |
| `effective_from` | string<date> | required | Effective from |
| `effective_to` | string<date> | optional, nullable | Effective to |
| `status` | string enum("active", "inactive") | required | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/manager-backups

| Field | Contract |
|---|---|
| Purpose | List manager backups |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/manager-backups

| Field | Contract |
|---|---|
| Purpose | Create manager backup |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `employee_user_id` | string<uuid> | required | Employee user UUID |
| `backup_manager_user_id` | string<uuid> | required | Backup manager user UUID |
| `effective_from` | string<date> | required | Effective from |
| `effective_to` | string<date> | optional | Effective to |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### DELETE /api/v1/manager-backups/{id}

| Field | Contract |
|---|---|
| Purpose | Revoke manager backup |
| Frontend use | Admin configuration for finance governance and backup routing. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `expected_version` | query | no | integer | minimum 1 |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/workflow-definitions

| Field | Contract |
|---|---|
| Purpose | Upsert workflow definition |
| Frontend use | Upsert workflow definition |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Admin/configuration persona only unless backend grants narrower operational permission. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | required | - |
| `definition` | object | required | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Expenses / Requester

Requester APIs power employee expense self-service.

### POST /api/v1/expenses

| Field | Contract |
|---|---|
| Purpose | Create expense |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `submit` | boolean | optional | When true, route immediately into the approval workflow.; default false |
| `expense_type` | string enum("Project", "SalesPreSales") | required | - |
| `expense_sub_type` | string | required | - |
| `project_code` | string | optional | Required for Project expenses. |
| `client_name` | string | optional | Required for Sales/Pre-Sales expenses. |
| `task_title` | string | required | minLength 1 |
| `task_description` | string | required | minLength 1 |
| `location` | string | optional | - |
| `start_date` | string<date> | required | Expense start date |
| `end_date` | string<date> | required | Expense end date |
| `estimated_amount` | string | required | Total estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | required | - |
| `advance_amount` | string | optional | Requested advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `advance_justification` | string | optional | - |
| `line_items` | array of object | required | minItems 1 |



Example:

```json
{
  "submit": true,
  "expense_type": "Project",
  "expense_sub_type": "Project Travel",
  "project_code": "PRJ-100",
  "task_title": "Client implementation travel",
  "task_description": "Travel for implementation workshop",
  "location": "Mumbai",
  "start_date": "2026-05-01",
  "end_date": "2026-05-03",
  "estimated_amount": "1000.00",
  "payment_type": "Advance",
  "advance_amount": "500.00",
  "line_items": [
    {
      "line_category": "travel",
      "description": "Flight",
      "line_total": "700.00"
    },
    {
      "line_category": "lodging",
      "description": "Hotel",
      "line_total": "300.00"
    }
  ]
}
```

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/my

| Field | Contract |
|---|---|
| Purpose | My expenses |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}

| Field | Contract |
|---|---|
| Purpose | Expense detail |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### PATCH /api/v1/expenses/{id}

| Field | Contract |
|---|---|
| Purpose | Edit expense placeholder |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

Schema: `object`.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Edit endpoint is intentionally restricted in this delivery. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/submit

| Field | Contract |
|---|---|
| Purpose | Submit expense |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}/timeline

| Field | Contract |
|---|---|
| Purpose | Expense workflow timeline |
| Frontend use | Employee expense self-service: create, drafts, my expenses, detail, returned/held work, and timeline. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Requester-owned records plus backend-approved manager/finance/admin/auditor read scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_type` | string | required | - |
| `label` | string | required | - |
| `stage` | string enum("requester", "manager", "finance", "documents", "closure") | required | - |
| `actor_user_id` | string<uuid> | required | Actor user UUID |
| `actor_name` | string | required | - |
| `timestamp` | string<date-time> | required | Timeline event timestamp |
| `remarks` | string | required, nullable | - |
| `status_from` | string | required, nullable | - |
| `status_to` | string | required, nullable | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Expenses / Manager

Manager APIs power relationship-based verification. A manager role is not required; backend resolves direct manager or configured backup.

### GET /api/v1/expenses/queue/manager

| Field | Contract |
|---|---|
| Purpose | Manager queue |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Assigned direct manager or valid manager backup; requester self-verification is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/manager/verify

| Field | Contract |
|---|---|
| Purpose | Manager verification decision |
| Frontend use | `/finance/manager` verification workspace. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Assigned direct manager or valid manager backup; requester self-verification is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | Required for reject/return decisions. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Manager return/reject require remarks; requester self-verification is blocked server-side.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/documents/{documentId}/verify

| Field | Contract |
|---|---|
| Purpose | Verify expense document |
| Frontend use | Verify expense document |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Assigned direct manager or valid manager backup; requester self-verification is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |
| `documentId` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Finance Management

Finance APIs handle queue, approval, payment release, bills, settlement, audit, dashboard, and analytics.

### GET /api/v1/expenses/queue/finance

| Field | Contract |
|---|---|
| Purpose | Finance queue |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string enum("sla", "created_at", "amount", "status") | default "sla" |
| `status` | query | no | string enum("Manager Verified", "Finance Hold", "Clarification Required", "Finance Approved", "Payment Released", "Bills Submitted", "Pending Adjustment", "Closed") | - |
| `requester` | query | no | string | - |
| `department` | query | no | string | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `payment_type` | query | no | string enum("Advance", "ReimbursementAccrued") | - |
| `expense_type` | query | no | string enum("Project", "SalesPreSales") | - |
| `expense_sub_type` | query | no | string | - |
| `amount_min` | query | no | string | pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `amount_max` | query | no | string | pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `document_status` | query | no | string enum("any", "complete", "missing") | default "any" |
| `sla_bucket` | query | no | string enum("any", "0-24h", "24-72h", "72h-plus") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}/finance-detail

| Field | Contract |
|---|---|
| Purpose | Finance ticket detail |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/finance/approve

| Field | Contract |
|---|---|
| Purpose | Finance approve or hold |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("verify", "hold", "clarification") | required | - |
| `remarks` | string | optional | Required for hold or clarification. |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Finance approval starts only after manager verification; hold/clarification-style decisions require remarks.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/finance/payment

| Field | Contract |
|---|---|
| Purpose | Release payment |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `payment_date` | string<date> | required | Payment release date |
| `amount` | string | required | Payment amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_mode` | string | required | minLength 1 |
| `reference_no` | string | required | minLength 1 |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/bills

| Field | Contract |
|---|---|
| Purpose | Submit bills |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/settlement

| Field | Contract |
|---|---|
| Purpose | Approve settlement |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `actual_amount` | string | required | Actual submitted/verified expense amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Expense ticket UUID |
| `ticket_no` | string | required | - |
| `requester_user_id` | string<uuid> | required | Requester user UUID |
| `requester_role_snapshot` | string | optional | - |
| `department_id` | string<uuid> | optional | Department UUID |
| `expense_type` | string enum("Project", "SalesPreSales") | optional | - |
| `expense_sub_type` | string enum("Project Travel", "Material Consumables", "Lodging & Boarding", "Client Meeting", "Demo / Presentation", "Marketing Event", "Sales Travel", "Misc Sales Expense") | optional | - |
| `project_code` | string | optional, nullable | - |
| `client_name` | string | optional, nullable | - |
| `task_title` | string | optional | - |
| `estimated_amount` | string | optional | Estimated amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_type` | string enum("Advance", "ReimbursementAccrued") | optional | - |
| `advance_amount` | string | optional, nullable | Advance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `actual_amount` | string | optional, nullable | Actual amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `variance_amount` | string | optional, nullable | Settlement variance amount; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `payment_reference_no` | string | optional, nullable | - |
| `assigned_finance_actor_user_id` | string<uuid> | optional, nullable | Assigned finance-stage actor UUID |
| `manager_verifier_id` | string<uuid> | optional, nullable | Assigned manager verifier UUID |
| `manager_verifier_label` | string | optional, nullable | - |
| `finance_approver_id` | string<uuid> | optional, nullable | Assigned finance approver UUID |
| `finance_approver_label` | string | optional, nullable | - |
| `assigned_finance_actor_label` | string | optional, nullable | - |
| `primary_finance_manager_user_id` | string<uuid> | optional, nullable | Configured primary finance manager UUID |
| `primary_finance_manager_label` | string | optional, nullable | - |
| `finance_approval_backup_user_id` | string<uuid> | optional, nullable | Configured fallback finance approver UUID |
| `finance_backup_applied` | boolean | optional | True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup. |
| `governance_warning_codes` | array of string | optional | Route/governance warning markers preserved from the ticket route snapshot. |
| `status` | string | required | - |
| `version` | integer | required | minimum 1 |
| `created_at` | string<date-time> | optional | Creation timestamp |

Only the first 30 top-level fields are listed here; use `openapi.json` for the full schema.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/expenses/{id}/audit

| Field | Contract |
|---|---|
| Purpose | Expense audit log |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/finance-dashboard

| Field | Contract |
|---|---|
| Purpose | Finance dashboard dataset |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | optional | - |
| `cards` | array of object | required | - |
| `filters` | object | required | - |
| `aging_buckets` | array of object | required | - |
| `payable_totals` | object | required | - |
| `exception_counts` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/finance-history

| Field | Contract |
|---|---|
| Purpose | Finance action history |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/finance-analytics

| Field | Contract |
|---|---|
| Purpose | Finance analytics |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**

No path or query parameters.

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `generated_at` | string<date-time> | required | Report generation timestamp |
| `cards` | array of object | required | - |
| `aging_buckets` | array of object | required | - |
| `payable_totals` | object | required | - |
| `exception_counts` | object | required | - |
| `summary` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/advance-aging

| Field | Contract |
|---|---|
| Purpose | Advance aging report |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/payments

| Field | Contract |
|---|---|
| Purpose | Payment register |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/audit

| Field | Contract |
|---|---|
| Purpose | Finance audit report |
| Frontend use | Finance dashboard, queue, ticket detail, payments, bills, settlement, audit, and reports. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Finance Manager or configured Finance/Admin backup; requester self-processing is blocked. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Documents

Document APIs manage metadata and authorized object-storage access. The frontend never talks to object storage directly.

### GET /api/v1/documents

| Field | Contract |
|---|---|
| Purpose | List documents |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `business_object_type` | query | no | string | - |
| `business_object_id` | query | no | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/documents

| Field | Contract |
|---|---|
| Purpose | Upload document metadata |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**

No path or query parameters.

**Request body**

Document binary is handled through the backend object-storage adapter. Do not send object-storage credentials.

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | minLength 1 |
| `file_name` | string | required | minLength 1 |
| `mime_type` | string | required | minLength 1 |
| `size_bytes` | integer | required | minimum 1 |
| `checksum_sha256` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/expenses/{id}/documents

| Field | Contract |
|---|---|
| Purpose | Upload expense document |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Document binary is handled through the backend object-storage adapter. Do not send object-storage credentials.

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | minLength 1 |
| `file_name` | string | required | minLength 1 |
| `mime_type` | string | required | minLength 1 |
| `size_bytes` | integer | required | minimum 1 |
| `checksum_sha256` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/documents/{id}

| Field | Contract |
|---|---|
| Purpose | Document metadata |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/documents/{id}/download-url

| Field | Contract |
|---|---|
| Purpose | Create download URL |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string<uri> | required | - |
| `expires_at` | string<date-time> | required | Download URL expiration |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Download URLs are short-lived sensitive values; do not log or persist them.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/documents/{id}/verify

| Field | Contract |
|---|---|
| Purpose | Verify document |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Document metadata UUID |
| `business_object_type` | string | required | - |
| `business_object_id` | string<uuid> | required | Business object UUID |
| `classification` | string enum("normal", "finance", "medical", "compensation", "legal", "audit") | required | - |
| `document_type` | string | required | - |
| `file_name` | string | optional | - |
| `mime_type` | string | optional | - |
| `size_bytes` | integer | optional | minimum 1 |
| `verification_status` | string | optional | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/documents/{id}/access-log

| Field | Contract |
|---|---|
| Purpose | Document access log |
| Frontend use | Document upload, list, metadata, download URL, verification, and access-log widgets. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Classification and business-object policy apply; storage credentials are never exposed. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Use backend document APIs only; never expose object-storage credentials or direct bucket paths.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Reports & Analytics

Reports are role-scoped API-backed datasets and export requests.

### GET /api/v1/reports/expenses/my

| Field | Contract |
|---|---|
| Purpose | My expense report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |
| `cards` | array of object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/manager-queue

| Field | Contract |
|---|---|
| Purpose | Manager queue report |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | optional | - |
| `cards` | array of object | required | - |
| `filters` | object | required | - |
| `queue_counts` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/manager-history

| Field | Contract |
|---|---|
| Purpose | Manager action history |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `summary` | object | required | - |
| `filters` | object | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/reports/expenses/register

| Field | Contract |
|---|---|
| Purpose | Expense register |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |
| `status` | query | no | string | - |
| `expense_type` | query | no | string | - |
| `expense_sub_type` | query | no | string | - |
| `payment_type` | query | no | string | - |
| `department_id` | query | no | string<uuid> | - |
| `requester_user_id` | query | no | string<uuid> | - |
| `manager_user_id` | query | no | string<uuid> | - |
| `finance_user_id` | query | no | string<uuid> | - |
| `date_from` | query | no | string<date> | - |
| `date_to` | query | no | string<date> | - |
| `document_status` | query | no | string enum("any", "complete", "missing", "pending", "not_required") | default "any" |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |
| `totals` | object | required | - |
| `filters` | object | required | - |
| `export_columns` | array of string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Expense money values are decimal strings; do not use floating-point math for persisted amounts.
- Closed expense tickets are read-only unless a future correction API explicitly allows edits.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/reports/exports

| Field | Contract |
|---|---|
| Purpose | Create export job |
| Frontend use | Report tables, filters, analytics panels, and export jobs. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Role-scoped report datasets; finance/audit reports require finance/admin/auditor scope. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | string enum("csv", "xlsx") | optional | default "csv" |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `export_id` | string | required | - |
| `format` | string | required | - |
| `status` | string | required | - |
| `adapter` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Assets

Asset APIs cover inventory, assignment/return, safe QR scan, and software license lifecycle.

### GET /api/v1/assets/

| Field | Contract |
|---|---|
| Purpose | List assets |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/

| Field | Contract |
|---|---|
| Purpose | Create asset |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional | - |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/assets/{id}

| Field | Contract |
|---|---|
| Purpose | Asset detail |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/{id}/assign

| Field | Contract |
|---|---|
| Purpose | Assign asset |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `assigned_to_user_id` | string<uuid> | required | Employee user UUID |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/{id}/return

| Field | Contract |
|---|---|
| Purpose | Return asset |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `expected_version` | integer | required | Optimistic concurrency version from the latest aggregate read.; minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string<uuid> | required | Asset UUID |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `serial_no` | string | optional, nullable | - |
| `qr_hash` | string | optional | - |
| `status` | string | required | - |
| `assigned_to_user_id` | string<uuid> | optional, nullable | Assigned employee UUID |
| `version` | integer | required | minimum 1 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/scan/{qr_hash}

| Field | Contract |
|---|---|
| Purpose | Safe QR scan |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Public. No bearer token or session cookie required. |
| Roles/scope | Public safe QR scan returns limited data only. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `qr_hash` | path | yes | string | minLength 1 |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `qr_hash` | string | required | - |
| `asset_code` | string | required | - |
| `asset_type` | string | required | - |
| `name` | string | required | - |
| `status` | string | required | - |
| `assigned` | string | required | - |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/licenses/activate

| Field | Contract |
|---|---|
| Purpose | Activate license |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `product_id` | string<uuid> | required | Software product UUID |
| `entitlement_id` | string<uuid> | required | Entitlement UUID |
| `hardware_fingerprint` | string | required | minLength 8 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/licenses/validate

| Field | Contract |
|---|---|
| Purpose | Validate license |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `product_id` | string<uuid> | required | Software product UUID |
| `hardware_fingerprint` | string | required | minLength 8 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/assets/licenses/revoke

| Field | Contract |
|---|---|
| Purpose | Revoke license/device |
| Frontend use | Asset inventory, assignment/return, QR scan, and software license screens. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Asset Manager/Admin for mutations; scoped read/audit by policy. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `hardware_fingerprint` | string | required | minLength 8 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Outbox / Platform Events

Platform event routes are protected runtime integrations and should not be exposed as normal UI actions.

### POST /api/v1/assets/events/employee-terminated

| Field | Contract |
|---|---|
| Purpose | Consume employee terminated event |
| Frontend use | Consume employee terminated event |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Protected runtime/platform event consumer; not a normal frontend screen API. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `employee_user_id` | string<uuid> | required | Terminated employee UUID |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Runtime integration route; do not expose as a normal user-facing frontend action.
- Respect `429` and `Retry-After`; never build tight retry loops.

## Timesheets

Timesheet APIs cover work segments, submissions, approver queues, decisions, and workflow definitions.

### GET /api/v1/timesheets/work-segments

| Field | Contract |
|---|---|
| Purpose | List work segments |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/work-segments

| Field | Contract |
|---|---|
| Purpose | Create work segment |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `work_date` | string<date> | required | Work date |
| `project_code` | string | optional | - |
| `task_code` | string | optional | - |
| `hours` | string | required | Hours as fixed precision decimal; pattern ^-?\d{1,12}(\.\d{1,2})?$ |
| `description` | string | optional | - |
| `billable` | boolean | optional | default false |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/submissions

| Field | Contract |
|---|---|
| Purpose | Submit timesheet cycle |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**

No path or query parameters.

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `cycle_start` | string<date> | required | Cycle start |
| `cycle_end` | string<date> | required | Cycle end |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/submissions/my

| Field | Contract |
|---|---|
| Purpose | My timesheet submissions |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/queue/approver

| Field | Contract |
|---|---|
| Purpose | Approver queue |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.

### POST /api/v1/timesheets/submissions/{id}/approve

| Field | Contract |
|---|---|
| Purpose | Timesheet decision |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `id` | path | yes | string<uuid> | - |

**Request body**

Content type: `application/json`

Required: yes

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string enum("approve", "reject", "return") | required | - |
| `remarks` | string | optional | - |
| `expected_version` | integer | required | minimum 1 |

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

Schema: `object`.

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- OCC mutation: send `expected_version`; on `409`, refetch latest object/version and ask the user to retry.
- Respect `429` and `Retry-After`; never build tight retry loops.

### GET /api/v1/timesheets/workflow-definitions

| Field | Contract |
|---|---|
| Purpose | List workflow definitions |
| Frontend use | Work segment entry, submissions, approver queue, decisions, and workflow definition admin. |
| Auth | Protected. Send either the HttpOnly session cookie or `Authorization: Bearer <access_token>`. |
| Roles/scope | Employees manage own work; configured approvers action queues; Admin manages definitions. |

**Path/query parameters**
| Name | In | Required | Type | Notes |
|---|---|---:|---|---|
| `page` | query | no | integer | default 1; minimum 1 |
| `page_size` | query | no | integer | default 25; minimum 1 |
| `sort` | query | no | string | - |

**Request body**

No request body.

**Responses**
| Status | Meaning |
|---|---|
| `200` | Successful response. |
| `400` | Validation failed or invalid business request. |
| `401` | Authentication required or invalid session. |
| `403` | Authenticated actor is not allowed to perform this action. |
| `404` | Resource not found. |
| `409` | Optimistic concurrency conflict. |
| `429` | Rate limit exceeded. Retry after the documented delay. |
| `500` | Unhandled server error. |

Success body highlights:

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | required | - |
| `page` | integer | required | minimum 1 |
| `page_size` | integer | required | minimum 1 |
| `total` | integer | required | minimum 0 |

**Frontend behavior notes**

- Display backend `message` and retain `request_id` for support.
- Treat `401` as authentication failure and `403` as real permission denial.
- Paginated list: send `page` and `page_size`; do not fetch unbounded lists.
- Respect `429` and `Retry-After`; never build tight retry loops.
