# Evidence, Authority, Provenance and Uncertainty

## What is an evidence-backed statement?
A source citation is usable only if a reviewer can reproduce the finding **without believing the agent's explanation**. Record repository + SHA, relative path, symbol/route, relevant branch/line, control flow and config conditions; document title/section/version/author where source is non-code. Use only source files authorized by the owner. If a line is ephemeral, name the stable symbol and state file path.

### Evidence status
- `CONFIRMED_BUSINESS_RULE`: approved intended behavior by authorized stakeholder; record decision ID, date, scope and version.
- `IMPLEMENTED_RULE`: a code/config path contains identifiable behavior, not a run-time verified fact.
- `INFERRED_RULE`: proposed explanation based on incomplete clues, with confidence and falsifier.
- `NEEDS_BUSINESS_CONFIRMATION`: authoritative intent unavailable, ambiguous or contradictory.

Additionally annotate test oracle as `APPROVED / PROVISIONAL / UNAVAILABLE` and repository coverage as `TRACED / PARTIALLY_TRACED / UNTRACED / OUT_OF_SCOPE_WITH_RATIONALE`. Avoid the misleading token `NOT_APPLICABLE` for unexamined features.

### Authority decision checklist
For conflicts, answer:
1. What is the contract/requirement and which version applies to this release or customer segment?
2. Who approved it and can the owner verify that approval?
3. Is the code behavior intentionally divergent due to flags, tenant policy, migrations, emergency override, backwards compatibility or temporary workarounds?
4. What does the change mean for existing customers, historical records, and edge-state users?
5. Which expectation should a tester apply *today*, and for which environment/tenant/role?

An API spec may be the authoritative contract for clients but not the authority for a disputed business pricing policy. Internal tests may simply encode legacy behavior. Failing tests are not proof the business rule is wrong, and passed tests do not prove business correctness.

### Example evidence register
| ID | Claim | Type | Source | Relevant condition | Confidence | Approval | Missing evidence |
|----|-------|------|--------|--------------------|------------|----------|------------------|
| EV-001 | Example: cancellation checked only if state SHIPPED | Implemented | `src/orders/service.ts::cancel()` @ `<SHA>` | when `strictCancel=true` | High static | No | Policy/DB transaction verification |

Labels `Example:` and `<SHA>` are illustrative, not real product evidence.

### Stop-and-escalate
Escalate missing requirements for privilege bypass, finance, healthcare, privacy, state deletion, irreversibility, compliance-sensitive or safety critical behaviors. A critical unknown is not a suitable place for the AI to select a popular industry default. Do not claim that risk is resolved by merely planning a test.
