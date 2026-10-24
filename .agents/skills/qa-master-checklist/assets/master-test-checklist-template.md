# Master QA Checklist — <Project> @ <SHA>

**Discovery scope:** <commit, environment, module, known exclusions>
**Authority:** Expected results require business approval; otherwise label `TBD (BQ-ID)`. All cases start `Not Tested`.

## <Module> — <critical user journey + actor/tenant context>

### Business and state transitions
- [ ] **TC-<MODULE>-001 — <observable scenario>**
  - **Risk/invariant:** <risk ID, invariant>
  - **Actor/context:** <persona, role, tenant, network, state>
  - **Source/code trace:** `<path::symbol @ SHA>`, related `BR-ID`, `BQ-ID` if pending
  - **Preconditions/data/env:** <synthetic fixtures and required approved test environment>
  - **Actions:** <reproducible sequence>
  - **Expected user, persistence, side effects and audit:** <approved oracle or TBD>
  - **Failure variation:** <interruption, retry, duplicate, race, rollback>
  - **Priority/automation suitability:** P0–P3 / Yes–Partial–No–Later
  - **Execution status:** Not Tested

### Security / concurrency / integrations / reliability
Create only scenarios proven applicable and with a distinctive failure mechanism. Do not duplicate test IDs across lists.

### Adversarial and real-user assurance
- **Applicable ARU IDs:** <ARU-01–ARU-19>
- **Coverage type:** <automated / manual exploratory / hosted / independent penetration / human UAT>
- **Applicability gaps or owned exclusions:** <gap/owner/BQ/evidence>
