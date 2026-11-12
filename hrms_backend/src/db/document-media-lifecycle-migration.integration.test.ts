import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposableResetTarget } from "../platform/postgres-data-store.js";

const migrationDirectory = new URL("./migrations/", import.meta.url);
const migration71 = readFileSync(
  new URL("0071_document_media_lifecycle.sql", migrationDirectory),
  "utf8",
);
const resetSchemas =
  "assets,attendance,core,documents,ems,expenses,helpdesk,leave_wfh,platform,projects,timesheets";

const ids = {
  company1: "10000000-0000-4000-8000-000000000001",
  company2: "10000000-0000-4000-8000-000000000002",
  department: "20000000-0000-4000-8000-000000000001",
  designation: "30000000-0000-4000-8000-000000000001",
  employee1: "40000000-0000-4000-8000-000000000001",
  employee2: "40000000-0000-4000-8000-000000000002",
  currentLogo: "50000000-0000-4000-8000-000000000001",
  oldLogo: "50000000-0000-4000-8000-000000000002",
  deletedCurrentLogo: "50000000-0000-4000-8000-000000000003",
  currentProfile: "50000000-0000-4000-8000-000000000004",
  staleProfile: "50000000-0000-4000-8000-000000000005",
  employeeProof: "50000000-0000-4000-8000-000000000006",
  expenseReceipt: "50000000-0000-4000-8000-000000000007",
  unknown: "50000000-0000-4000-8000-000000000008",
  ticket: "60000000-0000-4000-8000-000000000001",
} as const;

describe("0071 legacy document ownership upgrade", () => {
  let client: Client;
  let schemaLockAcquired = false;

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "TEST_DATABASE_URL is required for the 0071 upgrade fixture.",
      );
    }
    assertDisposableResetTarget(databaseUrl);
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(
      "SELECT pg_advisory_lock(hashtext('hrms_postgres_schema_reset'))",
    );
    schemaLockAcquired = true;

    await client.query(`DROP SCHEMA IF EXISTS ${resetSchemas} CASCADE`);
    await client.query(
      "SELECT set_config('app.expense_command_v1', 'on', false)",
    );
    for (let number = 1; number <= 70; number += 1) {
      const prefix = String(number).padStart(4, "0");
      const migrationUrl = await findMigration(prefix);
      await client.query(readFileSync(migrationUrl, "utf8"));
    }
    await insertLegacyFixture(client);
    await client.query(migration71);
    await client.query(
      "SELECT set_config('app.expense_command_v1', 'off', false)",
    );
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${resetSchemas} CASCADE`);
    } finally {
      if (schemaLockAcquired) {
        await client
          .query(
            "SELECT pg_advisory_unlock(hashtext('hrms_postgres_schema_reset'))",
          )
          .catch(() => undefined);
      }
      await client.end();
    }
  });

  it("activates only mechanically proven company, current-profile, and expense owners", async () => {
    await expectOwnershipOutcomes(client);
  });

  it("enforces the post-upgrade tenant/state constraint and remains replay-safe", async () => {
    await expect(
      client.query(
        `UPDATE documents.doc_metadata
         SET lifecycle_state='active' WHERE id=$1`,
        [ids.unknown],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(client.query(migration71)).resolves.toBeDefined();
    await expectOwnershipOutcomes(client);
  });

  it("rejects ownership changes except for one audit-first legacy repair", async () => {
    await expect(
      client.query(
        "UPDATE documents.doc_metadata SET company_id=$1 WHERE id=$2",
        [ids.company2, ids.currentLogo],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "documents_metadata_company_immutable",
    });
    await expect(
      client.query(
        `UPDATE documents.doc_metadata
         SET company_id=$1,lifecycle_state='active',lifecycle_reason=NULL
         WHERE id=$2`,
        [ids.company1, ids.unknown],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "documents_metadata_company_immutable",
    });

    await client.query(
      `INSERT INTO documents.document_owner_repair_audit
       (document_id,repaired_company_id,evidence_reference,evidence_sha256,
        reviewed_by,applied_by)
       VALUES ($1,$2,'case:S25-040-M1',$3,'qa-reviewer','migration-runner')`,
      [ids.unknown, ids.company1, "a".repeat(64)],
    );
    await expect(
      client.query(
        `UPDATE documents.doc_metadata
         SET company_id=$1,lifecycle_state='active',lifecycle_reason=NULL
         WHERE id=$2`,
        [ids.company1, ids.unknown],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      client.query(
        `UPDATE documents.document_owner_repair_audit
         SET evidence_reference='case:tampered' WHERE document_id=$1`,
        [ids.unknown],
      ),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      client.query(
        "UPDATE documents.doc_metadata SET company_id=$1 WHERE id=$2",
        [ids.company2, ids.unknown],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "documents_metadata_company_immutable",
    });
  });
});

async function expectOwnershipOutcomes(client: Client): Promise<void> {
  const result = await client.query<{
    id: string;
    company_id: string | null;
    lifecycle_state: string;
    lifecycle_reason: string | null;
  }>(
    `SELECT id,company_id,lifecycle_state,lifecycle_reason
     FROM documents.doc_metadata ORDER BY id`,
  );
  const rows = new Map(result.rows.map((row) => [row.id, row]));

  expect(rows.get(ids.currentLogo)).toMatchObject({
    company_id: ids.company1,
    lifecycle_state: "active",
    lifecycle_reason: null,
  });
  expect(rows.get(ids.oldLogo)).toMatchObject({
    company_id: ids.company1,
    lifecycle_state: "replaced",
    lifecycle_reason: null,
  });
  expect(rows.get(ids.deletedCurrentLogo)).toMatchObject({
    company_id: ids.company2,
    lifecycle_state: "tombstoned",
    lifecycle_reason: null,
  });
  expect(rows.get(ids.currentProfile)).toMatchObject({
    company_id: ids.company1,
    lifecycle_state: "active",
    lifecycle_reason: null,
  });
  expect(rows.get(ids.expenseReceipt)).toMatchObject({
    company_id: ids.company1,
    lifecycle_state: "active",
    lifecycle_reason: null,
  });

  for (const documentId of [ids.staleProfile, ids.employeeProof, ids.unknown]) {
    expect(rows.get(documentId)).toMatchObject({
      company_id: null,
      lifecycle_state: "quarantined",
      lifecycle_reason: "legacy_company_owner_unverified",
    });
  }
}

async function findMigration(prefix: string): Promise<URL> {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(migrationDirectory);
  const matches = files.filter(
    (file) => file.startsWith(`${prefix}_`) && file.endsWith(".sql"),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one migration for ${prefix}; found ${matches.length}.`,
    );
  }
  return new URL(matches[0]!, migrationDirectory);
}

