# TEN-S25-001 and TEN-S25-018 asset case replacements pending sheet access

Target workbook: HRMS, `Sprint 25 Test Cases`. Replace the bodies of `S25-020-U/P/N/F` (rows 16–19) and refine `S25-037-U/P/N/F` (rows 84–87). Preserve IDs, task links, ownership, historical fields and other existing columns. All eight cases remain **Not Tested**. This local draft is not a workbook update or execution result.

Source and oracle: `docs/discovery/sprint-25-saas-remediation.md` TEN-S25-001/018, root `AGENTS.md` transaction/outbox invariants, and the dated two-instance reproduction in `qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.evidence.md`. The historical `3b82823a` source still flushed all asset arrays after successful asset POSTs, including QR scan and licence validation. This branch now implements a command key and row-DML fence, with focused disposable SQL evidence in `docs/plans/2026-11-11-asset-transaction-cutover.md`; the cases below remain Not Tested in the workbook until independent execution/readback. Company ownership is a separate TEN-S25-010 release dependency.

## S25-020-U — Versioned assignment command

- Task/layer/priority/owner: TEN-S25-001; unit; P0; Anurag Kumar.
- Actor/context: authorized Asset Manager; synthetic in-stock asset at version 1; eligible employee E1; no production data.
- Steps: invoke the extracted asset transition with current version, then independently with stale version, an invalid state transition, missing/invalid related ID and duplicate command input. Assert each return/error against a fixture that does not call the implementation to derive expected values.
- Expected: valid command proposes Assigned/version 2/E1 plus one assignment and one state event; rejected inputs produce the approved error and propose no assignment/event/state change. This unit case does not prove SQL CAS, cross-company ownership, or commit behavior.
- Forbidden effects: no stale overwrite, duplicate assignment, unreasoned success, or raw personal data in evidence. Oracle: confirmed version and transaction requirement; related-company denial waits for TEN-S25-010 ownership design. Status: Not Tested.

## S25-020-P — Two-instance durable assignment

- Task/layer/priority/owner: TEN-S25-001; integration plus Asset Manager browser journey; P0; Anurag Kumar.
- Actor/data: two isolated API instances sharing disposable PostgreSQL/Valkey; Asset Manager A, employee E1, original asset version 1 and a different asset. Both instances load the initial state before the first mutation.
- Steps: assign original asset to E1 on instance A; create the different asset on instance B from its stale startup snapshot. Refresh both API views and the actual Asset Manager UI; restart both instances; inspect SQL asset, assignment, state-event and applicable Core/dashboard/report/QR readers. Interleave a committed asset change between the first and last SQL collection reads of one Core/dashboard/report request and verify that request sees one internally consistent committed snapshot rather than mixed versions.
- Expected: original remains Assigned/version 2/E1; exactly one active assignment and one assignment event; unrelated new asset exists; all readers agree after refresh/restart. The second successful request cannot revert the first result. No outbox row is asserted unless the approved command design requires one.
- Forbidden effects: successful response followed by lost assignment, stale same-process display, duplicate event, or mutation from a read-only scan. Oracle: dated disposable repro plus TEN-S25-001 target. Status: Not Tested.

## S25-020-N — Competing same-version commands

- Task/layer/priority/owner: TEN-S25-001; API with real PostgreSQL; P0; Anurag Kumar.
- Actor/data: two authorized Asset Managers on separate API instances, one in-stock asset at the same expected version, two distinct eligible employee targets. Use independent synthetic sessions.
- Steps: release the two assignment requests concurrently; inspect both HTTP responses, durable asset/version, active assignments, state events and any required outbox. Repeat through refresh/restart and with a stale version after one winner commits. Seed historical request codes with a gap and run two request creates to verify collision-free allocation despite `assetRequests.length` no longer matching the highest code. Retry a committed command with the same client key/body after simulated response loss and require the exact durable result; reuse the key with a changed body and require conflict. Remove the original actor's Asset Manager role in another instance, establish a fresh valid session, then retry the same key and attempt a new command; verify current SQL authority is checked before any stored response body or mutation is returned. If the new `/assets/assignees` feed ships in this slice, transfer or deactivate a target employee in the second SQL instance, then query the stale first instance and try an assignment to that UUID. Query the feed after actor role removal too; a cached picker must not authorize or disclose stale/foreign people.
- Expected: exactly one DB compare-and-swap winner, one durable assignment/event and an approved conflict for the loser; no old-value restoration or loser side effect. Same-key/same-body replay returns the original committed result to a still-authorized actor without reapplying the command; changed body conflicts; role-revoked replay denies without exposing the saved response. The new assignee feed and assignment command must use current SQL employment/company state or remain a release blocker. Asset ownership and post-transfer `/assets/my` isolation remain linked TEN-S25-010 cases after company ownership exists.
- Forbidden effects: both successful responses, two active assignments, version regression, hidden loser event, or stale authorization disclosure from the command-result record. Oracle: TEN-S25-001 version/retry contract and root tenant/transaction invariants. Status: Not Tested.

## S25-020-F — Mixed-version and read-only POST fence

