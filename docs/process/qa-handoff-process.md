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
- Complete task-linked test cases published in the shared sprint sheet under [task-tracker rules](task-tracker.md), including approved expected outcomes, actual results/evidence and explicit unexecuted cases. Reconcile discussion-stage cases with implemented branches; case titles or repository links alone are insufficient.

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

## Completion Gate

Apply [test and QA completion](../agent/test-and-qa-completion.md) with the [QA specialist](../../.agents/specialists/qa-reviewer.md). Receive approved input/output contracts, base/head and new-file diff, unit/decision-branch/changed executable line reports, actual boundary/browser results, and explicit Not run/Blocked cases. Record independent reviewer identity and reviewed SHA. Test planning does not establish execution and a missing required gate cannot become Done.
