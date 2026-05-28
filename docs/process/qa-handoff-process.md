# QA Handoff Process

## Developer Handoff Checklist

- Feature/module changed.
- Roles affected.
- Environment affected.
- Backend APIs changed.
- Frontend routes changed.
- DB migrations changed.
- Media/email/Valkey impact.
- Verification commands run.
- Known risks or blockers.
- Suggested test cases.

## QA Execution Order

1. Deployment Smoke if environment changed.
2. Release Gate P0.
3. Sprint Regression.
4. Full Regression where needed.
5. Deep Regression/Future only if release scope requires it.

## Evidence To Collect

- Screenshots or video.
- API response with `request_id`.
- Uploaded/downloaded file proof.
- Role/user used.
- Environment URL.
- Test case ID.
