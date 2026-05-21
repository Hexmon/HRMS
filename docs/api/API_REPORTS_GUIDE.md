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
  "format": "csv"
}
```

The current adapter is a local placeholder. Real accounting export target is HIR-004 and must not be enabled without a production finance decision.
