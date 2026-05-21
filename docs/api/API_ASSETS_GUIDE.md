# API Assets Guide

Date: 2026-05-01

Asset APIs cover inventory, assignment/recovery, safe QR scan, and license flows.

## Public Safe QR Scan

`POST /api/v1/assets/scan/{qr_hash}`

Example:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/assets/scan/release-qr-hash-lap-available"
```

The safe scan response intentionally omits internal UUIDs, cost, and sensitive metadata.

## Inventory

- `GET /api/v1/assets/?page=1&page_size=25`
- `POST /api/v1/assets/`
- `GET /api/v1/assets/{id}`

Create:

```json
{
  "asset_code": "LAP-001",
  "asset_type": "Laptop",
  "name": "ThinkPad T-Series",
  "serial_no": "SN-001"
}
```

## Assignment And Return

Assign:

```json
{
  "assigned_to_user_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001",
  "expected_version": 1
}
```

Return:

```json
{
  "expected_version": 2
}
```

Assignment/return are protected and use OCC. Asset/Admin role is required.

## License APIs

- `POST /api/v1/assets/licenses/activate`
- `POST /api/v1/assets/licenses/validate`
- `POST /api/v1/assets/licenses/revoke`

Activate:

```json
{
  "product_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001",
  "entitlement_id": "018f9f4a-7f9a-7c15-8f25-6f7f96f9f002",
  "hardware_fingerprint": "HW-FINGERPRINT-001"
}
```

Revoke is protected and supports compromised hardware/key workflows.
