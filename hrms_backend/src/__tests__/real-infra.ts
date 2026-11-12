import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { RequiredDocumentsByExpenseSubType } from "#shared";
import { buildApp } from "../app.js";
import { assertDisposableResetTarget, resetPostgresDatabase } from "../platform/postgres-data-store.js";

let openAppCount = 0;
let activeTestDatabaseUrl: string | undefined;
let previousDatabaseUrl: string | undefined;
let resetInProgress = false;

function sameDatabaseTarget(left: string, right: string | undefined): boolean {
  if (!right) return false;
  try {
    const a = new URL(left);
    const b = new URL(right);
    const host = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? "loopback"
      : url.hostname;
    return host(a) === host(b)
      && (a.port || "5432") === (b.port || "5432")
      && decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname);
  } catch {
    return left === right;
  }
}

function acquireTestDatabaseUrl(databaseUrl: string): () => void {
  if (openAppCount > 0 && activeTestDatabaseUrl !== databaseUrl) {
    throw new Error("Cannot use a different test database while another test app is open.");
  }
  if (openAppCount === 0) previousDatabaseUrl = process.env.DATABASE_URL;
  openAppCount += 1;
  activeTestDatabaseUrl = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openAppCount -= 1;
    if (openAppCount > 0) return;
    activeTestDatabaseUrl = undefined;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    previousDatabaseUrl = undefined;
  };
}

const realAppDatabases = new WeakMap<FastifyInstance, string>();
const replicaCapability = Symbol("validated-real-app-replica");

function trustedFixtureDatabase(app: FastifyInstance): string {
  const databaseUrl = realAppDatabases.get(app);
  if (!databaseUrl || databaseUrl !== process.env.TEST_DATABASE_URL) {
    throw new Error("Trusted SQL fixtures require an app created for TEST_DATABASE_URL");
  }
  return databaseUrl;
}

export interface TrustedExpenseDocumentFixture {
  id: string;
  document_type: string;
}

/**
 * Creates relationally valid expense-document rows without exercising the
 * intentionally unavailable SQL receipt API. Integration tests may use this
 * helper only to reach later expense workflow states while TEN-S25-021 owns
 * transaction-safe private byte storage.
 */
