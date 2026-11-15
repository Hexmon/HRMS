import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposableResetTarget, resetPostgresDatabase } from "../../platform/postgres-data-store.js";

function requiredTestDatabaseUrl(): URL {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required for asset migration tests");
  assertDisposableResetTarget(value);
  const url = new URL(value);
  return url;
}

function migrationFiles(maximumId: number): string[] {
  return readdirSync("src/db/migrations")
    .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= maximumId)
    .sort();
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(readFileSync(`src/db/migrations/${filename}`, "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function withAssetWriter<T>(client: Client, action: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL hrms.asset_writer_v2 = 'on'");
    const result = await action();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

describe("asset tenant ownership migration", () => {
  const sourceUrl = requiredTestDatabaseUrl();
  const databaseName = `hrms_asset_tenant_test_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  const databaseUrl = new URL(sourceUrl);
  databaseUrl.pathname = `/${databaseName}`;
  let admin: Client;
  let client: Client;

  const companyA = randomUUID();
  const companyB = randomUUID();
  const assetId = randomUUID();
  const assignmentId = randomUUID();
  const requestId = randomUUID();
  const vendorId = randomUUID();
  const recoveryEmployeeId = randomUUID();
  const verifierUserId = randomUUID();
  const approverUserId = randomUUID();
  const runtimeRole = `hrms_asset_runtime_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    client = new Client({ connectionString: databaseUrl.toString() });
    await client.connect();
    for (const filename of migrationFiles(67)) await applyMigration(client, filename);

    await client.query("BEGIN");
    await client.query("SET LOCAL hrms.asset_writer_v2 = 'on'");
    await client.query(
      `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
       VALUES ($1, 'Company A', $2, 'active'), ($3, 'Company B', $4, 'active')`,
      [companyA, `company-a-${companyA}`, companyB, `company-b-${companyB}`],
    );
    await client.query(
      `INSERT INTO core.users (
         id, employee_code, email, full_name, hierarchy_path, employment_status, terminated_on
       ) VALUES
         ($1, 'RECOVERY-001', $2, 'Original Company Employee', 'recovery_001', 'terminated', current_date),
         ($3, 'VERIFY-001', $4, 'Ownership Verifier', 'verify_001', 'active', NULL),
         ($5, 'APPROVE-001', $6, 'Ownership Approver', 'approve_001', 'active', NULL)`,
      [
        recoveryEmployeeId,
        `recovery-${recoveryEmployeeId}@example.test`,
        verifierUserId,
        `verifier-${verifierUserId}@example.test`,
        approverUserId,
        `approver-${approverUserId}@example.test`,
      ],
    );
    await client.query(
      `INSERT INTO core.roles (role_key, name, status, builtin)
       VALUES ('Admin', 'Admin', 'active', true),
              ('HR Manager', 'HR Manager', 'active', true),
              ('Employee', 'Employee', 'active', true)`,
    );
    await client.query(
      `INSERT INTO core.user_roles (user_id, role_key, status, effective_from)
       VALUES ($1, 'Admin', 'active', current_date),
              ($1, 'Employee', 'active', current_date),
              ($2, 'HR Manager', 'active', current_date),
              ($2, 'Employee', 'active', current_date)`,
      [verifierUserId, approverUserId],
    );
    await client.query(
      `INSERT INTO platform.user_session_preferences (user_id, active_role, company_id)
       VALUES ($1, 'Employee', $2), ($3, 'Employee', $2), ($4, 'Employee', $2)`,
      [recoveryEmployeeId, companyA, verifierUserId, approverUserId],
    );
    await client.query(
      `INSERT INTO assets.assets (id, asset_code, qr_hash, asset_type, name, status)
       VALUES ($1, 'ASSET-1', $2, 'Laptop', 'Legacy laptop', 'assigned')`,
      [assetId, `qr-${assetId}`],
    );
    await client.query(
      `INSERT INTO assets.asset_assignments (
         id, asset_id, assigned_to_user_id, assigned_by_user_id, status
       ) VALUES ($1, $2, $3, $4, 'active')`,
      [assignmentId, assetId, recoveryEmployeeId, verifierUserId],
    );
    await client.query(
      `INSERT INTO assets.asset_state_events (asset_id, event_type)
       VALUES ($1, 'assigned')`,
      [assetId],
    );
    await client.query(
      `INSERT INTO assets.software_vendors (id, name, status)
       VALUES ($1, 'Legacy Vendor', 'active')`,
      [vendorId],
    );
    await client.query(
      `INSERT INTO assets.asset_requests (
         id, request_code, requester_user_id, request_type, asset_type, asset_id,
         reason, priority, status
       ) VALUES ($1, 'REQ-1', $2, 'repair', 'Laptop', $3, 'Repair', 'medium', 'pending')`,
      [requestId, randomUUID(), assetId],
    );
    await client.query(
      `INSERT INTO assets.asset_acknowledgements (
         asset_id, employee_user_id, assignment_id, acknowledgement_type, status
       ) VALUES ($1, $2, $3, 'received', 'pending')`,
      [assetId, randomUUID(), assignmentId],
    );
    await client.query(
      `INSERT INTO assets.asset_maintenance_records (
         asset_id, maintenance_type, vendor_id, started_on, status
       ) VALUES ($1, 'repair', $2, '2026-11-14', 'scheduled')`,
      [assetId, vendorId],
    );
    await client.query(
      `INSERT INTO assets.asset_recovery_tickets (
         employee_user_id, asset_id, assignment_id, status
       ) VALUES ($1, $2, $3, 'open')`,
      [recoveryEmployeeId, assetId, assignmentId],
    );
    await client.query("COMMIT");
    await applyMigration(client, "0068_asset_tenant_ownership_map.sql");
  }, 30_000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    await admin?.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await admin?.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin?.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
    await admin?.end().catch(() => undefined);
  }, 60_000);

  it("fails closed until verified roots agree, then enforces immutable tenant ownership", async () => {
    await expect(
      client.query(
        `INSERT INTO assets.asset_tenant_ownership_map (
           resource_type, resource_id, company_id, verification_note
         ) VALUES ('asset', $1, $2, NULL)`,
        [randomUUID(), companyA],
      ),
    ).rejects.toMatchObject({ code: "23502" });

    await expect(
      applyMigration(client, "0069_asset_tenant_ownership.sql"),
    ).rejects.toMatchObject({ code: "23502" });

    await client.query(
      `INSERT INTO assets.asset_tenant_ownership_map (
         resource_type, resource_id, company_id, verification_note, verified_by_user_id
       ) VALUES
         ('asset', $1, $2, 'verified asset owner', $6),
         ('request', $3, $4, 'intentionally conflicting request owner', $6),
         ('vendor', $5, $2, 'verified vendor owner', $6)`,
      [assetId, companyA, requestId, companyB, vendorId, verifierUserId],
    );
    await expect(
      applyMigration(client, "0069_asset_tenant_ownership.sql"),
    ).rejects.toMatchObject({ code: "23514" });

    await client.query(
      `UPDATE assets.asset_tenant_ownership_map
       SET company_id = $1, verification_note = 'corrected after source review'
       WHERE resource_type = 'request' AND resource_id = $2`,
      [companyA, requestId],
    );
    await applyMigration(client, "0069_asset_tenant_ownership.sql");

    const orphanId = randomUUID();
    await client.query(
      `INSERT INTO assets.asset_tenant_ownership_map (
         resource_type, resource_id, company_id, verification_note, verified_by_user_id
       ) VALUES ('asset', $1, $2, 'unattributed draft mapping', NULL)`,
      [orphanId, companyA],
    );
    await expect(applyMigration(client, "0070_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23502", message: expect.stringMatching(/no verifier/u) });
    await client.query(
      "DELETE FROM assets.asset_tenant_ownership_map WHERE resource_type = 'asset' AND resource_id = $1",
      [orphanId],
    );
    await client.query(
      `INSERT INTO assets.asset_tenant_ownership_map (
         resource_type, resource_id, company_id, verification_note, verified_by_user_id
       ) VALUES ('asset', $1, $2, 'unknown verifier mapping', $3)`,
      [orphanId, companyA, randomUUID()],
    );
    await expect(applyMigration(client, "0070_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23503", message: expect.stringMatching(/unknown verifier/u) });
    await client.query(
      "DELETE FROM assets.asset_tenant_ownership_map WHERE resource_type = 'asset' AND resource_id = $1",
      [orphanId],
    );
    await client.query(
      `INSERT INTO assets.asset_tenant_ownership_map (
         resource_type, resource_id, company_id, verification_note, verified_by_user_id
       ) VALUES ('asset', $1, $2, 'invalid orphan mapping', $3)`,
      [orphanId, companyA, verifierUserId],
    );
    await expect(applyMigration(client, "0070_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23503" });
    await client.query(
      "DELETE FROM assets.asset_tenant_ownership_map WHERE resource_type = 'asset' AND resource_id = $1",
      [orphanId],
    );
    await applyMigration(client, "0070_asset_tenant_ownership_finalization.sql");
    await applyMigration(client, "0071_asset_recovery_identity_evidence_prep.sql");
    const recoveryTicket = await client.query<{ id: string }>(
      "SELECT id FROM assets.asset_recovery_tickets WHERE asset_id = $1",
      [assetId],
    );
    await expect(applyMigration(client, "0072_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23502", message: expect.stringMatching(/no verified identity evidence/u) });
    const insertEvidence = (overrides: { ticketId?: string; companyId?: string; name?: string; verifier?: string } = {}) => client.query(
      `INSERT INTO assets.asset_recovery_identity_evidence (
         ticket_id, company_id, employee_user_id, employee_full_name_snapshot,
         employee_code_snapshot, source_reference, verified_by_user_id
       ) VALUES ($1, $2, $3, $4, 'RECOVERY-001', $5, $6)`,
      [
        overrides.ticketId ?? recoveryTicket.rows[0]!.id,
        overrides.companyId ?? companyA,
        recoveryEmployeeId,
        overrides.name ?? "Verified Original Company Employee",
        `reviewed-termination-${recoveryEmployeeId}`,
        overrides.verifier ?? verifierUserId,
      ],
    );
    await insertEvidence({ companyId: companyB });
    await expect(applyMigration(client, "0072_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23514" });
    await client.query("DELETE FROM assets.asset_recovery_identity_evidence");
    await insertEvidence({ name: "" });
    await expect(applyMigration(client, "0072_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23514" });
    await client.query("DELETE FROM assets.asset_recovery_identity_evidence");
    await insertEvidence({ verifier: randomUUID() });
    await expect(applyMigration(client, "0072_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23514" });
    await client.query("DELETE FROM assets.asset_recovery_identity_evidence");
    await insertEvidence();
    await insertEvidence({ ticketId: randomUUID() });
    await expect(applyMigration(client, "0072_asset_tenant_ownership_finalization.sql"))
      .rejects.toMatchObject({ code: "23514" });
    await client.query("DELETE FROM assets.asset_recovery_identity_evidence WHERE ticket_id <> $1", [recoveryTicket.rows[0]!.id]);
    await client.query("UPDATE platform.company_profiles SET status = 'inactive' WHERE id = $1", [companyA]);
    await applyMigration(client, "0072_asset_tenant_ownership_finalization.sql");
    const runtimeMigrationSql = readFileSync(
      "src/db/migrations/0073_asset_termination_identity_snapshot.sql",
      "utf8",
    );
    const validationOffset = runtimeMigrationSql.indexOf("DO $$");
    expect(validationOffset).toBeGreaterThan(0);
    const contender = new Client({ connectionString: databaseUrl.toString() });
    await contender.connect();
    await client.query("BEGIN");
    try {
      await client.query(runtimeMigrationSql.slice(0, validationOffset));
      await contender.query("SET lock_timeout = '100ms'");
      const blockedEventId = randomUUID();
      await expect(contender.query(
        `INSERT INTO platform.outbox_events (
           event_id, aggregate_type, aggregate_id, event_type, payload,
           idempotency_key, status, retry_count, available_at
         ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
           $4, 'pending', 0, now())`,
        [blockedEventId, recoveryEmployeeId, JSON.stringify({
          user_id: recoveryEmployeeId, employee_code: "RECOVERY-001",
        }), `core.user.deactivated:${recoveryEmployeeId}:1`],
      )).rejects.toMatchObject({ code: "55P03" });
      await expect(contender.query(
        `INSERT INTO core.user_termination_identity_evidence (
           lifecycle_event_id, company_id, employee_user_id,
           employee_full_name_snapshot, employee_code_snapshot, employee_version,
           source_reference, verified_by_user_id, approved_by_user_id
         ) VALUES ($1, $2, $3, 'blocked', 'RECOVERY-001', 1, 'blocked', $4, $5)`,
        [blockedEventId, companyA, recoveryEmployeeId, verifierUserId, approverUserId],
      )).rejects.toMatchObject({ code: "55P03" });
    } finally {
      await client.query("ROLLBACK");
      await contender.end();
    }

    const preSnapshotEvents = ["pending", "retry", "published", "dead_letter"].map((status, index) => ({
      eventId: randomUUID(),
      status,
      version: index + 1,
    }));
    for (const event of preSnapshotEvents) {
      const payload = {
        user_id: recoveryEmployeeId,
        employee_code: "RECOVERY-001",
        ...(event.version > 2 ? { company_id: companyA, employee_version: event.version } : {}),
      };
      await client.query(
        `INSERT INTO platform.outbox_events (
           event_id, aggregate_type, aggregate_id, event_type, payload,
           idempotency_key, status, retry_count, available_at
         ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
           $4, $5, 0, now())`,
        [event.eventId, recoveryEmployeeId, JSON.stringify(payload),
          `core.user.deactivated:${recoveryEmployeeId}:${event.version}`, event.status],
      );
    }
    await expect(applyMigration(client, "0073_asset_termination_identity_snapshot.sql"))
      .rejects.toMatchObject({ code: "23514", message: expect.stringMatching(/pre-snapshot termination evidence/iu) });
    for (const event of preSnapshotEvents) {
      await client.query(
        `INSERT INTO core.user_termination_identity_evidence (
           lifecycle_event_id, company_id, employee_user_id,
           employee_full_name_snapshot, employee_code_snapshot, employee_version,
           source_reference, verified_by_user_id, approved_by_user_id
         ) VALUES ($1, $2, $3, 'Verified Historical Employee', 'RECOVERY-001', $4, $5, $6, $7)`,
        [event.eventId, companyA, recoveryEmployeeId, event.version,
          `reviewed-event-${event.eventId}`, verifierUserId, approverUserId],
      );
    }
    const laterCompanyBAssetId = randomUUID();
    const laterCompanyBAssignmentId = randomUUID();
    const unrelatedCompanyBRecoveryId = randomUUID();
    await withAssetWriter(client, async () => {
      await client.query(
        `INSERT INTO assets.assets (
           id, company_id, asset_code, qr_hash, asset_type, name, status
         ) VALUES ($1, $2, 'ASSET-B-LATER', $3, 'Laptop', 'Later Company B laptop', 'assigned')`,
        [laterCompanyBAssetId, companyB, `qr-${laterCompanyBAssetId}`],
      );
      await client.query(
        `INSERT INTO assets.asset_assignments (
           id, company_id, asset_id, assigned_to_user_id, assigned_by_user_id,
           status, assigned_at
         ) VALUES ($1, $2, $3, $4, $5, 'active', now() + interval '1 day')`,
        [laterCompanyBAssignmentId, companyB, laterCompanyBAssetId, recoveryEmployeeId, verifierUserId],
      );
      await client.query(
        `INSERT INTO assets.asset_recovery_tickets (
           id, company_id, employee_user_id, employee_full_name_snapshot,
           employee_code_snapshot, asset_id, assignment_id, status
         ) VALUES ($1, $2, $3, 'Later Company B Employee', 'RECOVERY-001', $4, $5, 'open')`,
        [unrelatedCompanyBRecoveryId, companyB, recoveryEmployeeId,
          laterCompanyBAssetId, laterCompanyBAssignmentId],
      );
    });
    const firstHistoricalEvent = preSnapshotEvents[0]!;
    const enrichedHistoricalEvent = preSnapshotEvents[2]!;
    const expectLegacyEvidenceRejection = () => expect(
      applyMigration(client, "0073_asset_termination_identity_snapshot.sql"),
    ).rejects.toMatchObject({ code: "23514" });

    await client.query(
      "UPDATE core.user_termination_identity_evidence SET company_id = $1 WHERE lifecycle_event_id = $2",
      [companyB, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = ANY($2::uuid[])",
      [companyB, [verifierUserId, approverUserId]],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET company_id = $1 WHERE lifecycle_event_id = $2",
      [companyA, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = ANY($2::uuid[])",
      [companyA, [verifierUserId, approverUserId]],
    );
    await withAssetWriter(client, async () => {
      await client.query(
        "UPDATE assets.asset_assignments SET assigned_at = now() - interval '1 day' WHERE id = $1",
        [laterCompanyBAssignmentId],
      );
    });
    await expectLegacyEvidenceRejection();
    await withAssetWriter(client, async () => {
      await client.query(
        "UPDATE assets.asset_assignments SET assigned_at = now() + interval '1 day' WHERE id = $1",
        [laterCompanyBAssignmentId],
      );
    });
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET employee_version = 99 WHERE lifecycle_event_id = $1",
      [firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET employee_version = $1 WHERE lifecycle_event_id = $2",
      [firstHistoricalEvent.version, firstHistoricalEvent.eventId],
    );
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{user_id}', to_jsonb($1::text))
        WHERE event_id = $2`,
      [randomUUID(), enrichedHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{user_id}', to_jsonb($1::text))
        WHERE event_id = $2`,
      [recoveryEmployeeId, enrichedHistoricalEvent.eventId],
    );
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{company_id}', to_jsonb($1::text))
        WHERE event_id = $2`,
      [companyB, enrichedHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{company_id}', to_jsonb($1::text))
        WHERE event_id = $2`,
      [companyA, enrichedHistoricalEvent.eventId],
    );
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{employee_version}', '99'::jsonb)
        WHERE event_id = $1`,
      [enrichedHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{employee_version}', to_jsonb($1::integer))
        WHERE event_id = $2`,
      [enrichedHistoricalEvent.version, enrichedHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE platform.outbox_events SET payload = payload - 'user_id' WHERE event_id = $1",
      [firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      `UPDATE platform.outbox_events
          SET payload = jsonb_set(payload, '{user_id}', to_jsonb($1::text))
        WHERE event_id = $2`,
      [recoveryEmployeeId, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE platform.outbox_events SET idempotency_key = $1 WHERE event_id = $2",
      [`core.user.deactivated:${randomUUID()}:${firstHistoricalEvent.version}`, firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE platform.outbox_events SET idempotency_key = $1 WHERE event_id = $2",
      [`core.user.deactivated:${recoveryEmployeeId}:${firstHistoricalEvent.version}`, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET employee_code_snapshot = 'WRONG' WHERE lifecycle_event_id = $1",
      [firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET employee_code_snapshot = 'RECOVERY-001' WHERE lifecycle_event_id = $1",
      [firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET source_reference = '' WHERE lifecycle_event_id = $1",
      [firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET source_reference = $1 WHERE lifecycle_event_id = $2",
      [`reviewed-event-${firstHistoricalEvent.eventId}`, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET verified_by_user_id = $1 WHERE lifecycle_event_id = $2",
      [randomUUID(), firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET verified_by_user_id = $1 WHERE lifecycle_event_id = $2",
      [verifierUserId, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET approved_by_user_id = $1 WHERE lifecycle_event_id = $2",
      [randomUUID(), firstHistoricalEvent.eventId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_termination_identity_evidence SET approved_by_user_id = $1 WHERE lifecycle_event_id = $2",
      [approverUserId, firstHistoricalEvent.eventId],
    );
    await client.query(
      "UPDATE core.user_roles SET status = 'revoked' WHERE user_id = $1 AND role_key = 'Admin'",
      [verifierUserId],
    );
    await client.query(
      "UPDATE platform.user_session_preferences SET active_role = 'Admin' WHERE user_id = $1",
      [verifierUserId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_roles SET status = 'active' WHERE user_id = $1 AND role_key = 'Admin'",
      [verifierUserId],
    );
    await client.query(
      "UPDATE platform.user_session_preferences SET active_role = 'Employee' WHERE user_id = $1",
      [verifierUserId],
    );
    await client.query(
      "UPDATE core.user_roles SET deleted_at = now() WHERE user_id = $1 AND role_key = 'Admin'",
      [verifierUserId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "UPDATE core.user_roles SET deleted_at = NULL WHERE user_id = $1 AND role_key = 'Admin'",
      [verifierUserId],
    );
    await client.query(
      `UPDATE core.user_roles
          SET effective_from = current_date - 2, effective_to = current_date - 1
        WHERE user_id = $1 AND role_key = 'Admin'`,
      [verifierUserId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      `UPDATE core.user_roles
          SET effective_from = current_date, effective_to = NULL
        WHERE user_id = $1 AND role_key = 'Admin'`,
      [verifierUserId],
    );
    await client.query("UPDATE core.roles SET status = 'inactive' WHERE role_key = 'Admin'");
    await expectLegacyEvidenceRejection();
    await client.query("UPDATE core.roles SET status = 'active' WHERE role_key = 'Admin'");
    await client.query("UPDATE core.roles SET deleted_at = now() WHERE role_key = 'Admin'");
    await expectLegacyEvidenceRejection();
    await client.query("UPDATE core.roles SET deleted_at = NULL WHERE role_key = 'Admin'");
    await expect(client.query(
      "UPDATE core.user_termination_identity_evidence SET approved_by_user_id = verified_by_user_id WHERE lifecycle_event_id = $1",
      [firstHistoricalEvent.eventId],
    )).rejects.toMatchObject({ code: "23514" });
    await client.query(
      `INSERT INTO core.user_termination_identity_evidence (
         lifecycle_event_id, company_id, employee_user_id,
         employee_full_name_snapshot, employee_code_snapshot, employee_version,
         source_reference, verified_by_user_id, approved_by_user_id
       ) VALUES ($1, $2, $3, 'extra', 'RECOVERY-001', 1, 'extra', $4, $5)`,
      [randomUUID(), companyA, recoveryEmployeeId, verifierUserId, approverUserId],
    );
    await expectLegacyEvidenceRejection();
    await client.query(
      "DELETE FROM core.user_termination_identity_evidence WHERE lifecycle_event_id NOT IN (SELECT event_id FROM platform.outbox_events)",
    );
    await applyMigration(client, "0073_asset_termination_identity_snapshot.sql");
    const migratedSnapshots = await client.query<{ lifecycle_event_id: string }>(
      `SELECT lifecycle_event_id
         FROM core.user_termination_identity_snapshots
        WHERE lifecycle_event_id = ANY($1::uuid[])
        ORDER BY lifecycle_event_id`,
      [preSnapshotEvents.map((event) => event.eventId)],
    );
    expect(migratedSnapshots.rows.map((row) => row.lifecycle_event_id)).toEqual(
      preSnapshotEvents.map((event) => event.eventId).sort(),
    );
    await expect(client.query(
      `UPDATE core.user_termination_identity_evidence
          SET source_reference = source_reference
        WHERE lifecycle_event_id = $1`,
      [preSnapshotEvents[0]!.eventId],
    )).rejects.toMatchObject({ code: "55000" });

    const lifecycleEventId = randomUUID();
    await expect(client.query(
      `INSERT INTO platform.outbox_events (
         event_id, aggregate_type, aggregate_id, event_type, payload,
         idempotency_key, status, retry_count, available_at
       ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
         $4, 'pending', 0, now())`,
      [lifecycleEventId, recoveryEmployeeId, JSON.stringify({ user_id: recoveryEmployeeId }), `legacy-${lifecycleEventId}`],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(client.query(
      `INSERT INTO platform.outbox_events (
         event_id, aggregate_type, aggregate_id, event_type, payload,
         idempotency_key, status, retry_count, available_at
       ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
         $4, 'pending', 0, now())`,
      [randomUUID(), recoveryEmployeeId, JSON.stringify({
        user_id: recoveryEmployeeId, company_id: companyB, employee_version: 1,
      }), `wrong-company-${lifecycleEventId}`],
    )).rejects.toMatchObject({ code: "23514", message: expect.stringMatching(/company/u) });
    await client.query(
      "UPDATE core.users SET employment_status = 'active', terminated_on = NULL WHERE id = $1",
      [recoveryEmployeeId],
    );
    await expect(client.query(
      `INSERT INTO platform.outbox_events (
         event_id, aggregate_type, aggregate_id, event_type, payload,
         idempotency_key, status, retry_count, available_at
       ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
         $4, 'pending', 0, now())`,
      [randomUUID(), recoveryEmployeeId, JSON.stringify({
        user_id: recoveryEmployeeId, company_id: companyA, employee_version: 1,
      }), `active-employee-${lifecycleEventId}`],
    )).rejects.toMatchObject({ code: "23514", message: expect.stringMatching(/terminated employee/u) });
    await client.query(
      "UPDATE core.users SET employment_status = 'terminated', terminated_on = current_date WHERE id = $1",
      [recoveryEmployeeId],
    );
    await client.query(
      `INSERT INTO platform.outbox_events (
         event_id, aggregate_type, aggregate_id, event_type, payload,
         idempotency_key, status, retry_count, available_at
       ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
         $4, 'pending', 0, now())`,
      [lifecycleEventId, recoveryEmployeeId, JSON.stringify({
        user_id: recoveryEmployeeId, company_id: companyA, employee_version: 1,
      }), `valid-${lifecycleEventId}`],
    );
    const terminationSnapshot = await client.query<{
      company_id: string; employee_full_name_snapshot: string; employee_code_snapshot: string; employee_version: number;
    }>(
      `SELECT company_id, employee_full_name_snapshot, employee_code_snapshot, employee_version
         FROM core.user_termination_identity_snapshots WHERE lifecycle_event_id = $1`,
      [lifecycleEventId],
    );
    expect(terminationSnapshot.rows).toEqual([{
      company_id: companyA,
      employee_full_name_snapshot: "Original Company Employee",
      employee_code_snapshot: "RECOVERY-001",
      employee_version: 1,
    }]);

    await client.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);
    await client.query(`GRANT USAGE ON SCHEMA platform, core TO "${runtimeRole}"`);
    await client.query(`GRANT INSERT ON platform.outbox_events TO "${runtimeRole}"`);
    const runtimeLifecycleEventId = randomUUID();
    await client.query(`SET ROLE "${runtimeRole}"`);
    try {
      await client.query(
        `INSERT INTO platform.outbox_events (
           event_id, aggregate_type, aggregate_id, event_type, payload,
           idempotency_key, status, retry_count, available_at
         ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
           $4, 'pending', 0, now())`,
        [runtimeLifecycleEventId, recoveryEmployeeId, JSON.stringify({
          user_id: recoveryEmployeeId, company_id: companyA, employee_version: 1,
        }), `runtime-valid-${runtimeLifecycleEventId}`],
      );
      await expect(client.query(
        `INSERT INTO core.user_termination_identity_snapshots (
           lifecycle_event_id, company_id, employee_user_id,
           employee_full_name_snapshot, employee_code_snapshot, employee_version
         ) VALUES ($1, $2, $3, 'forged', 'forged', 1)`,
        [randomUUID(), companyA, recoveryEmployeeId],
      )).rejects.toMatchObject({ code: "42501" });
      await expect(client.query(
        `INSERT INTO core.user_termination_identity_evidence (
           lifecycle_event_id, company_id, employee_user_id,
           employee_full_name_snapshot, employee_code_snapshot, employee_version,
           source_reference, verified_by_user_id, approved_by_user_id
         ) VALUES ($1, $2, $3, 'forged', 'forged', 1, 'forged', $4, $5)`,
        [randomUUID(), companyA, recoveryEmployeeId, verifierUserId, approverUserId],
      )).rejects.toMatchObject({ code: "42501" });
      await expect(client.query(
        "SELECT source_reference FROM core.user_termination_identity_evidence LIMIT 1",
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("RESET ROLE");
    }
    const runtimeSnapshot = await client.query<{ lifecycle_event_id: string }>(
      `SELECT lifecycle_event_id
         FROM core.user_termination_identity_snapshots
        WHERE lifecycle_event_id = $1`,
      [runtimeLifecycleEventId],
    );
    expect(runtimeSnapshot.rows).toEqual([{ lifecycle_event_id: runtimeLifecycleEventId }]);

    await expect(client.query(
      "UPDATE core.user_termination_identity_snapshots SET employee_full_name_snapshot = 'tampered' WHERE lifecycle_event_id = $1",
      [lifecycleEventId],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(client.query(
      "DELETE FROM core.user_termination_identity_snapshots WHERE lifecycle_event_id = $1",
      [lifecycleEventId],
    )).rejects.toMatchObject({ code: "55000" });

    await expect(
      client.query(
        `INSERT INTO assets.asset_tenant_ownership_map (
           resource_type, resource_id, company_id, verification_note, verified_by_user_id
         ) VALUES ('asset', $1, $2, 'late mutation', $3)`,
        [randomUUID(), companyA, verifierUserId],
      ),
    ).rejects.toMatchObject({ code: "55000" });

    await expect(
      client.query(
        `UPDATE assets.asset_tenant_ownership_map
            SET verification_note = 'tampered evidence'
          WHERE resource_type = 'asset' AND resource_id = $1`,
        [assetId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      client.query(
        "DELETE FROM assets.asset_tenant_ownership_map WHERE resource_type = 'asset' AND resource_id = $1",
        [assetId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(withAssetWriter(client, () => client.query(
      "DELETE FROM assets.assets WHERE id = $1",
      [assetId],
    ))).rejects.toMatchObject({ code: "55000" });
    await expect(withAssetWriter(client, () => client.query(
      "UPDATE assets.assets SET id = $1 WHERE id = $2",
      [randomUUID(), assetId],
    ))).rejects.toMatchObject({ code: "55000" });

    const recoveryIdentity = await client.query<{
      employee_full_name_snapshot: string;
      employee_code_snapshot: string;
    }>(
      `SELECT employee_full_name_snapshot, employee_code_snapshot
         FROM assets.asset_recovery_tickets WHERE asset_id = $1`,
      [assetId],
    );
    expect(recoveryIdentity.rows).toEqual([{
      employee_full_name_snapshot: "Verified Original Company Employee",
      employee_code_snapshot: "RECOVERY-001",
    }]);
    await expect(
      withAssetWriter(client, () => client.query(
        "UPDATE assets.asset_recovery_tickets SET employee_full_name_snapshot = 'Mutable profile' WHERE asset_id = $1",
        [assetId],
      )),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      withAssetWriter(client, () => client.query(
        "DELETE FROM assets.asset_recovery_tickets WHERE asset_id = $1 AND lifecycle_event_id IS NULL",
        [assetId],
      )),
    ).rejects.toMatchObject({ code: "55000" });

    const runtimeTicketId = randomUUID();
    await withAssetWriter(client, () => client.query(
      `INSERT INTO assets.asset_recovery_tickets (
         id, company_id, employee_user_id, employee_full_name_snapshot,
         employee_code_snapshot, lifecycle_event_id, asset_id, assignment_id, status
       ) VALUES ($1, $2, $3, 'Original Company Employee', 'RECOVERY-001', $4, $5, $6, 'open')`,
      [runtimeTicketId, companyA, recoveryEmployeeId, lifecycleEventId, assetId, assignmentId],
    ));
    await expect(
      withAssetWriter(client, () => client.query(
        "DELETE FROM assets.asset_recovery_tickets WHERE id = $1",
        [runtimeTicketId],
      )),
    ).rejects.toMatchObject({ code: "55000" });

    const ownership = await client.query<{ table_name: string; company_id: string }>(
      `SELECT 'assets' AS table_name, company_id FROM assets.assets WHERE id = $1
       UNION ALL SELECT 'assignments', company_id FROM assets.asset_assignments WHERE id = $2
       UNION ALL SELECT 'requests', company_id FROM assets.asset_requests WHERE id = $3
       UNION ALL SELECT 'vendors', company_id FROM assets.software_vendors WHERE id = $4
       UNION ALL SELECT 'events', company_id FROM assets.asset_state_events WHERE asset_id = $1
       UNION ALL SELECT 'acknowledgements', company_id FROM assets.asset_acknowledgements WHERE asset_id = $1
       UNION ALL SELECT 'maintenance', company_id FROM assets.asset_maintenance_records WHERE asset_id = $1
       UNION ALL SELECT 'recovery', company_id FROM assets.asset_recovery_tickets WHERE asset_id = $1`,
      [assetId, assignmentId, requestId, vendorId],
    );
    expect(ownership.rows).toHaveLength(9);
    expect(new Set(ownership.rows.map((row) => row.company_id))).toEqual(
      new Set([companyA]),
    );
    const immutableEventTrigger = await client.query<{ tgenabled: string }>(
      `SELECT trigger.tgenabled
         FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'assets.asset_state_events'::regclass
          AND trigger.tgname = 'assets_state_events_immutable_trg'`,
    );
    expect(immutableEventTrigger.rows).toEqual([{ tgenabled: "O" }]);

    await expect(
      withAssetWriter(client, () =>
        client.query("UPDATE assets.assets SET company_id = $1 WHERE id = $2", [
          companyB,
          assetId,
        ]),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "assets_company_ownership_immutable",
    });

    const commandResultId = randomUUID();
    await withAssetWriter(client, () =>
      client.query(
        `INSERT INTO assets.asset_command_results (
           id, company_id, actor_user_id, action_key, idempotency_key,
           request_hash, response_status, response_body
         ) VALUES ($1, $2, $3, 'assets.test', $4, $5, 200, '{"ok":true}'::jsonb)`,
        [commandResultId, companyA, randomUUID(), randomUUID(), "a".repeat(64)],
      ),
    );
    await expect(
      withAssetWriter(client, () =>
        client.query(
          "UPDATE assets.asset_command_results SET company_id = $1 WHERE id = $2",
          [companyB, commandResultId],
        ),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "assets_company_ownership_immutable",
    });

    const companyBAsset = randomUUID();
    await withAssetWriter(client, () =>
      client.query(
        `INSERT INTO assets.assets (
           id, company_id, asset_code, qr_hash, asset_type, name, status
         ) VALUES ($1, $2, 'ASSET-1', $3, 'Laptop', 'Company B laptop', 'available')`,
        [companyBAsset, companyB, `qr-${companyBAsset}`],
      ),
    );
    await expect(
      withAssetWriter(client, () =>
        client.query(
          `INSERT INTO assets.assets (
             company_id, asset_code, qr_hash, asset_type, name, status
           ) VALUES ($1, 'ASSET-1', $2, 'Laptop', 'Duplicate', 'available')`,
          [companyA, `qr-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505", constraint: "assets_company_asset_code_uq" });

    await expect(
      withAssetWriter(client, () =>
        client.query(
          `INSERT INTO assets.asset_assignments (
             company_id, asset_id, assigned_to_user_id, assigned_by_user_id, status
           ) VALUES ($1, $2, $3, $4, 'active')`,
          [companyA, companyBAsset, randomUUID(), randomUUID()],
        ),
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "asset_assignments_company_asset_fkey",
    });

    await expect(
      client.query("DELETE FROM platform.company_profiles WHERE id = $1", [companyA]),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_company_profile_asset_reference",
    });

    const crossSchemaForeignKeys = await client.query(
      `SELECT 1
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_schema <> ccu.table_schema`,
    );
    expect(crossSchemaForeignKeys.rowCount).toBe(0);
  }, 30_000);

  it("resets both fresh and previously migrated disposable databases", async () => {
    const resetDatabaseName = `hrms_asset_reset_test_${randomUUID().replaceAll("-", "")}`;
    const resetUrl = new URL(sourceUrl);
    resetUrl.pathname = `/${resetDatabaseName}`;
    await admin.query(`CREATE DATABASE "${resetDatabaseName}"`);
    try {
      await resetPostgresDatabase(resetUrl.toString());
      await resetPostgresDatabase(resetUrl.toString());
      const resetClient = new Client({ connectionString: resetUrl.toString() });
      await resetClient.connect();
      try {
        const result = await resetClient.query<{ recovery_tickets: string; evidence: string; termination_evidence: string; snapshots: string }>(
          `SELECT
             (SELECT count(*)::text FROM assets.asset_recovery_tickets) AS recovery_tickets,
             (SELECT count(*)::text FROM assets.asset_recovery_identity_evidence) AS evidence,
             (SELECT count(*)::text FROM core.user_termination_identity_evidence) AS termination_evidence,
             (SELECT count(*)::text FROM core.user_termination_identity_snapshots) AS snapshots`,
        );
        expect(result.rows).toEqual([{ recovery_tickets: "0", evidence: "0", termination_evidence: "0", snapshots: "0" }]);
      } finally {
        await resetClient.end();
      }
    } finally {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [resetDatabaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${resetDatabaseName}"`);
    }
  }, 120_000);
});
