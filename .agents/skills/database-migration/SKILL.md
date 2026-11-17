---
name: database-migration
description: Design, implement, or review Hawkaii HRMS PostgreSQL schema migrations and backfills. Use for table, column, index, constraint, RLS/tenant, data repair, or migration-order changes; not for ordinary repository-only query edits.
---

# Database Migration

1. Read root/backend instructions, `docs/architecture/data-architecture.md`, current Drizzle schema, ordered migrations and the affected repositories/services.
2. Define forward state, compatibility window, tenant ownership, defaults/nullability, existing-data behavior, lock/runtime risk, index/query impact, backfill strategy, recovery and rollback limits.
3. Keep shared migrations append-only. Do not edit an applied migration to hide a correction. Do not add cross-schema SQL foreign keys.
4. Make multi-tenant keys and uniqueness constraints tenant-aware. Prevent orphaning historical payroll/audit data when users, employment or companies change state.
5. Test on an isolated database with representative old, null, duplicate, high-volume and multi-tenant data. Verify migration history, schema drift and no-cross-schema-FK checks.
6. Run targeted integration tests and document deployment order, expected duration, observability, backup requirement, backward compatibility and recovery procedure. Production execution requires explicit authorization.
