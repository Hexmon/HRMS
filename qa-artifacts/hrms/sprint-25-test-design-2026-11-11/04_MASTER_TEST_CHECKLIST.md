# Per-Feature Review And Coverage

Before coding: map actor/company/resource/state, approved branches, fixtures, output/error, DB/audit/outbox and forbidden effects; retain task-specific case IDs. Partition valid, missing/null/empty, invalid type, limits at L-1/L/L+1, role/tenant/related IDs, stale session/version, valid/invalid transition, duplicate/reordered events, competing writes, time/office and dependency failures. Record N/A with reason.

After coding: add and run meaningful backend unit and frontend unit/component tests; changed executable line and decision-branch evidence; real SQL/Redis/queue/provider boundaries; rendered-user journeys; independent review at exact head. Missing tooling/failed/blocked/Not Tested required cases prevent Done. A flaky pass on retry needs diagnosis. Do not delete/weaken a failing assertion to obtain green.

For user-facing slices include browser refresh/back/stale tab/double-click/offline recovery, keyboard/focus/mobile and appropriate browser compatibility. Extend the base plan with observed controls, newly added branches and regressions; no finite matrix proves every possible user behavior.
