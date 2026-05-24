# API Reports Guide

Date: 2026-05-01

Reports are role-scoped. Finance and Auditor personas can read finance operational reports; employees see own data.

## Expense Reports

- `GET /api/v1/reports/expenses/my`
- `GET /api/v1/reports/expenses/manager-queue`
- `GET /api/v1/reports/expenses/manager-history`
- `GET /api/v1/reports/expenses/register`

All list reports support `page` and `page_size`.

## Finance Reports

- `GET /api/v1/reports/expenses/finance-dashboard`
- `GET /api/v1/reports/expenses/finance-analytics`
- `GET /api/v1/reports/expenses/advance-aging`
- `GET /api/v1/reports/expenses/payments`
- `GET /api/v1/reports/expenses/audit`

Finance analytics powers the enterprise cockpit and includes summary counts, charts, risk indicators, and high-value watchlists.

## Export Readiness

`POST /api/v1/reports/exports`

```json
{
  "report_type": "hr/employees",
  "format": "csv",
  "filters": {
    "status": "active"
  }
}
```

CSV and XLSX report exports now generate document-backed files in object storage and return `download_document_id` for secure download through the Documents API. Scheduled reports, retention policy automation, and external accounting-provider export targets remain production hardening/HIR scope.
