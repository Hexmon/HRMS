# Implementation Changelog

## Backend
- Aligned Manager/Reviewer compatibility and added explicit Director/Auditor frontend mappings.
- Hardened expense routing so Admin cannot self-process and independent Manager/Finance Manager routing is required.
- Added attendance check-in work-date grouping for cross-midnight sessions and weekly balance fields.
- Added read-only Admin leave calculation preview.
- Added department `cost_center` support and project over-allocation acknowledgement.
- Changed document deletion to hard-delete storage/metadata/link rows where safe while preserving immutable access logs.
- Enforced Cloudinary mock mode as local/dev/test only.
- Prevented non-local seed fallback by default.

## Frontend
- Changed QA/UAT/production email verification to require explicit confirmation.
- Added Director/Auditor role support and Manager-facing language for Reviewer compatibility.
- Added project cost-center autofill and over-allocation warning/acknowledgement UI.
- Added leave calculation preview UI in Admin Policies.
- Exposed attendance weekly balance fields on the employee attendance dashboard.

## Tests
- Updated expense and document/core/auth integration tests for the new routing and hard-delete behavior.
