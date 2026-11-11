# TEN-S25-007 expense original-company authority QA intake

All case families remain **Not Tested**. They are complete local case bodies, not spreadsheet publication or a claim that focused automated checks completed the family. Owner Anurag Kumar; Sprint 25; parent TEN-S25-007 / SAAS-FIN-012; P0; inherited draft estimate 8 SP. No child estimate is added.

Approved oracle: a ticket belongs to its immutable original company. A current assigned Finance user of that company may finish an eligible pre-transfer expense. The durable same-user requester may read their own historical ticket and receipt when the private-byte journey exists. Current original-company Admin/Auditor may read detail, but Auditor alone cannot read receipt bytes or URLs. Assigned Manager/Finance and the requester retain only their separately approved paths. Effective role union applies. Foreign-company and stale-role access always fails closed. TEN-S25-007 currently implements the receipt authorization classifier only; positive raw-byte/storage/upload/download journeys remain blocked with 409 pending TEN-S25-021.

## S25-026-U — policy and boundary unit family

**Fixture:** Companies A/B; requester E; independent Manager M; assigned Finance F; A Admin/Auditor; B Admin/Finance/Auditor; typed, quarantined and contradictory-owner tickets; fixed clock and versions.

**Execute:** Evaluate each approved read/action, role union, role removal, actor/company deactivation, unlinked replacement identity, manager/Finance self-processing, missing or foreign related IDs, protected-field mass assignment, stale version, terminal state, duplicate key with same payload, and duplicate key with changed payload.

**Oracle:** Only the explicitly approved actor/action pair succeeds. Denials occur before mutation or object I/O and create no ticket child, payment, audit, notification or outbox effect. Replay returns the same minimal durable result; changed-payload key reuse conflicts. **Status:** Not Tested pending exact-head full matrix and independent review.

## S25-026-P — real browser role family

**Fixture:** Separate browser sessions for E after approved A-to-B transfer, A Manager, A Finance, A Admin, A Auditor and B roles; an open A expense with a verified receipt and outstanding workflow.

**Execute:** Use lists, queues, detail, receipt, approval/payment/settlement in sequence; paste foreign deep links; use back, refresh, stale tabs, double click and interrupted network; revoke Finance and reuse the old session; re-login on a second app instance.

**Oracle:** E sees only own historical A expense; current A Finance completes it once; A Admin/Auditor can read detail while Auditor alone cannot read raw receipt; B roles never see or mutate A data; revocation is authoritative on the next request; stale/repeated UI actions never duplicate payment or settlement. **Status:** Not Tested; scripted HTTP is not a substitute.

## S25-026-N — API/SQL tenant and relationship family

**Fixture:** Disposable migrated PostgreSQL, A/B users and current roles, typed and quarantined tickets, coherent/contradictory receipt metadata, two API instances and before-state inventories.

**Execute:** Exercise my/manager/finance pages, report/dashboard/notification projections, detail/timeline/audit, Manager/Finance commands, bills and settlement with cross-company IDs, stale/future/expired roles, transferred requester, null/quarantined owner, invalid document relation/version/checksum and unsupported/extreme filters. Test page 1/2/last/over-end at maximum page size and both app instances.

**Receipt matrix:** Repeat metadata, detail, download/content, verify/delete/access-log and expense/generic upload routes for A requester, assigned Manager/Finance, Admin, Auditor and B roles. Compare real foreign UUID with random UUID responses and assert no object I/O on denial. Positive SQL byte cases remain blocked while TEN-S25-021 intentionally returns 409.

**Oracle:** Every read and write derives company from current durable SQL identity plus typed ticket owner. Foreign existence is not disclosed, capacity limits apply after authorized audience filters, and no rejected path changes either company's rows, bytes, audit or outbox. **Status:** Not Tested pending full matrix, private-byte dependency and independent review.

## S25-026-F — race, outage and restart family

**Fixture:** One eligible A ticket, two sessions/instances at one version, routing-governance writers, command-journal keys and SQL/outbox/object fault seams.

**Execute:** Race same-key and different-key create/submit/Manager/Finance/payment/bills/settlement commands; force a reviewer-routing command to wait while locking current company authority, start a platform/full-store flush, and release the blocker; transfer an Admin after a reviewer-routing create loses its response and retry the same key; revoke authority during a pending action; lose the response after commit and retry; force rollback after child/audit/outbox staging; restart and replay from the second instance. When TEN-S25-021 lands, add object PUT-success/SQL-failure and attach/delete races.

**Oracle:** At most one business transition commits; the journal result is immutable and minimal; a reviewer-routing create key remains bound to its first company and conflicts after transfer with zero mapping/journal/outbox effects. Routing takes subject-independent governance first, then locks/revalidates current Admin/company authority, and only then accesses or locks client-selected participants/mappings; the forced platform-flush interleaving completes without deadlock or rollback and the committed command replays exactly once. Rollback leaves no partial child/audit/notification/outbox effect; restart replay is durable; B identifiers never become accepted. **Status:** Not Tested pending the remaining full fault matrix, object-storage dependency and independent review; the focused governance-order interleaving is automated evidence only, not completion of this family.

## Publication and dependencies

Publish and read back these full bodies in the Sprint 25 tracker only when the connector is available and publication is authorized. Do not overwrite historical generic S25-026 rows. Migrations 0068/0069/0070 depend on release-order arrival of asset PR #118 (0065/0066) and holiday PR #122 (0067). TEN-S25-021, changed coverage, independent review, browser UAT and hosted checks remain release gates.
