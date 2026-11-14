# TEN-S25-005 Admin Department Hierarchy Cycle Safety

## Objective

Prevent an existing corrupt department-parent cycle from blocking the Node.js event loop when an Admin creates or reparents a department. Reject the request before any master-data or outbox mutation while preserving valid same-company parent chains.

## Scope

- Detect repeated department IDs and missing ancestor references while walking the selected parent chain.
- Preserve the existing self-parent and new descendant-cycle denials.
- Continue resolving candidate parents only from the authenticated company-scoped department list and require the immediate parent to be active.
- Add unit regressions for an already-corrupt cycle, self-parent, descendant, inactive parent, foreign-company parent, valid hierarchy, and forbidden side effects.

The broader TEN-S25-005 durability, settings-default, RBAC identity, audit ownership and migration work remains separate because its legacy ownership policy is unresolved. This slice does not claim to complete that broader task.

## Verification Plan

- Focused Admin company-scope unit tests.
- Backend typecheck and lint.
- Changed executable line and decision-branch coverage against `origin/release-01`.
- Exact-head independent senior/security and QA review.

The first trusted full-suite run at `cc368ad6` passed 961/962 tests. Its only failure was an unrelated current-date attendance fixture on Sunday: the test configured `Mon-Sat` and expected a real-time punch to succeed. This branch includes the existing test-only `Mon-Sun` correction already present in PR #118 so the fixed May Saturday assertions remain intact and the real-time assertion is calendar-independent.

## Recovery

The source change is stateless and requires no migration or configuration. Rollback reverts the service and tests, but would reintroduce the unbounded traversal risk for corrupt stored chains.
