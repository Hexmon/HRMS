# Definition Of Done

A task is done only when:

- Implementation is complete.
- Backend typecheck/build passes if backend changed.
- Frontend build passes if frontend changed.
- Migration is safe and documented if DB changed.
- Env examples/docs are updated if config changed.
- No real secrets are committed.
- Test cases are updated.
- QA sheet or checklist is updated.
- Dev test log is updated.
- Deployment/smoke plan is added for environment-impacting work.
- Future scope is captured only after test sheet update.
- Rollback note is documented.

## Automated Behavior And Independent QA Gate

The requirements in [test and QA completion](../agent/test-and-qa-completion.md) are mandatory for executable behavior changes: approved input/output oracles, meaningful unit assertions covering all added/modified executable lines and changed business/security branches, relevant actual DB/worker/browser checks, independent review and reproducible PR evidence. Missing runner, coverage, policy or reviewer means not Done. Coverage does not prove every possible input, and a mock test cannot establish real RLS/transaction/browser behavior. Documentation-only work records N/A executable coverage and appropriate reference/workflow validation. A PR is submitted only when authorized; draft submission does not itself satisfy Done.
