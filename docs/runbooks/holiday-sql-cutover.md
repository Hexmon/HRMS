# Holiday SQL command cutover (TEN-S25-016-HOL)

This runbook is a draft deployment dependency, not authorization to deploy. It applies only after the task PR, its stack, exact-head tests, independent QA and release gates are approved.

1. Before promotion, inspect `leave_wfh.holidays` and `platform.outbox_events` for historical foreign-ID collisions. Do not infer the correct prior name/date from the current row; any repair needs separately approved source evidence and a backup.
2. Quiesce holiday PUT traffic **and every other API mutation that can trigger the old binary's full-store holiday flush**. Drain every old Render API instance before applying the migration or resuming writes. An old binary can overwrite company-owned holiday rows even while handling an unrelated mutation. Prevent automatic rollback to that binary while writes resume.
3. Apply asset PR #118 migrations 0065 and 0066 first, then ordered holiday migration `0067_holiday_company_unique_constraint.sql` before enabling the new binary. Do not deploy this holiday branch before #118: the migration runner cannot safely apply a lower pending ID after a higher one. On a fully migrated database, 0028 requires `company_id NOT NULL` and installs the full company-scoped unique index; holiday 0067 removes only the confirmed legacy global `(region, holiday_date, name)` constraint. Verify in SQL that the global constraint is absent, `company_id` is NOT NULL and the company-scoped index exists. Do not assign legacy NULL-company rows to a guessed company. Back up and resolve any migration failure before traffic resumes.
4. Promote the new binary. Confirm its version on every instance, then allow holiday writes. The new route commits a changed holiday row and outbox event in one SQL transaction and bypasses the generic response flush. An unchanged same-UUID retry returns the current row without a new version or event. A changed existing holiday requires its current `expected_version`; a missing UUID with a supplied `expected_version` returns 404 without creating a row or event. A missing direct command must fail, not return 200.
5. In an authorized isolated/hosted QA environment, check A/B Admin/HR valid create and foreign-ID denial with independent SQL row/outbox reads, a second instance, and an old-session role/company change. Check equal holiday date/region/name across A and B, same-company duplicate rejection, lost-response same-UUID retry, changed update version conflict, and restart. Record request IDs and build SHA; no production security probe is implied by this document.
6. Monitor 404/409/500 holiday PUT rates, outbox `holiday.upserted` company IDs and SQL row versions. If the new path fails, pause holiday writes. Restore from a reviewed build/data plan only after excluding old-binary overlap; a blind rollback to an old binary is unsafe.

Read-only SQL checks after holiday migration 0067 (expect `0`, `true`, and the full four-column index definition, respectively):

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

Once two companies save equal region/date/name values, restoring the old global uniqueness constraint is data-incompatible. Treat holiday 0067 as forward-only in that state: pause writes, retain the company-scoped schema and roll the application forward or repair it. Do not re-add the global constraint unless duplicate values have been separately reviewed and reconciled with their owners; a blind SQL or old-binary rollback is unsafe.