- Task/layer/priority/owner: TEN-S25-001; integration/deployment recovery; P0; Anurag Kumar.
- Actor/data: disposable SQL with one current writer and one old binary or deliberately retained legacy whole-domain writer; Asset Manager A; original and unrelated assets; synthetic QR hash/license fixture.
- Steps: commit assignment or return on the current writer. From a stale process invoke unrelated create, QR scan and licence validation POSTs; attempt an old-writer mutation during the documented cutover window. Inspect HTTP result, SQL versions, assignments/events and both process views; restart and retry according to the migration runbook.
- Expected: the installed asset row-DML trigger fence prevents any legacy snapshot from overwriting committed rows. Read-only POSTs do not write asset state. An incompatible old writer fails visibly and can recover after update; no false success. Actual old-binary execution and hosted runtime privilege checks remain pending.
- Forbidden effects: rolling-version silent overwrite, QR/license validation mutation, mixed-version success that reverts an assignment. Oracle: the local migration and TEN-S25-001 cutover contract. Status: Not Tested.

## S25-037-U — Failed-command unit contract

- Task/layer/priority/owner: TEN-S25-018; unit; P0; Anurag Kumar.
- Actor/data: Asset Manager and valid assignment command; injected persistence coordinator rejection before commit; immutable pre-command store snapshot.
- Steps: stage asset/assignment/event write intent, reject the coordinator, then read the same process state and retry the command at unit seam.
- Expected: rejected command returns a recoverable error and publishes no changed in-memory view; a later valid attempt can succeed once. Unit injection is not proof of SQL rollback or uncertain-commit recovery.
- Forbidden effects: ghost Assigned status, assignment/event visible before commit, success response on failed persistence. Oracle: TEN-S25-018 and root transaction invariant. Status: Not Tested.

## S25-037-P — PostgreSQL rollback and reader consistency

- Task/layer/priority/owner: TEN-S25-018; integration; P0; Anurag Kumar.
- Actor/data: two API instances, disposable PostgreSQL, one original asset/version and E1; controlled SQL statement failure after staging asset, assignment and event writes.
- Steps: force a statement or constraint failure before commit; request assignment; inspect SQL and both API processes plus Core/dashboard/report/QR readers, then restart both processes. Stage an E1 recovery ticket, return E1's asset, complete maintenance to InStock, assign E2, and attempt to settle the stale E1 ticket. In API-backed Employee browser mode, deny `/assets/my` or disconnect and verify a visible load error with no seeded/prior-account assets; repeat after switching accounts. In API-backed Add Asset, submit once and double-click during pending and fail the request; verify the drawer remains open until durable success and never claims unsupported metadata was saved. Inspect detail after create: missing purchase, warranty, cost and condition must display unavailable, not today's date, zero or a default condition.
- Expected: error is returned; SQL remains at original asset/version with zero new assignment/event/outbox effects; no process or UI reports a ghost assignment after failure or restart. Stale E1 ticket conflicts and leaves E2's active assignment and asset state unchanged. Employee UI shows an API error rather than local mock data; failed Add Asset has no success toast; detail reports only persisted metadata.
- Forbidden effects: partial assignment, memory-only success, duplicate denial audit, raw error payload. Oracle: TEN-S25-018; target not yet runtime-tested. Status: Not Tested.

## S25-037-N — Retry after a known rollback

- Task/layer/priority/owner: TEN-S25-018; API/integration; P0; Anurag Kumar.
- Actor/data: same disposable fixture after a confirmed pre-commit rollback; same intended command and current version. Distinguish known rollback from response loss after an uncertain commit.
- Steps: remove the injected failure, retry once through the supported command interface, then inspect SQL/version/assignment/event and both API instances after refresh. After an employee acknowledges an active assignment, return and reassign the asset; retry the original acknowledgement with its original key/body as that employee, then attempt a new key.
- Expected: one successful durable assignment and one event; no ghost state from the failed attempt. The original authorized acknowledgement replays its durable result without a new effect; a new acknowledgement for an assignment the employee no longer holds is denied. The uncertain-commit path uses a scoped durable command identity.
- Forbidden effects: duplicate business effect or false success. Oracle: TEN-S25-018 and root retry-safe write invariant. Status: Not Tested.

## S25-037-F — Commit failure and uncertain outcome recovery

- Task/layer/priority/owner: TEN-S25-018; failure/recovery integration; P0; Anurag Kumar.
- Actor/data: two API instances on disposable SQL; fault injection at COMMIT and response boundary; a command identity once the implementation contract is approved.
- Steps: run separately for definitive COMMIT rejection and a committed transaction whose response is lost. Reconnect, resolve outcome by the scoped `Idempotency-Key`, and retry only with the same key/body. Inspect SQL, versions, assignment/event/outbox, process views and user-visible error/retry state.
- Expected: rejected transaction is absent everywhere; an uncertain but committed operation is reported consistently and never applied twice. No operation is declared successful until durable outcome is known. The client retains the same intent key across response loss/refresh until a definitive result, and a separate later intent gets a new key.
- Forbidden effects: ghost memory after rollback, duplicate active assignment/event, false failure after a known durable success, stale overwrite by old binary. Oracle: TEN-S25-018/root invariants and the local durable command-key design; hosted retention policy remains pending. Status: Not Tested.
