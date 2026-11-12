# API Documents Guide

Date: 2026-05-01

Documents are stored through the backend private object-storage adapter. Local and test environments use the in-memory adapter; every hosted environment must use a private Cloudflare R2 bucket with environment-isolated credentials. API consumers never receive storage credentials, object keys, bucket names, provider URLs, or provider metadata.

## List Documents

```bash
curl -sS "$API_BASE_URL/api/v1/documents?page=1&page_size=25" \
  -H "authorization: Bearer $TOKEN"
```

Optional filters:

- `business_object_type`
- `business_object_id`

## Upload Documents

`POST /api/v1/documents`

The endpoint accepts JSON metadata for generated/backend documents and `multipart/form-data` with a `file` field for browser uploads. Image files should be compressed by the frontend before upload. PDF files can be compressed server-side before object storage with `PDF_COMPRESSION_ENABLED=true` and Ghostscript available at `PDF_COMPRESSION_BINARY` (default `gs`). Private bytes are downloaded only through the authenticated backend content route after authorization.

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

`download-url` returns the authenticated backend content endpoint. It is not a bearer capability: every byte request rechecks current authorization, and it must not expose object-storage credentials or locations.

## Upload Compression

- Browser image uploads are prepared before the request to reduce client-to-server upload size on slower networks.
- Server-side PDF compression runs after the backend receives the file and before it stores the object. This reduces stored/downloaded PDF size but does not reduce the original browser-to-backend upload bandwidth.
- `PDF_COMPRESSION_FAIL_OPEN=true` keeps uploads available if Ghostscript is missing or cannot compress a file; the document metadata records whether compression was attempted, compressed, skipped, or failed.

## Classification

Document classification controls access. Known classifications include:

- `normal`
- `finance`
- `medical`
- `compensation`
- `legal`
- `audit`

Restricted medical/compensation documents should return `403` for unauthorized roles. HR/Admin roles can access according to backend policy.
