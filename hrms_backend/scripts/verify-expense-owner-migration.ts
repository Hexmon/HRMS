import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// This check expects a newly created, disposable local test database. The
// caller owns its creation and unconditional removal after the process exits.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
const target = new URL(databaseUrl);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !/(?:^|[_-])test(?:$|[_-])/i.test(target.pathname.slice(1)) ||
  target.search || target.hash
) throw new Error("Refusing non-disposable database target");

const client = new Client({ connectionString: databaseUrl });
const migrationDirectory = join(process.cwd(), "src/db/migrations");
const companyA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const missingCompany = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const requester = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const department = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ticketIds = {
  valid: "11111111-1111-4111-8111-111111111111",
  missingAudit: "22222222-2222-4222-8222-222222222222",
  malformed: "33333333-3333-4333-8333-333333333333",
  nonexistent: "44444444-4444-4444-8444-444444444444",
  newTyped: "55555555-5555-4555-8555-555555555555",
  newLegacy: "66666666-6666-4666-8666-666666666666",
};

async function insertHistoricalTicket(id: string, code: string, recordedCompany: string) {
  await client.query(
    `INSERT INTO expenses.expense_tickets
      (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
       expense_type, expense_sub_type, task_title, task_description,
       start_date, end_date, estimated_amount, payment_type, status, context_payload)
     VALUES ($1, $2, $3, 'Employee', $4, 'travel', 'local', 'Fixture', 'Fixture',
             CURRENT_DATE, CURRENT_DATE, 100, 'reimbursement', 'Draft',
             jsonb_build_object('company_id', $5::text))`,
    [id, code, requester, department, recordedCompany],
  );
}

