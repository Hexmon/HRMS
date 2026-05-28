# Need-Action Implementation Plan

## Scope Completed In This Pass
- P0/P1 role alignment, expense routing, attendance weekly/off-day visibility, document hard-delete compatibility, Cloudinary enforcement, email verification confirmation, leave preview, project over-allocation acknowledgement, cost-center autofill, and empty-workspace guardrails.

## Implementation Sequencing
1. Capture evidence and confirmed business rules.
2. Patch backend source-of-truth policy/services before frontend labels.
3. Add frontend visibility/UX changes only after backend checks exist.
4. Verify backend and frontend independently.
5. Generate tester artifacts and task-sheet updates.

## Residual Gaps
- Admin workflow settings are persisted and refresh-safe, but broad runtime consumption remains configuration-only unless a specific module already consumes that setting.
- Immutable document access logs are preserved during hard delete because the database explicitly blocks deletion.
- Full tenant scoping across all historical tables should continue as future hardening where ownership columns are missing.
