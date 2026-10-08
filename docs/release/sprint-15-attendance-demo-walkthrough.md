# Sprint 15 Attendance Demo Walkthrough

## Purpose

Use this walkthrough to demonstrate Sprint 15 attendance with safe synthetic data: manual attendance, browser geo attendance, manual fallback review, reporting/export segmentation, privacy controls, and mobile-ready API positioning.

## GEO-S15-016 Release Gap Traceability

| Gap               | Release artifact                                   |
| ----------------- | -------------------------------------------------- |
| `GEO-S15-016-R01` | Sprint 15 attendance release notes                 |
| `GEO-S15-016-R02` | Live demo walkthrough                              |
| `GEO-S15-016-R03` | Persistent synthetic attendance demo seed          |
| `GEO-S15-016-R04` | Demo coordinate/site sanitization                  |
| `GEO-S15-016-R05` | Consolidated Sprint 15 QA/release evidence mapping |

The internal release checklist is required for release handling, but it is not an Rxx replacement item.

## Before You Start

1. Confirm you are using a local or approved non-production QA/staging environment.
2. Run backend migrations.
3. Run the release persona seed.
4. Run the Sprint 15 attendance demo seed.
5. Copy the `date_range` printed by the seed output; use that exact range for calendar/report filters.
6. Start the backend and frontend.
7. Use the approved seeded login method from the QA run book or selected environment file. Do not paste passwords into demo notes or recordings.

Backend setup from `hrms_backend`:

```bash
pnpm db:migrate
pnpm release:seed
pnpm release:seed:attendance-demo
pnpm dev
```

Frontend setup from `hrms-client`:

```bash
pnpm dev
```

For an approved non-production remote database, the seed requires:

```bash
S15_ATTENDANCE_DEMO_SEED_ALLOW_REMOTE=true pnpm release:seed:attendance-demo
```

Never use that override for production.

## Demo Personas

| Persona | Use                                                   |
| ------- | ----------------------------------------------------- |
| `ADM`   | Admin geo settings and policy context                 |
| `E1`    | Employee manual attendance and manual fallback record |
| `E2`    | Employee geo attendance and pending correction record |
| `D1`    | Manager attendance review queue                       |
| `AUD`   | Read/export validation where auditor access is needed |

## Demo Data Setup

The seed creates synthetic rows tagged as `GEO-S15-016`.

| Relative date | Persona | Scenario                        | Expected surface                                |
| ------------- | ------- | ------------------------------- | ----------------------------------------------- |
| Seed date - 3 | `E1`    | Manual web attendance           | Verified manual attendance row                  |
| Seed date - 2 | `E2`    | Web geo attendance              | Verified geo source row                         |
| Seed date - 1 | `E1`    | Manual fallback awaiting review | Manager queue and review-required report row    |
| Seed date     | `E2`    | Pending regularization          | Manager queue and pending correction report row |

The seed date is calculated in `Asia/Kolkata`. The script prints the concrete `YYYY-MM-DD..YYYY-MM-DD` range after a successful run.

The seed intentionally does not create open attendance sessions, so a presenter can still perform a fresh live manual punch in a clean local environment.

Scenario expected results below assume the seed has run successfully against the selected non-production database. The local GEO-S15-016 validation did not verify database mutation because the runtime failed before script startup.

## Scenario 1 - Manual Attendance

Role: `E1`

Route: `/attendance`

Steps:

1. Open Attendance.
2. Show today's manual attendance control and available action.
3. Optionally perform a live punch if the environment is dedicated to the demo.
4. Open the summary/history area and point to the seeded manual row at the start of the printed `date_range`.

Expected result:

- Manual web attendance is available without requesting location.
- Historical manual row appears as verified employee attendance evidence.

Talking point:

- Manual attendance remains the fallback-friendly baseline for web-first employee attendance.

Contingency:

- If today's action is unavailable because another demo already punched, use the seeded manual row from the printed range instead of resetting data mid-demo.

## Scenario 2 - Geo Attendance

Role: `E2`

Routes: `/attendance`, `/attendance/calendar`, `/reports/attendance`

Steps:

