# EXPORT-S25-001 Report Type And XLSX Correctness

## Objective

Reject unsupported report export types before any document, object-storage or outbox side effect, and produce XML 1.0-safe XLSX inline text that preserves valid Unicode and escaped punctuation.

## Scope

- Define the explicit report types already supported by the report service, including current aliases.
- Normalize case and surrounding whitespace at the HTTP boundary while rejecting unknown types.
- Defensively reject unsupported types in the service so direct callers cannot fall back to the expense register.
- Remove XML 1.0-invalid code points from XLSX cell text while preserving tabs, line breaks, carriage returns, ampersands, quotes and supplementary Unicode such as emoji.
- Retain existing CSV formula neutralization and add regressions for control-prefixed formula text.

The 10,000-row/12-month request bound, tenant-scoped report reads, asynchronous materialization and private-storage lifecycle remain separate slices under TEN-S25-008/029 and R2 work.

## Verification

- Focused generated-export unit tests.
- Real PostgreSQL/Valkey reports integration tests proving unknown types have no document, storage or outbox side effects.
- Backend lint, typecheck, API contract generation/verification and change-aware verification.
- Trusted changed executable line/decision-branch coverage.
- Independent senior/security and QA review at the exact head.
- Microsoft Excel and Google Sheets workbook-open checks remain hosted/manual QA gates.

The exact-head trusted run on 2026-11-15 exposed the existing current-day attendance
fixture as Sunday-sensitive (963/964 tests passed). This branch carries the same
test-only `Mon-Sun` fixture stabilization already proven independently on PR #132;
the fixed May calendar assertions continue to cover Saturday schedule behavior.

## Recovery

No migration or configuration change. Revert the report-type boundary and renderer sanitation together if compatibility issues are found; doing so would restore the unsafe unknown-type fallback and invalid-XML risk.