async function command<T>(run: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
    const result = await run();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function transaction<T>(run: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await run();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// The marker is transaction-local defense in depth, not authorization. A
// production repair must additionally run under the dedicated migration role;
// the application runtime role must not be able to insert repair evidence.
async function ownerRepairTransaction<T>(
  run: () => Promise<T>,
  options: { setRepairMarker?: boolean } = {},
): Promise<T> {
  return transaction(async () => {
    await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
    if (options.setRepairMarker ?? true) {
      await client.query("SELECT set_config('app.expense_owner_repair_v1', 'on', true)");
    }
    return run();
  });
}

try {
  await client.connect();
  const files = readdirSync(migrationDirectory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const file of files.filter((name) => name.slice(0, 4) < "0068")) {
    await client.query(readFileSync(join(migrationDirectory, file), "utf8"));
  }
  await client.query(
    `INSERT INTO platform.company_profiles (id, company_name, company_slug, status)
     VALUES ($1, 'Original', 'expense-original', 'inactive'),
            ($2, 'Other', 'expense-other', 'active')`,
    [companyA, companyB],
  );
  await client.query(
    `INSERT INTO core.departments (id, department_code, name) VALUES ($1, 'EXP-TEST', 'Test')`,
    [department],
  );
  await client.query(
    `INSERT INTO core.users (id, employee_code, email, full_name, hierarchy_path, employment_status)
     VALUES ($1, 'EXP-TEST', 'expense.fixture@example.test', 'Fixture', 'fixture', 'active')`,
    [requester],
  );
  await insertHistoricalTicket(ticketIds.valid, "EXP-VALID", companyA);
  await insertHistoricalTicket(ticketIds.missingAudit, "EXP-NO-AUDIT", companyA);
  await insertHistoricalTicket(ticketIds.malformed, "EXP-MALFORMED", "not-a-uuid");
  await insertHistoricalTicket(ticketIds.nonexistent, "EXP-NO-COMPANY", missingCompany);
  await client.query(
    `INSERT INTO expenses.expense_audit_logs
       (ticket_id, actor_user_id, event_type) VALUES ($1, $2, 'expense.created')`,
    [ticketIds.valid, requester],
  );

  await client.query(readFileSync(join(migrationDirectory, "0068_expense_original_company_owner.sql"), "utf8"));
  const owners = await client.query<{
    id: string; company_id: string | null; owner_resolution_status: string; owner_resolution_reason: string | null
  }>(
    `SELECT id, company_id, owner_resolution_status, owner_resolution_reason
     FROM expenses.expense_tickets ORDER BY id`,
  );
  const byId = new Map(owners.rows.map((row) => [row.id, row]));
  for (const id of [ticketIds.valid, ticketIds.missingAudit, ticketIds.malformed, ticketIds.nonexistent]) {
    assert.equal(byId.get(id)?.company_id, null);
    assert.equal(byId.get(id)?.owner_resolution_status, "quarantined");
    assert.equal(byId.get(id)?.owner_resolution_reason, "legacy_owner_unverified");
  }
  assert.equal(owners.rows.length, 4);
  const guards = await client.query<{ count: string }>(
    `SELECT count(*) FROM pg_trigger trigger
     JOIN pg_class relation ON relation.oid = trigger.tgrelid
     JOIN pg_namespace schema ON schema.oid = relation.relnamespace
     WHERE schema.nspname = 'expenses'
       AND trigger.tgname LIKE '%_command_guard_trg'
       AND NOT trigger.tgisinternal`,
  );
  assert.equal(Number(guards.rows[0]?.count), 8);
  for (const table of [
    "expense_line_items", "expense_approvals", "expense_audit_logs",
    "expense_documents", "expense_payments", "employee_reviewer_mappings",
    "expense_policy_rules",
  ]) {
    await assert.rejects(
      client.query(`INSERT INTO expenses.${table} DEFAULT VALUES`),
      (error: unknown) => (error as { message?: string }).message?.includes("transaction-owned command") === true,
      `${table} must reject legacy inserts before any row is written`,
    );
  }

  const repairInvariantError = (error: unknown) =>
    (error as { constraint?: string }).constraint === "expense_owner_repair_evidence_consistency";
  await assert.rejects(ownerRepairTransaction(async () => {
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='audited_repair', owner_resolution_reason=NULL WHERE id=$1`,
      [ticketIds.missingAudit, companyA],
    );
  }), repairInvariantError, "the repair marker without evidence must fail");
  assert.equal(Number((await client.query(
    "SELECT count(*) FROM expenses.expense_owner_repair_audit WHERE ticket_id=$1",
    [ticketIds.missingAudit],
  )).rows[0]?.count), 0);
  assert.equal((await client.query(
    "SELECT owner_resolution_status FROM expenses.expense_tickets WHERE id=$1",
    [ticketIds.missingAudit],
  )).rows[0]?.owner_resolution_status, "quarantined");
  await assert.rejects(ownerRepairTransaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id,context_payload,$2,'mismatch-fixture',$3,'fixture-reviewer','fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.missingAudit, companyB, "c".repeat(64)],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='audited_repair', owner_resolution_reason=NULL WHERE id=$1`,
      [ticketIds.missingAudit, companyA],
    );
  }), repairInvariantError, "repair evidence company must match the repaired ticket owner");
  assert.equal(Number((await client.query(
    "SELECT count(*) FROM expenses.expense_owner_repair_audit WHERE ticket_id=$1",
    [ticketIds.missingAudit],
  )).rows[0]?.count), 0, "a failed repair must roll back its audit row atomically");
  assert.equal((await client.query(
    "SELECT company_id,owner_resolution_status FROM expenses.expense_tickets WHERE id=$1",
    [ticketIds.missingAudit],
  )).rows[0]?.company_id, null, "a failed repair must leave the ticket quarantined");
  await assert.rejects(ownerRepairTransaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id,context_payload,$2,'audit-without-marker',$3,'fixture-reviewer','fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.missingAudit, companyA, "f".repeat(64)],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='audited_repair', owner_resolution_reason=NULL WHERE id=$1`,
      [ticketIds.missingAudit, companyA],
    );
  }, { setRepairMarker: false }), repairInvariantError, "matching evidence without the repair marker must fail");
  assert.equal(Number((await client.query(
    "SELECT count(*) FROM expenses.expense_owner_repair_audit WHERE ticket_id=$1",
    [ticketIds.missingAudit],
  )).rows[0]?.count), 0, "the audit-only failure must roll back evidence");
  const protectedRepairFields = (await client.query(
    `SELECT company_id,owner_resolution_status,owner_resolution_reason,status,context_payload
     FROM expenses.expense_tickets WHERE id=$1`,
    [ticketIds.missingAudit],
  )).rows[0];
  await assert.rejects(ownerRepairTransaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id,context_payload,$2,'overbroad-repair-fixture',$3,'fixture-reviewer','fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.missingAudit, companyA, "9".repeat(64)],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='audited_repair', owner_resolution_reason=NULL,
       status='Submitted', context_payload=context_payload || '{"tampered":true}'::jsonb
       WHERE id=$1`,
      [ticketIds.missingAudit, companyA],
    );
  }), repairInvariantError, "owner repair must not alter status, context or other ticket fields");
  assert.deepEqual((await client.query(
    `SELECT company_id,owner_resolution_status,owner_resolution_reason,status,context_payload
     FROM expenses.expense_tickets WHERE id=$1`,
    [ticketIds.missingAudit],
  )).rows[0], protectedRepairFields, "an overbroad repair must roll back the whole ticket change");
  assert.equal(Number((await client.query(
    "SELECT count(*) FROM expenses.expense_owner_repair_audit WHERE ticket_id=$1",
    [ticketIds.missingAudit],
  )).rows[0]?.count), 0, "an overbroad repair must roll back its audit row");
  await assert.rejects(ownerRepairTransaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id,context_payload,$2,'missing-company-fixture',$3,'fixture-reviewer','fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.nonexistent, missingCompany, "8".repeat(64)],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='audited_repair', owner_resolution_reason=NULL WHERE id=$1`,
      [ticketIds.nonexistent, missingCompany],
    );
  }), repairInvariantError, "owner repair must reject a nonexistent company identity");
  assert.equal(Number((await client.query(
    "SELECT count(*) FROM expenses.expense_owner_repair_audit WHERE ticket_id=$1",
    [ticketIds.nonexistent],
  )).rows[0]?.count), 0, "a nonexistent-company repair must roll back evidence");
  assert.deepEqual((await client.query(
    `SELECT company_id,owner_resolution_status FROM expenses.expense_tickets WHERE id=$1`,
    [ticketIds.nonexistent],
  )).rows[0], { company_id: null, owner_resolution_status: "quarantined" });
  await assert.rejects(transaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id,context_payload,$2,'non-repair-fixture',$3,'fixture-reviewer','fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.valid, companyA, "d".repeat(64)],
    );
  }), repairInvariantError, "non-audited tickets must reject repair evidence");

  // An ordinary write cannot adopt or mutate a quarantined/historical owner.
  await assert.rejects(command(() => client.query(
    `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='typed_creation', owner_resolution_reason=NULL
     WHERE id=$1`, [ticketIds.missingAudit, companyA],
  )));
  assert.notEqual((await client.query(
    "SELECT current_setting('app.expense_command_v1', true) AS marker",
  )).rows[0]?.marker, "on", "rollback must clear the transaction marker on connection reuse");
  await assert.rejects(command(() => client.query(
    `UPDATE expenses.expense_tickets SET company_id=$2 WHERE id=$1`,
    [ticketIds.valid, companyB],
  )));
  await assert.rejects(command(() => client.query(
    `UPDATE expenses.expense_tickets SET context_payload=jsonb_build_object('company_id', $2::text)
     WHERE id=$1`, [ticketIds.valid, companyB],
  )));
  await assert.rejects(insertHistoricalTicket(ticketIds.newLegacy, "EXP-LEGACY", companyA));

  await assert.rejects(client.query(
    `INSERT INTO expenses.expense_tickets
      (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
       expense_type, expense_sub_type, task_title, task_description,
       start_date, end_date, estimated_amount, payment_type, status,
       context_payload, company_id, owner_resolution_status)
     VALUES ($1, 'EXP-TYPED-NO-MARKER', $2, 'Employee', $3, 'travel', 'local', 'Fixture', 'Fixture',
             CURRENT_DATE, CURRENT_DATE, 100, 'reimbursement', 'Draft',
             jsonb_build_object('company_id', $4::text), $4::uuid, 'typed_creation')`,
    [ticketIds.newTyped, requester, department, companyA],
  ));
  await command(() => client.query(
    `INSERT INTO expenses.expense_tickets
      (id, ticket_no, requester_user_id, requester_role_snapshot, department_id,
       expense_type, expense_sub_type, task_title, task_description,
       start_date, end_date, estimated_amount, payment_type, status,
       context_payload, company_id, owner_resolution_status)
     VALUES ($1, 'EXP-TYPED', $2, 'Employee', $3, 'travel', 'local', 'Fixture', 'Fixture',
             CURRENT_DATE, CURRENT_DATE, 100, 'reimbursement', 'Draft',
             jsonb_build_object('company_id', $4::text), $4::uuid, 'typed_creation')`,
    [ticketIds.newTyped, requester, department, companyA],
  ));
  assert.notEqual((await client.query(
    "SELECT current_setting('app.expense_command_v1', true) AS marker",
  )).rows[0]?.marker, "on", "commit must clear the transaction marker on connection reuse");
  assert.equal((await client.query(
    `SELECT company_id FROM expenses.expense_tickets WHERE id=$1`, [ticketIds.newTyped],
  )).rows[0]?.company_id, companyA);
  await assert.rejects(client.query(
    `UPDATE expenses.expense_tickets SET status=status WHERE id=$1`, [ticketIds.newTyped],
  ));
  await assert.rejects(command(() => client.query(
    `UPDATE expenses.expense_tickets SET company_id=$2 WHERE id=$1`,
    [ticketIds.newTyped, companyB],
  )));
  // Simulate only the separate privileged forward repair using independently
  // reviewed A evidence. Keep contradictory legacy JSON intact in its audit.
  await ownerRepairTransaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id, context_payload, $2, 'local-independent-fixture', $3, 'fixture-reviewer', 'fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.malformed, companyA, "a".repeat(64)],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
        owner_resolution_status='audited_repair', owner_resolution_reason=NULL WHERE id=$1`,
      [ticketIds.malformed, companyA],
    );
  });
  await command(() => client.query(
    `UPDATE expenses.expense_tickets SET status='Submitted', version=version+1 WHERE id=$1`,
    [ticketIds.malformed],
  ));
  assert.equal((await client.query("SELECT company_id FROM expenses.expense_tickets WHERE id=$1", [ticketIds.malformed])).rows[0]?.company_id, companyA);
  await ownerRepairTransaction(async () => {
    await client.query(
      `INSERT INTO expenses.expense_owner_repair_audit
       (ticket_id,original_context_payload,repaired_company_id,evidence_reference,evidence_sha256,reviewed_by,applied_by)
       SELECT id,context_payload,$2,'ticket-first-fixture',$3,'fixture-reviewer','fixture-operator'
       FROM expenses.expense_tickets WHERE id=$1`,
      [ticketIds.missingAudit, companyA, "e".repeat(64)],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2,
       owner_resolution_status='audited_repair', owner_resolution_reason=NULL WHERE id=$1`,
      [ticketIds.missingAudit, companyA],
    );
  });
  for (const id of [ticketIds.malformed, ticketIds.missingAudit]) {
    await assert.rejects(client.query(
      "UPDATE expenses.expense_owner_repair_audit SET reviewed_by='changed' WHERE ticket_id=$1",
      [id],
    ), /immutable audit\/log rows/u);
    await assert.rejects(client.query(
      "DELETE FROM expenses.expense_owner_repair_audit WHERE ticket_id=$1",
      [id],
    ), /immutable audit\/log rows/u);
  }
  await assert.rejects(command(() => client.query(
    `UPDATE expenses.expense_tickets SET context_payload='{}'::jsonb WHERE id=$1`, [ticketIds.malformed],
  )));
  await assert.rejects(command(async () => {
    await client.query(
      `INSERT INTO platform.outbox_events
        (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
       VALUES ('expense_ticket', $1, 'expense.test', jsonb_build_object('company_id', $2::text), 'expense-test-rollback')`,
      [ticketIds.newTyped, companyA],
    );
    await client.query(
      `UPDATE expenses.expense_tickets SET company_id=$2 WHERE id=$1`,
      [ticketIds.newTyped, companyB],
    );
  }));
  assert.equal(Number((await client.query(
    `SELECT count(*) FROM platform.outbox_events WHERE idempotency_key='expense-test-rollback'`,
  )).rows[0]?.count), 0);
  await client.query(
    `INSERT INTO expenses.expense_command_results
     (company_id,actor_user_id,ticket_id,action,idempotency_key,request_hash,response_body)
     VALUES ($1,$2,$3,'finance.approve','repeatable-migration-key',$4,$5::jsonb)`,
    [companyA, requester, ticketIds.newTyped, "b".repeat(64),
      JSON.stringify({ id: ticketIds.newTyped, status: "Draft", version: 1 })],
  );
  const typedBeforeRepeat = (await client.query(
    `SELECT company_id,owner_resolution_status,status,version FROM expenses.expense_tickets WHERE id=$1`,
    [ticketIds.newTyped],
  )).rows[0];
  await client.query(readFileSync(join(migrationDirectory, "0068_expense_original_company_owner.sql"), "utf8"));
  assert.deepEqual((await client.query(
    `SELECT company_id,owner_resolution_status,status,version FROM expenses.expense_tickets WHERE id=$1`,
    [ticketIds.newTyped],
  )).rows[0], typedBeforeRepeat, "a second migration apply must not re-quarantine typed tickets");
  assert.equal((await client.query(
    `SELECT response_body->>'status' AS status FROM expenses.expense_command_results
     WHERE ticket_id=$1`, [ticketIds.newTyped],
  )).rows[0]?.status, "Draft");
  assert.equal(Number((await client.query(
    `SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%_command_guard_trg' AND NOT tgisinternal`,
  )).rows[0]?.count), 8);
  await assert.rejects(client.query(
    `UPDATE expenses.expense_tickets SET status=status WHERE id=$1`, [ticketIds.newTyped],
  ));
  console.log("Expense owner migration passed: four historical tickets quarantined, typed insert and eight write guards.");
} finally {
  await client.end().catch(() => undefined);
}