export async function seedTrustedExpenseDocumentFixtures(
  app: FastifyInstance,
  input: {
    ticketId: string;
    uploadedByUserId: string;
    documentTypes: readonly string[];
  },
): Promise<TrustedExpenseDocumentFixture[]> {
  trustedFixtureDatabase(app);
  const pool = app.store.pgPool;
  if (!pool) throw new Error("PostgreSQL pool required for expense document fixture");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
    const ticket = await client.query<{ company_id: string; expense_sub_type: string }>(
      `SELECT company_id,expense_sub_type FROM expenses.expense_tickets
       WHERE id=$1 AND company_id IS NOT NULL
         AND owner_resolution_status='typed_creation' AND deleted_at IS NULL
       FOR SHARE`,
      [input.ticketId],
    );
    if (!ticket.rows[0]) throw new Error("Typed expense ticket fixture required");
    const requiredTypes = new Set(
      RequiredDocumentsByExpenseSubType[
        ticket.rows[0].expense_sub_type as keyof typeof RequiredDocumentsByExpenseSubType
      ] ?? [],
    );
    if (
      new Set(input.documentTypes).size !== input.documentTypes.length ||
      input.documentTypes.some((documentType) => !requiredTypes.has(documentType))
    ) {
      throw new Error("Expense document fixtures must be unique required document types");
    }
    const uploader = await client.query(
      `SELECT 1 FROM platform.user_session_preferences
       WHERE user_id=$1 AND company_id=$2 FOR SHARE`,
      [input.uploadedByUserId, ticket.rows[0].company_id],
    );
    if (!uploader.rows[0]) {
      throw new Error("Expense document fixture uploader must belong to the ticket company");
    }
    const fixtures: TrustedExpenseDocumentFixture[] = [];
    for (const documentType of input.documentTypes) {
      const id = randomUUID();
      const storageKey = `trusted-expense-fixture/${input.ticketId}/${id}`;
      const fileName = `${documentType}.pdf`;
      await client.query(
        `INSERT INTO documents.doc_metadata
          (id,business_object_type,business_object_id,classification,document_type,
           current_version,file_name,storage_key,mime_type,size_bytes,created_by_user_id)
         VALUES ($1,'expense_ticket',$2,'finance',$3,1,$4,$5,'application/pdf',12,$6)`,
        [id, input.ticketId, documentType, fileName, storageKey, input.uploadedByUserId],
      );
      await client.query(
        `INSERT INTO documents.doc_versions
          (document_id,version,storage_key,file_name,size_bytes,created_by_user_id)
         VALUES ($1,1,$2,$3,12,$4)`,
        [id, storageKey, fileName, input.uploadedByUserId],
      );
      await client.query(
        `INSERT INTO expenses.expense_documents
          (ticket_id,document_id,document_type,verification_status,uploaded_by)
         VALUES ($1,$2,$3,'pending',$4)`,
        [input.ticketId, id, documentType, input.uploadedByUserId],
      );
      fixtures.push({ id, document_type: documentType });
    }
    await client.query("COMMIT");
    return fixtures;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Marks only the supplied trusted fixture links verified; not a runtime path. */
export async function verifyTrustedExpenseDocumentFixtures(
  app: FastifyInstance,
  input: { ticketId: string; documentIds: readonly string[] },
): Promise<void> {
  trustedFixtureDatabase(app);
  if (
    input.documentIds.length === 0 ||
    new Set(input.documentIds).size !== input.documentIds.length
  ) {
    throw new Error("Trusted expense document verification requires unique fixture IDs");
  }
  const pool = app.store.pgPool;
  if (!pool) throw new Error("PostgreSQL pool required for expense document fixture");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
    const updated = await client.query(
      `UPDATE expenses.expense_documents link
       SET verification_status='verified'
       FROM documents.doc_metadata metadata,
            documents.doc_versions current_version
       WHERE link.ticket_id=$1
         AND link.document_id=ANY($2::uuid[])
         AND link.verification_status='pending'
         AND metadata.id=link.document_id
         AND metadata.business_object_type='expense_ticket'
         AND metadata.business_object_id=link.ticket_id
         AND metadata.classification='finance'
         AND metadata.document_type=link.document_type
         AND metadata.deleted_at IS NULL
         AND metadata.size_bytes>0
         AND current_version.document_id=metadata.id
         AND current_version.version=metadata.current_version
         AND current_version.storage_key=metadata.storage_key
         AND current_version.size_bytes=metadata.size_bytes
         AND current_version.checksum_sha256 IS NOT DISTINCT FROM metadata.checksum_sha256
         AND current_version.size_bytes>0`,
      [input.ticketId, input.documentIds],
    );
    if (updated.rowCount !== input.documentIds.length) {
      throw new Error("Every trusted expense document fixture must be pending");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function buildRealAppInternal(
  options: { reset?: boolean },
  capability?: symbol,
): Promise<FastifyInstance> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for real integration tests.");
  }
  const reset = options.reset ?? true;
  if (!reset && capability !== replicaCapability) {
    throw new Error("Use buildRealAppReplica() to attach without resetting the disposable database.");
  }
  // Both the resetter and a second non-resetting API instance must use a
  // loopback disposable test database. The first instance temporarily sets
  // DATABASE_URL to TEST_DATABASE_URL, so equality alone is not a reason to
  // reject the second instance when it will not reset the database.
  assertDisposableResetTarget(databaseUrl);
  if (resetInProgress) {
    throw new Error("Cannot start another test app while the test database is resetting.");
  }
  if (openAppCount > 0 && activeTestDatabaseUrl !== databaseUrl) {
    throw new Error("Cannot use a different test database while another test app is open.");
  }
  if (openAppCount > 0 && reset) {
    throw new Error("Cannot reset the test database while another test app is open.");
  }
  if (reset && sameDatabaseTarget(databaseUrl, process.env.DATABASE_URL) && process.env.HRMS_ALLOW_DATABASE_URL_TEST_RESET !== "true") {
    throw new Error(
      "Refusing to reset DATABASE_URL for integration tests. Set TEST_DATABASE_URL to a separate test database."
    );
  }
  if (reset) {
    resetInProgress = true;
    try {
      await resetPostgresDatabase(databaseUrl);
    } finally {
      resetInProgress = false;
    }
  }
  const releaseDatabaseUrl = acquireTestDatabaseUrl(databaseUrl);
  try {
    const app = await buildApp({ dataStoreMode: "postgres", seedIfEmpty: true, rateLimit: false });
    realAppDatabases.set(app, databaseUrl);
    app.addHook("onClose", async () => {
      releaseDatabaseUrl();
    });
    return app;
  } catch (error) {
    releaseDatabaseUrl();
    throw error;
  }
}

export async function buildRealApp(
  options: { reset?: boolean } = {},
): Promise<FastifyInstance> {
  return buildRealAppInternal(options);
}

export async function buildRealAppReplica(
  sourceApp: FastifyInstance,
): Promise<FastifyInstance> {
  const sourceDatabaseUrl = realAppDatabases.get(sourceApp);
  if (!sourceDatabaseUrl || sourceDatabaseUrl !== process.env.TEST_DATABASE_URL) {
    throw new Error("Replica source must be a validated disposable TEST_DATABASE_URL app");
  }
  return buildRealAppInternal({ reset: false }, replicaCapability);
}
