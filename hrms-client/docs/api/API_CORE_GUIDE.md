# API Core Guide

Date: 2026-05-01

Core APIs expose employee identity, role context, departments, designations, and hierarchy lookup for management views. Consumers must treat the backend response as the authorization source of truth.

## Hierarchy Subtree

`GET /api/v1/core/users/{id}/subtree?page=1&page_size=25`

Purpose: returns active, non-deleted descendants under the requested user. This is the hierarchy/subordinate lookup used by manager and shell management summaries.

Authorization:

- Admin, HR Manager, and Auditor may inspect any active root.
- Other authenticated users may inspect self or a root inside their own hierarchy path.
- Out-of-hierarchy roots return `403`.
- Inactive or deleted roots are not returned as subtree roots.

Response shape:

```json
{
  "items": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "employee_code": "E1",
      "full_name": "Employee One",
      "roles": ["Employee"],
      "hierarchy_path": "CEO.D1.E1",
      "employment_status": "active",
      "depth": 1
    }
  ],
  "page": 1,
  "page_size": 25,
  "total": 1,
  "total_active_descendants": 1,
  "max_depth": 1,
  "summary": {
    "root_user_id": "00000000-0000-0000-0000-000000000001",
    "root_employee_code": "D1",
    "root_full_name": "Delivery Manager",
    "total_active_descendants": 1,
    "max_depth": 1
  }
}
```

Consumer notes:

- `depth` is relative to the requested root. Direct reports are `1`.
- `total` is preserved for existing pagination clients.
- `total_active_descendants` is the same count with clearer management-dashboard meaning.
- Do not infer permission from a visible hierarchy card; handle `403` and `401` from the API.

## User Lookup

`GET /api/v1/core/users?page=1&page_size=25&q=E1`

Returns active users for authorized modules and admin workflows. Use `q` for employee code, name, or email search. List consumers must keep pagination controls visible.

`GET /api/v1/core/users/{id}`

Returns one Core employee/user record. Do not use this endpoint to bypass object-level module policies.
