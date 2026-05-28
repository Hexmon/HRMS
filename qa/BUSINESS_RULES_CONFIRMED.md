# Business Rules Confirmed

- BLQ-001 (P0): Backend role model is source of truth; Reviewer is user-facing Manager compatibility.
- BLQ-002 (P0): Expense requester cannot self-process; independent Manager and Finance Manager routing is required.
- BLQ-003 (P0): Expense v1 flow is Requester -> Manager -> Finance Manager -> Payment -> Settlement.
- BLQ-004 (P0): Admin workflow settings are persisted and verified; runtime authority must be proven before claimed.
- BLQ-005 (P0): Off-day punching captures worked time and reports compensation/overtime visibility.
- BLQ-006 (P0): Attendance target hours come from admin attendance policy plus company working days by default.
- BLQ-007 (P1): Cross-midnight attendance stays on the check-in work date in user timezone.
- BLQ-008 (P0): Admin leave calculation preview is read-only in this sprint.
- BLQ-011 (P1): Project over-allocation requires explicit acknowledgement for authorized mutators.
- BLQ-012 (P1): Cost center is optional and auto-fills from department when configured.
- BLQ-013 (P0): Authorized document deletion requires confirmation and hard-delete where safe.
- BLQ-015 (P0): Cloudinary mock is local/dev/test only; QA/UAT/prod require real Cloudinary.
- BLQ-016 (P1): Email verification auto-submit is local/dev only; QA/UAT/prod requires user confirmation.
- BLQ-024 (P0): New workspaces must show empty org-scoped real data, not unrelated demo data.
