# Definition Of Ready

A task is ready only when it has:

- Clear business rule or acceptance criteria.
- Target environment or affected environments.
- Impacted modules.
- Impacted roles/permissions.
- Test data plan.
- Concrete success, rejection and edge/failure cases discussed during requirements refinement, with approved expected results or explicit owner questions.
- Stable task/case IDs and full, executable case bodies published in the shared sprint sheet, linked from the task under [task-tracker rules](task-tracker.md). Include preconditions/data, steps, visible/durable/forbidden outcomes, layer/priority/owner and initial Not Tested status; titles alone are insufficient.
- API/backend impact.
- Frontend route/component impact.
- Database migration impact.
- Media/email/Valkey impact if applicable.
- Rollback impact.
- QA priority: P0, P1, or P2.
- Expected QA evidence.

If any material item is unknown, mark it as `Needs Confirmation` before sprint commitment; early discussion and provisional case design may continue. Apply these requirements to every sprint and feature update, not only Sprint 25. For documentation-only/non-executable tasks record justified N/A and the intended reference/workflow checks rather than artificial unit tests. If tracker access is unavailable, retain the complete pending case rows and publication gap in the handoff; do not claim publication.