1. Open Attendance and discuss the one-time browser geo attendance option.
2. Open Attendance Calendar for the month containing the printed seed date.
3. Show the seeded geo attendance evidence at seed date - 2.
4. Open Attendance Reports and filter to the printed `date_range`.
5. Apply the source category or evidence filters for geo if needed.

Expected result:

- Geo attendance appears as a web geo source.
- No exact coordinates are shown in routine employee or report views.

Talking point:

- The web flow uses a foreground, one-time browser permission model, not background tracking.

Contingency:

- If browser location permission is denied during a live attempt, move directly to Scenario 3.

## Scenario 3 - Manual Fallback Review

Role: `D1`

Route: `/attendance/approvals`

Steps:

1. Open Attendance Approvals.
2. Filter or inspect pending items.
3. Select the `E1` geo fallback review for seed date - 1.
4. Show safe evidence: reason code, work-site label, review type, and status.
5. Use Return only if the demo needs to show the decision action. Add a non-sensitive remark.

Expected result:

- The queue shows a pending geo fallback review.
- Routine queue details do not reveal exact coordinates.
- Exact-location controls remain restricted, unavailable, or permission-gated according to the signed-in role.

Talking point:

- Manual fallback does not silently become final attendance. It is reviewable and auditable.

Contingency:

- If the item was already decided, rerun `pnpm release:seed:attendance-demo` against the approved non-production database.

## Scenario 4 - Regularization Review

Role: `D1`

Route: `/attendance/approvals`

Steps:

1. Keep the manager queue open.
2. Select the `E2` pending regularization for the seed date.
3. Show normalized requested punch items and manager decision controls.

Expected result:

- The queue can show standard correction review beside geo fallback review.
- The seeded regularization remains pending until a presenter acts on it.

Talking point:

- Geo fallback review and historical correction review share manager ergonomics but retain distinct evidence models.

## Scenario 5 - Reporting and Export Segmentation

Role: `ADM`, `AUD`, or `D1`

Route: `/reports/attendance`

Steps:

1. Set the report date range to the printed `date_range`.
2. Review daily rows and totals.
3. Demonstrate filters for evidence category, source category, work site, review type, approval state, or reason code.
4. Export the report using the normal attendance report export path.

Expected result:

- Manual, geo, fallback review, and pending correction rows are distinguishable.
- Export columns include evidence/source/review segmentation fields.

Talking point:

- Reporting exposes operational evidence categories without leaking exact location by default.

Contingency:

- If an export adapter is unavailable in the current environment, capture the filtered report rows and mark export verification blocked by environment setup.

## Scenario 6 - Privacy and Mobile-Ready Positioning

Roles: `E1`, `D1`, `ADM`

Routes: `/attendance/privacy`, `/admin-settings/policies`

Steps:

1. Show Attendance Privacy for an employee.
2. Show Attendance Policy under Admin Settings.
3. Explain mobile readiness using API contract language only.

Expected result:

- Privacy copy explains location collection, review visibility, retention posture, and offline/mobile status without claiming native app delivery.
- Admin policy surfaces show mobile/offline controls as backend/API readiness where applicable.

Talking point:

- Mobile readiness means the API contracts, idempotency semantics, registered-device expectations, and provisional offline sync posture are documented. It does not mean a native app shipped in Sprint 15.

## Demo Seed Safety

- The seed refuses production-marked environments.
- Remote database seeding requires `S15_ATTENDANCE_DEMO_SEED_ALLOW_REMOTE=true`.
- Demo rows are tagged as `GEO-S15-016`.
- Seeded data is synthetic and contains no documented credentials or real personal data.
- Rerunning the seed on the same seed date restores pending seeded review states for that generated window but does not globally clean unrelated attendance data.
- Seed implementation/static validation has passed locally; seed execution/database mutation validation remains blocked by the local Node/tsx and pnpm environment noted in the GEO-S15-016 QA summary.

## Presenter Checklist

- Confirm environment is non-production.
- Confirm release personas can sign in through the approved method.
- Confirm date filters use the `date_range` printed by the seed.
- Do not reveal, dictate, or record exact coordinate values.
- Do not claim UAT completion for GEO-S15-014.
- Do not claim native mobile app delivery.
- Capture evidence links/screenshots for release signoff.
