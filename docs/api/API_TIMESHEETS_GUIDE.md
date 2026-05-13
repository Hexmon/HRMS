# API Timesheets Guide

Date: 2026-05-01

Timesheet APIs support work segments, submission cycles, approver queues, approval decisions, and workflow definitions.

## Work Segments

Create:

```json
{
  "work_date": "2026-06-01",
  "project_code": "QA-PRJ-001",
  "task_code": "QA-TASK-001",
  "hours": "8.00",
  "description": "Implementation work",
  "billable": true
}
```

Endpoints:

- `POST /api/v1/timesheets/work-segments`
- `GET /api/v1/timesheets/work-segments?page=1&page_size=25`

## Submissions

Submit cycle:

```json
{
  "cycle_start": "2026-06-01",
  "cycle_end": "2026-06-07"
}
```

Endpoints:

- `POST /api/v1/timesheets/submissions`
- `GET /api/v1/timesheets/submissions/my`
- `GET /api/v1/timesheets/queue/approver`

## Approval

`POST /api/v1/timesheets/submissions/{id}/approve`

```json
{
  "decision": "approve",
  "remarks": "Approved.",
  "expected_version": 1
}
```

Reject/return require remarks. Stale `expected_version` returns `409`.

## Workflow Definitions

- `GET /api/v1/timesheets/workflow-definitions`
- `POST /api/v1/timesheets/workflow-definitions`

Admin role is required for upsert.