async function insertLegacyFixture(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO core.departments (id,department_code,name)
       VALUES ($1,'LEGACY','Legacy Department')`,
    [ids.department],
  );
  await client.query(
    `INSERT INTO core.designations (id,designation_code,title)
       VALUES ($1,'LEGACY','Legacy Designation')`,
    [ids.designation],
  );
  await client.query(
    `INSERT INTO platform.company_profiles
       (id,company_name,company_slug,status,bootstrap_completed_at)
       VALUES
       ($1,'Legacy Company One','legacy-one','active',now()),
       ($2,'Legacy Company Two','legacy-two','active',now())`,
    [ids.company1, ids.company2],
  );
  await client.query(
    `INSERT INTO core.users
       (id,employee_code,email,full_name,department_id,designation_id,hierarchy_path,
        employment_status)
       VALUES
       ($1,'LEG-001','legacy.one@example.test','Legacy One',$3,$4,'legacy_one','active'),
       ($2,'LEG-002','legacy.two@example.test','Legacy Two',$3,$4,'legacy_two','active')`,
    [ids.employee1, ids.employee2, ids.department, ids.designation],
  );
  await client.query(
    `INSERT INTO platform.user_session_preferences (user_id,active_role,company_id)
       VALUES
       ($1,'Employee',$3),
       ($2,'Employee',$4)`,
    [ids.employee1, ids.employee2, ids.company1, ids.company2],
  );

  const documents = [
    [ids.currentLogo, "company_profile", ids.company1, "company_logo", null],
    [ids.oldLogo, "company_profile", ids.company1, "company_logo", null],
    [
      ids.deletedCurrentLogo,
      "company_profile",
      ids.company2,
      "company_logo",
      new Date(),
    ],
    [ids.currentProfile, "core_user", ids.employee1, "profile_photo", null],
    [ids.staleProfile, "core_user", ids.employee1, "profile_photo", null],
    [ids.employeeProof, "employee", ids.employee1, "identity_proof", null],
    [ids.expenseReceipt, "expense_ticket", ids.ticket, "invoice", null],
    [ids.unknown, "unknown_parent", ids.employee1, "misc", null],
  ] as const;
  for (const [id, parentType, parentId, documentType, deletedAt] of documents) {
    await client.query(
      `INSERT INTO documents.doc_metadata
       (id,business_object_type,business_object_id,owner_user_id,classification,
        document_type,file_name,storage_key,mime_type,size_bytes,created_by_user_id,deleted_at)
       VALUES ($1,$2,$3,$4,'internal',$5,$6,$7,'application/octet-stream',16,$4,$8)`,
      [
        id,
        parentType,
        parentId,
        ids.employee1,
        documentType,
        `${id}.bin`,
        `legacy/${id}`,
        deletedAt,
      ],
    );
  }

  await client.query(
    "UPDATE platform.company_profiles SET logo_document_id=$1 WHERE id=$2",
    [ids.currentLogo, ids.company1],
  );
  await client.query(
    "UPDATE platform.company_profiles SET logo_document_id=$1 WHERE id=$2",
    [ids.deletedCurrentLogo, ids.company2],
  );
  await client.query(
    "UPDATE core.users SET profile_photo_document_id=$1 WHERE id=$2",
    [ids.currentProfile, ids.employee1],
  );
  await client.query(
    "SELECT set_config('app.expense_command_v1', 'on', false)",
  );
  await client.query(
    `INSERT INTO expenses.expense_tickets
       (id,ticket_no,requester_user_id,requester_role_snapshot,department_id,
        expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
        estimated_amount,payment_type,status,company_id,owner_resolution_status,
        owner_resolution_reason,context_payload)
       VALUES
       ($1,'LEG-EXP-001',$2,'Employee',$3,'travel','other','Legacy expense',
        'Legacy expense fixture','2026-01-01','2026-01-01',100,'reimbursement',
        'Draft',$4::uuid,'typed_creation',NULL,
        jsonb_build_object('company_id',($4::uuid)::text))`,
    [ids.ticket, ids.employee1, ids.department, ids.company1],
  );
}
