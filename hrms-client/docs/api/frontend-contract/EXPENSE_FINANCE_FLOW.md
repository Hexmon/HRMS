# Expense And Finance Flow Contract

## Active Workflow

The active workflow vocabulary is Manager -> Finance:

1. Employee creates a draft or submitted expense request.
2. Assigned manager or configured manager backup verifies, returns, or rejects.
3. Finance Manager or configured Finance/Admin backup approves or holds after manager verification.
4. Finance releases payment where applicable.
5. Bills/documents are submitted through backend document APIs.
6. Manager or valid manager backup verifies required expense documents.
7. Finance settlement closes or adjusts the ticket.

Legacy reviewer/director approval vocabulary is not an active frontend contract. Do not build frontend routes, labels, queues, or actions around that old model.

## Status Labels

| Status                       | Frontend meaning                                                       |
| ---------------------------- | ---------------------------------------------------------------------- |
| Pending Manager Verification | Submitted by employee and waiting for manager action.                  |
| Manager Returned             | Manager returned the request; requester must revise or respond.        |
| Manager Rejected             | Manager rejected the request; no finance approval.                     |
| Manager Verified             | Manager approved verification; finance can process next.               |
| Finance Approved             | Finance approved the request for payment/document/settlement flow.     |
| Payment Released             | Payment was released by finance.                                       |
| Bills Submitted              | Bills/documents were submitted for verification.                       |
| Pending Adjustment           | Settlement found payable/recoverable/no-balance adjustment work.       |
| Closed                       | Ticket is closed/read-only except backend-authorized correction notes. |

## Frontend Screens And API Mapping

| Screen/workspace      | APIs                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| Raise Expense Request | `POST /api/v1/expenses`                                                           |
| My Expenses           | `GET /api/v1/expenses/my`, `GET /api/v1/reports/expenses/my`                      |
| Request Detail        | `GET /api/v1/expenses/{id}`, `GET /api/v1/expenses/{id}/timeline`                 |
| Manager Workspace     | `GET /api/v1/expenses/queue/manager`, `POST /api/v1/expenses/{id}/manager/verify` |
| Finance Queue         | `GET /api/v1/expenses/queue/finance`                                              |
| Finance Ticket Detail | `GET /api/v1/expenses/{id}/finance-detail`, `GET /api/v1/expenses/{id}/audit`     |
| Finance Approval      | `POST /api/v1/expenses/{id}/finance/approve`                                      |
| Payment Release       | `POST /api/v1/expenses/{id}/finance/payment`                                      |
| Bills/Documents       | `POST /api/v1/expenses/{id}/documents`, `POST /api/v1/expenses/{id}/bills`        |
| Document Verification | `POST /api/v1/expenses/{id}/documents/{documentId}/verify`                        |
| Settlement            | `POST /api/v1/expenses/{id}/settlement`                                           |
| Finance Reports       | finance dashboard/history/analytics/aging/payments/audit report APIs              |

## Required Frontend Behaviors

- Always send `expected_version` on workflow mutations that require it.
- Disable action buttons while a mutation is in flight, then refetch detail/queue data after success.
- For `409`, show a stale-data message, refresh the record, and do not silently replay destructive actions.
- Require remarks in the UI for manager return/reject and finance hold/clarification-style decisions, but still handle backend `400` as authoritative.
- Hide finance actions from requesters, but also handle backend `403` because self-processing is blocked server-side.
- Treat timeline as display-safe history and audit as finance/auditor/admin-grade detail.
- Do not allow edit controls after `Closed` unless a future backend correction-note API explicitly supports it.

## Document Gate Notes

- Expense documents stay linked through backend document metadata and expense document APIs.
- Manager document verification is distinct from generic document verification.
- Settlement/closure can be blocked when required documents are missing or unverified.
- Document download URLs are sensitive and short-lived; do not put them into analytics events or persistent local storage.
