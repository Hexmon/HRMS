# Holiday SQL command cutover (TEN-S25-016-HOL)

This runbook is a draft deployment dependency, not authorization to deploy. It applies only after the task PR, its stack, exact-head tests, independent QA and release gates are approved.

1. Before promotion, inspect `leave_wfh.holidays` and `platform.outbox_events` for historical foreign-ID collisions. Do not infer the correct prior name/date from the current row; any repair needs separately approved source evidence and a backup.
2. Quiesce holiday PUT traffic **and every other API mutation that can trigger the old binary's full-store holiday flush**. Drain every old Render API instance before applying the migration or resuming writes. An old binary can overwrite company-owned holiday rows even while handling an unrelated mutation. Prevent automatic rollback to that binary while writes resume.
3. Run the duplicate-key preflight below, resolve any result from approved source evidence, then apply `0065_holiday_company_unique_constraint.sql` before enabling the new binary. This clean candidate starts from `release-01`, whose migration tip was 0064; it contains no unfinished Asset migrations. Migration 0065 removes the confirmed legacy global holiday constraint and installs the partial case-insensitive company key. Company-owned role grants and transfer approval are not part of this candidate. Any later Asset branch must rebase and take migration numbers after 0065. Holiday RLS is also not part of this candidate: TEN-S25-017 must first remove shared cross-company holiday hydration/full-flush and prove the real restricted runtime lifecycle.
4. Promote the new binary. Confirm its version on every instance, then allow holiday writes. The new route commits a changed holiday row and outbox event in one SQL transaction and bypasses the generic response flush. An unchanged same-UUID retry returns the current row without a new version or event. A changed existing holiday requires its current `expected_version`; a missing UUID with a supplied `expected_version` returns 404 without creating a row or event. A missing direct command must fail, not return 200.
5. In an authorized isolated/hosted QA environment, use separate Company A and Company B users to check Admin/HR valid create and foreign-ID denial with independent SQL row/outbox reads and a second instance. Check equal holiday date/region/name across A and B, same-company duplicate rejection, lost-response same-UUID retry, changed update version conflict, and restart. Do not simulate transfer by editing session preferences: company-owned role grants and the approved transfer workflow are separate prerequisites. Record request IDs and build SHA; no production security probe is implied by this document.
6. Monitor 404/409/500 holiday PUT rates, outbox `holiday.upserted` company IDs and SQL row versions. If the new path fails, pause holiday writes. Restore from a reviewed build/data plan only after excluding old-binary overlap; a blind rollback to an old binary is unsafe.

Read-only preflight before migration 0065 (expect zero rows):

```sql
SELECT company_id, region, holiday_date, lower(name), count(*)
  FROM leave_wfh.holidays
 WHERE deleted_at IS NULL
 GROUP BY company_id, region, holiday_date, lower(name)
HAVING count(*) > 1;
```

Read-only SQL checks after migration 0065 (expect `0`, `true`, and the partial expression index):

```sql
SELECT count(*) FROM pg_constraint
 WHERE conrelid = 'leave_wfh.holidays'::regclass
   AND conname = 'holidays_region_holiday_date_name_key';
SELECT attnotnull FROM pg_attribute
 WHERE attrelid = 'leave_wfh.holidays'::regclass AND attname = 'company_id';
SELECT indexdef FROM pg_indexes
 WHERE schemaname = 'leave_wfh' AND tablename = 'holidays'
   AND indexname = 'holidays_company_region_date_name_uq';
```

The holiday GET uses fresh SQL. Leave, timesheet and report calculations still consume hydrated holiday state elsewhere and remain TEN-S25-025/report dependencies. The UI retains its create UUID on an uncertain response and refetches the list; an unchanged same-UUID retry is idempotent. An edited retry after an ambiguous commit requires a fresh version and may return 409.

Once two companies save equal holiday keys, restoring the old global uniqueness structure is data-incompatible. Treat migration 0065 as forward-only after writes resume: pause writes, retain the scoped schema and roll the application forward or repair it. A blind SQL or old-binary rollback is unsafe.
