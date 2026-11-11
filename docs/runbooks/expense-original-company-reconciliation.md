# Expense original-company reconciliation

Migration `0068_expense_original_company_owner.sql` leaves **every** preexisting expense ticket quarantined. Legacy `context_payload.company_id`, requester preferences, department and creation audit are not independent proof of the original employer. The creation audit names the requester but does not bind a company. No ordinary app write can assign an owner to a quarantined ticket.

The migration fences DML on `expense_tickets`, `expense_line_items`, `expense_approvals`, `expense_audit_logs`, `expense_documents`, `expense_payments`, `employee_reviewer_mappings` and `expense_policy_rules`. A bounded command sets the `app.expense_command_v1` marker with `SET LOCAL` inside its transaction. The marker is not authorization; the command must still check fresh actor/company/role, parent owner/version and every related ID. It clears on commit/rollback and connection reuse. `TRUNCATE` and table-owner rights bypass row triggers, so separate runtime and migration privileges before hosted release.

## Baseline before migration 0068

Before applying 0068, record a read-only count of legacy tickets. The new owner columns do not exist yet. Do not include ticket content or personal data in a public log.

```sql
SELECT count(*) AS legacy_ticket_total
FROM expenses.expense_tickets;
```

## Quarantine inventory after migration 0068

Run read-only queries with the approved migration operator before any hosted cutover, and record the counts and review artifact. Do not include ticket content or personal data in a public log.

```sql
SELECT owner_resolution_status, owner_resolution_reason, count(*)
FROM expenses.expense_tickets
GROUP BY owner_resolution_status, owner_resolution_reason
ORDER BY owner_resolution_status, owner_resolution_reason;

SELECT count(*) AS quarantined_total
FROM expenses.expense_tickets
WHERE company_id IS NULL;
```

Compare the post-migration quarantined count with the pre-migration baseline before any new writes. Review every quarantined ticket against independent creation-time evidence held outside the mutable expense JSON, such as a signed original-company approval or source-system record. A company may now be inactive or soft-deleted and still **own** its historical ticket; require its existing `platform.company_profiles.id`, not active status. Ownership retention does not settle runtime visibility: cross-surface access while the original company is inactive remains an explicit product-policy question, and current direct detail/receipt/Finance commands fail with `COMPANY_CONTEXT_REQUIRED`. If evidence is missing or contradictory, leave the ticket quarantined and inaccessible through direct routes.

## Audited repair

Create a separate reviewed forward migration containing an exact ticket-to-company mapping, evidence reference and SHA-256 digest, independent reviewer, and migration operator. Keep the owner guard enabled throughout. In one SQL transaction, set the transaction-local command and repair markers, lock the selected ticket rows, validate that each mapped company ID exists in `platform.company_profiles` (including inactive identities), insert the immutable `expenses.expense_owner_repair_audit` row first with the ticket's exact original context, and then update only `company_id`, `owner_resolution_status='audited_repair'`, and `owner_resolution_reason=NULL`. The immediate guard requires the marker plus one matching audit row; deferred constraint triggers validate the final bidirectional ticket/audit relationship at commit. Check counts and mapping equality before commit and abort the whole transaction on any mismatch. Never disable the owner guard. Do not create an application repair endpoint or use the app's ordinary DML path. Keep evidence documents under the approved retention/access policy outside this audit table.

The repair marker is only a transaction fence. It is not authorization and it cannot replace database-role separation. A hosted repair must run through a dedicated migration role that may insert repair evidence; the application runtime role must be unable to insert/update/delete that evidence, alter triggers, set role to the migration owner, or own the guarded tables. Verifying those restricted hosted privileges remains a cutover blocker.

The application connection currently has broad schema ownership in some environments. Before hosted repair, separate migration privileges from the runtime role and verify the runtime role cannot alter/disable triggers or write the repair audit table. Until that separation and an independently reviewed mapping exist, all historical tickets stay quarantined.

After a reviewed repair, keep the original contradictory or missing legacy JSON in `expense_owner_repair_audit` and on the ticket. The `audited_repair` typed owner governs future commands; normal updates preserve that original JSON. The local fixture verifies a conflicting legacy value can be repaired by independently checked evidence and then updated without rewriting its history.

`expense_command_results` stores immutable replay evidence for every transaction-owned expense command. Ticket commands store the minimal `{id,status,version}` result and identify their ticket; reviewer-routing create/revoke commands store the bounded mapping response and identify the mapping through `resource_id`. Migration 0070 adds the `(actor_user_id, action, idempotency_key)` lookup index used to detect a lost-response key across company changes. Ticket and reviewer-routing create keys are bound to the original actor/action/company. Routing commands first perform only a non-locking preliminary Admin check, then take the subject-independent shared governance advisory lock before any authority row lock—the same global-first order used by platform/full-store flush. They next lock and revalidate the current Admin user, preference, roles and active company; only after that may create lock a client-selected requester or revoke read a tenant-scoped mapping, lock its resolved requester and re-lock/revalidate the mapping. Create then takes the global actor/action/key advisory lock and consults the replay index before any company-scoped replay, so a retry after transfer fails closed with no second mapping, journal row or outbox event. Reviewer-routing records carry immutable `company_id`; current participant memberships authorize new creation but never redefine an existing mapping's owner. Foreign and nonexistent revoke identifiers share the same not-found behavior. A same-company routing replay is still reauthorized against fresh Admin/company context, immutable mapping owner and required current participant/Reviewer authority before the journal returns its prior result. Routing outbox idempotency keys include company, actor, mapping resource and action. The journal has no purge job while retention is undecided. Restrict runtime access, protect it at rest and design durable tombstones before archival so a reused old key cannot silently reapply a command.

## Cutover and rollback

Drain all old expense writers before applying 0068, then apply 0069 and 0070 with the compatible binary as one atomic promotion. Their response-end whole-store flush lacks typed owner and can overwrite same-company rows. Deploy transaction-owned, version-checked expense commands and request-local SQL reads before accepting traffic; test old/new binary behavior on a disposable copy. Do not roll back to an old binary after activating the guard. Recover forward from a failed deployment. A database rollback would remove the quarantine/guard and is not a safe response to application failure.

Runtime notification acknowledgement is also transaction-owned. Generic platform/full-store flushes must never write `platform.notifications`, because a process-start snapshot can revert a newer SQL read marker; only the empty-database initial seed may insert its initial notification rows.
