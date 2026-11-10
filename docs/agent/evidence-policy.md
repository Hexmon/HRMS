# Engineering Evidence Policy

Every material claim about Hawkaii HRMS must identify what kind of evidence supports it.

| Classification | Meaning |
| --- | --- |
| Approved intent | A current, owner-approved business, architecture, security, or operational decision. |
| Implemented behavior | A traceable code, migration, contract, or configuration path at a named revision. |
| Verified runtime behavior | A dated execution against an identified environment with reproducible evidence. |
| Inference | A plausible conclusion that is not yet confirmed; state the missing evidence. |
| Unknown | Evidence is unavailable, contradictory, or outside the authorized scope. |

## Rules

- Code proves what a path appears to implement, not that production behaves correctly.
- Tests prove only the cases they executed in their stated environment.
- Generated OpenAPI is the API contract only when generation/verification is current.
- UI visibility is never evidence of backend authorization.
- A successful HTTP response is not sufficient proof of the expected database, event, audit, notification, or cache side effects.
- Historical QA artifacts remain historical; do not relabel them as current execution.
- Never convert an assumption into a business rule without an authorized decision.
- Handoffs must distinguish passed, failed, not run, blocked, and not applicable checks.
