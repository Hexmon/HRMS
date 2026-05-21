# API Documents Guide

Date: 2026-05-01

Documents are metadata-first and object-storage-backed. API consumers never receive storage credentials.

## List Documents

```bash
curl -sS "$API_BASE_URL/api/v1/documents?page=1&page_size=25" \
  -H "authorization: Bearer $TOKEN"
```

Optional filters:

- `business_object_type`
- `business_object_id`

## Upload Metadata

`POST /api/v1/documents`

```json
{
  "business_object_type": "expense_ticket",
  "business_object_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001",
  "classification": "finance",
  "document_type": "receipt",
  "file_name": "receipt.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 2000,
  "checksum_sha256": "b94d27b9934d3e08a52e52d7da7dabfade"
}
```

Expense-scoped upload:

`POST /api/v1/expenses/{id}/documents`

The path ticket id becomes the business object id.

## Detail, Download, Verify, Access Log

- `GET /api/v1/documents/{id}`
- `POST /api/v1/documents/{id}/download-url`
- `POST /api/v1/documents/{id}/verify`
- `GET /api/v1/documents/{id}/access-log?page=1&page_size=25`

`download-url` returns a backend-generated short-lived URL. It must not expose object-storage access keys.

## Classification

Document classification controls access. Known classifications include:

- `normal`
- `finance`
- `medical`
- `compensation`
- `legal`
- `audit`

Restricted medical/compensation documents should return `403` for unauthorized roles. HR/Admin roles can access according to backend policy.
