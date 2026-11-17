# Agile Delivery Plan

## Cadence

- Use the date range on the current sprint tab of the shared task sheet; the latest tab is seven calendar days.
- Use the `SP Calculation` tab for sprint and owner capacity. Do not apply a fixed 48-point target to the current sprint.
- Point scale: 1, 2, 3, 5, 8, 13, as defined in `Story Point Rules` on the task sheet. Split work larger than 13 points.

## Delivery Model

1. Local feature work.
2. PR to `dev`.
3. Hosted dev validation.
4. Promote/merge to `qa`.
5. QA/UAT validation.
6. Promote/merge to `main`.
7. Production deployment.
8. Post-production smoke and signoff.

## Story Template

- Business rule / acceptance criteria.
- Target environment.
- Impacted modules and roles.
- Data and migration impact.
- Test cases updated.
- Rollback note.
- Verification command or manual QA scope.

## Sprint Structure

Each sprint must include:

- Sprint goal.
- Scope and owner.
- Story points.
- Acceptance criteria.
- Verification commands.
- QA scope.
- Release impact.
- Rollback notes.

## Historical Release Sprint Model

The following three-sprint, 48-point model is an earlier planning example. For current dates, capacity, and assignments, use the shared task sheet linked from `task-tracker.md`.

| Sprint | Scope | Capacity |
| --- | --- | --- |
| Sprint 1 | Deployment readiness, P0 UAT gate, auth/session, environment isolation, documents/storage, expenses, attendance | <= 48 points |
| Sprint 2 | HR operations, EMS, leave/WFH, timesheets, employees, notifications, admin settings regression | <= 48 points |
| Sprint 3 | Projects, assets, helpdesk, reports, mobile/deep regression, API negative checks, rollback drills | <= 48 points |
