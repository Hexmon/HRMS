import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loginAs } from "#testing";
import type { ObjectStoragePort } from "../../../platform/data-store.js";
import { MemoryObjectStorage, ObjectStorageProviderError } from "../../../platform/object-storage.js";
import { buildRealApp, buildRealAppReplica } from "../../../__tests__/real-infra.js";
import { MediaLifecycleService, type DurableMediaUploadInput } from "../media-lifecycle.js";
import { reconcileMedia, type JobQueue, type MediaBucket } from "../../../workers/cloudflare-jobs.js";

describe("TEN-S25-021 durable media lifecycle", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("replays a lost response and rejects changed payload without another provider call", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const put = vi.spyOn(app.store.objectStorage!, "putObject");
    const service = new MediaLifecycleService(app.store.pgPool!, app.store.objectStorage!);
    const input = logoInput(admin.user, parent, "media-logo-replay-001", Buffer.from("logo-one"));

    const first = await service.upload(input);
    const replay = await service.upload(input);
    expect(replay.document.id).toBe(first.document.id);
    expect(put).toHaveBeenCalledTimes(1);

    await expect(service.upload({ ...input, body: Buffer.from("changed") })).rejects.toMatchObject({ statusCode: 409 });
    expect(put).toHaveBeenCalledTimes(1);
    const rows = await app.store.pgPool!.query(
      "SELECT state,count(*)::int AS count FROM documents.media_upload_intents GROUP BY state",
    );
    expect(rows.rows).toContainEqual({ state: "finalized", count: 1 });
  });

  it("converges concurrent identical prepare requests on one intent and one PUT", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const base = new MemoryObjectStorage();
    const put = vi.fn(async (key: string, body: Buffer, metadata?: Record<string, string>) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return base.putObject(key, body, metadata);
    });
    const storage: ObjectStoragePort = {
      kind: "memory",
      bucket: "concurrent-key-test",
      putObject: put,
      getObject: (key) => base.getObject(key),
      statObject: (key) => base.statObject(key),
      removeObject: (key) => base.removeObject(key),
    };
    const input = logoInput(admin.user, parent, "media-concurrent-key-001", Buffer.from("same-logo"));
    const [left, right] = await Promise.all([
      new MediaLifecycleService(app.store.pgPool!, storage).upload(input),
      new MediaLifecycleService(app.store.pgPool!, storage).upload(input),
    ]);
    expect(left.document.id).toBe(right.document.id);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("recovers an ambiguous PUT timeout by HEADing the fixed opaque key", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const memory = new MemoryObjectStorage();
    let first = true;
    const storage: ObjectStoragePort = {
      kind: "memory",
      bucket: "ambiguous-test",
      async putObject(key, body, metadata) {
        const result = await memory.putObject(key, body, metadata);
        if (first) {
          first = false;
          throw new ObjectStorageProviderError("timeout", "synthetic ambiguous timeout");
        }
        return result;
      },
      getObject: (key) => memory.getObject(key),
      statObject: (key) => memory.statObject(key),
      removeObject: (key) => memory.removeObject(key),
    };
    const stat = vi.spyOn(storage, "statObject");
    const result = await new MediaLifecycleService(app.store.pgPool!, storage).upload(
      logoInput(admin.user, parent, "media-logo-timeout-001", Buffer.from("timeout-logo")),
    );
    expect(result.state).toBe("finalized");
    expect(stat).toHaveBeenCalledTimes(1);
  });

  it("retains an uploaded object when final SQL publication loses its version race", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const memory = new MemoryObjectStorage();
    let uploadedKey = "";
    const storage: ObjectStoragePort = {
      kind: "memory",
      bucket: "rollback-test",
      async putObject(key, body, metadata) {
        uploadedKey = key;
        const stored = await memory.putObject(key, body, metadata);
        await app.store.pgPool!.query(
          "UPDATE platform.company_profiles SET version=version+1 WHERE id=$1",
          [parent.companyId],
        );
        return stored;
      },
      getObject: (key) => memory.getObject(key),
      statObject: (key) => memory.statObject(key),
      removeObject: (key) => memory.removeObject(key),
    };
    await expect(new MediaLifecycleService(app.store.pgPool!, storage).upload(
      logoInput(admin.user, parent, "media-logo-rollback-001", Buffer.from("rollback-logo")),
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(await memory.statObject(uploadedKey)).toMatchObject({ size: 13 });
    const intent = await app.store.pgPool!.query(
      "SELECT state FROM documents.media_upload_intents WHERE idempotency_key='media-logo-rollback-001'",
    );
    expect(intent.rows[0]?.state).toBe("object_confirmed");
    const metadata = await app.store.pgPool!.query(
      "SELECT count(*)::int AS count FROM documents.doc_metadata WHERE storage_key=$1",
      [uploadedKey],
    );
    expect(metadata.rows[0]?.count).toBe(0);
  });

  it("allows only one simultaneous replacement to publish and never removes either object", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const remove = vi.spyOn(app.store.objectStorage!, "removeObject");
    const serviceA = new MediaLifecycleService(app.store.pgPool!, app.store.objectStorage!);
    const serviceB = new MediaLifecycleService(app.store.pgPool!, app.store.objectStorage!);
    const outcomes = await Promise.allSettled([
      serviceA.upload(logoInput(admin.user, parent, "media-race-a-001", Buffer.from("logo-a"))),
      serviceB.upload(logoInput(admin.user, parent, "media-race-b-001", Buffer.from("logo-b"))),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(remove).not.toHaveBeenCalled();
    const active = await app.store.pgPool!.query(
      "SELECT count(*)::int AS count FROM documents.doc_metadata WHERE company_id=$1 AND lifecycle_state='active' AND document_type='company_logo'",
      [parent.companyId],
    );
    expect(active.rows[0]?.count).toBe(1);
  });

  it("revalidates live role before finalize and leaves bytes unrenderable", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const memory = new MemoryObjectStorage();
    let uploadedKey = "";
    const storage: ObjectStoragePort = {
      kind: "memory",
      bucket: "role-change-test",
      async putObject(key, body, metadata) {
        uploadedKey = key;
        const stored = await memory.putObject(key, body, metadata);
        await app.store.pgPool!.query(
          "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Admin'",
          [admin.user.id],
        );
        return stored;
      },
      getObject: (key) => memory.getObject(key),
      statObject: (key) => memory.statObject(key),
      removeObject: (key) => memory.removeObject(key),
    };
    await expect(new MediaLifecycleService(app.store.pgPool!, storage).upload(
      logoInput(admin.user, parent, "media-role-change-001", Buffer.from("role-logo")),
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(await memory.statObject(uploadedKey)).not.toBeNull();
    const published = await app.store.pgPool!.query(
      "SELECT count(*)::int AS count FROM documents.doc_metadata WHERE storage_key=$1",
      [uploadedKey],
    );
    expect(published.rows[0]?.count).toBe(0);
  });

  it("recovers retryable bytes once across duplicate workers and respects a live lease", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const memory = new MemoryObjectStorage();
    const storage: ObjectStoragePort = {
      kind: "memory",
      bucket: "reconcile-test",
      async putObject(key, body, metadata) {
        await memory.putObject(key, body, metadata);
        throw new ObjectStorageProviderError("unavailable", "synthetic lost provider response");
      },
      getObject: (key) => memory.getObject(key),
      statObject: (key) => memory.statObject(key),
      removeObject: (key) => memory.removeObject(key),
    };
    await expect(new MediaLifecycleService(app.store.pgPool!, storage).upload(
      logoInput(admin.user, parent, "media-reconcile-001", Buffer.from("reconcile-logo")),
    )).rejects.toMatchObject({ code: "unavailable" });
    const intent = await app.store.pgPool!.query<{ id: string }>(
      "SELECT id FROM documents.media_upload_intents WHERE idempotency_key='media-reconcile-001'",
    );
    await app.store.pgPool!.query(
      "UPDATE documents.media_upload_intents SET lease_owner='crashed-worker',lease_expires_at=now()+interval '5 minutes' WHERE id=$1",
      [intent.rows[0]!.id],
    );
    const bucket: MediaBucket = { head: async (key) => {
      const head = await memory.statObject(key);
      return head ? { size: head.size, customMetadata: head.metadata } : null;
    } };
    const jobs: JobQueue = { send: async () => undefined };
    expect((await reconcileMedia(app.store.pgPool!, bucket, jobs)).leased).toBe(0);
    await app.store.pgPool!.query(
      "UPDATE documents.media_upload_intents SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [intent.rows[0]!.id],
    );
    const outcomes = await Promise.all([
      reconcileMedia(app.store.pgPool!, bucket, jobs),
      reconcileMedia(app.store.pgPool!, bucket, jobs),
    ]);
    expect(outcomes.reduce((sum, item) => sum + item.finalized, 0)).toBe(1);
    const state = await app.store.pgPool!.query(
      "SELECT state FROM documents.media_upload_intents WHERE id=$1",
      [intent.rows[0]!.id],
    );
    expect(state.rows[0]?.state).toBe("finalized");
  });

  it("publishes a typed generic document atomically for a second API instance", async () => {
    const employee = await loginAs(app, "E1");
    const finance = await loginAs(app, "N1");
    const other = await loginAs(app, "E2");
    const response = await multipartDocumentUpload(app, employee.token, {
      business_object_type: "core_user",
      business_object_id: employee.user.id,
      classification: "normal",
      document_type: "identity_proof",
      file_name: "identity.pdf",
      mime_type: "application/pdf",
    }, Buffer.from("%PDF-synthetic identity proof"), "media-generic-001");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      company_id: expect.any(String),
      lifecycle_state: "active",
      business_object_id: employee.user.id,
    });
    expect(response.json()).not.toHaveProperty("storage_key");

    const replica = await buildRealAppReplica(app);
    await replica.ready();
    try {
      const metadata = await replica.inject({
        method: "GET",
        url: `/api/v1/documents/${response.json().id}`,
        headers: { authorization: `Bearer ${employee.token}` },
      });
      expect(metadata.statusCode).toBe(200);
      expect(metadata.json()).toMatchObject({ id: response.json().id, lifecycle_state: "active" });
    } finally {
      await replica.close();
    }

    const companyB = crypto.randomUUID();
    await app.store.pgPool!.query(
      "INSERT INTO platform.company_profiles (id,company_name,company_slug,status) VALUES ($1,'Company B',$2,'active')",
      [companyB, `company-b-${companyB}`],
    );
    await app.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET company_id=$2 WHERE user_id=$1",
      [other.user.id, companyB],
    );
    const foreign = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${response.json().id}`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(foreign.statusCode).toBe(404);

    const financeAllowed = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${response.json().id}/content`,
      headers: { authorization: `Bearer ${finance.token}` },
    });
    expect(financeAllowed.statusCode).toBe(200);
    await app.store.pgPool!.query(
      "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Finance Manager'",
      [finance.user.id],
    );
    const revoked = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${response.json().id}/content`,
      headers: { authorization: `Bearer ${finance.token}` },
    });
    expect([403, 404]).toContain(revoked.statusCode);

    const originalGet = app.store.objectStorage!.getObject.bind(app.store.objectStorage!);
    vi.spyOn(app.store.objectStorage!, "getObject").mockImplementationOnce(async (key) => {
      const bytes = await originalGet(key);
      await app.store.pgPool!.query(
        "UPDATE documents.doc_metadata SET lifecycle_state='tombstoned' WHERE id=$1",
        [response.json().id],
      );
      return bytes;
    });
    const concurrentRemove = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${response.json().id}/content`,
      headers: { authorization: `Bearer ${employee.token}` },
    });
    expect(concurrentRemove.statusCode).toBe(404);
    const access = await app.store.pgPool!.query<{ decision: string }>(
      "SELECT decision FROM documents.doc_access_logs WHERE document_id=$1 ORDER BY created_at",
      [response.json().id],
    );
    expect(access.rows.map((row) => row.decision)).toEqual(expect.arrayContaining(["allowed", "denied"]));
  });

  it("quarantines provider objects whose HEAD omits durable identity markers", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const memory = new MemoryObjectStorage();
    const storage: ObjectStoragePort = {
      kind: "memory",
      bucket: "missing-marker-test",
      async putObject(key, body) {
        await memory.putObject(key, body);
        throw new ObjectStorageProviderError("timeout", "ambiguous markerless write");
      },
      getObject: (key) => memory.getObject(key),
      statObject: (key) => memory.statObject(key),
      removeObject: (key) => memory.removeObject(key),
    };
    await expect(new MediaLifecycleService(app.store.pgPool!, storage).upload(
      logoInput(admin.user, parent, "media-missing-markers-001", Buffer.from("markerless")),
    )).rejects.toMatchObject({ statusCode: 409 });
    const before = await app.store.pgPool!.query(
      "SELECT state,last_safe_error FROM documents.media_upload_intents WHERE idempotency_key='media-missing-markers-001'",
    );
    expect(before.rows[0]).toEqual({ state: "retry_wait", last_safe_error: "object_put_outcome_unconfirmed" });
    await app.store.pgPool!.query(
      "UPDATE documents.media_upload_intents SET lease_expires_at=now()-interval '1 second' WHERE idempotency_key='media-missing-markers-001'",
    );
    await reconcileMedia(app.store.pgPool!, {
      head: async (key) => {
        const head = await memory.statObject(key);
        return head ? { size: head.size, customMetadata: head.metadata } : null;
      },
    }, { send: async () => undefined });
    const after = await app.store.pgPool!.query(
      "SELECT state,last_safe_error FROM documents.media_upload_intents WHERE idempotency_key='media-missing-markers-001'",
    );
    expect(after.rows[0]).toEqual({ state: "quarantined", last_safe_error: "provider_evidence_mismatch" });
  });

  it("denies restricted generic uploads before provider I/O for non-HR finance actors", async () => {
    const finance = await loginAs(app, "N1");
    const employee = await loginAs(app, "E1");
    const put = vi.spyOn(app.store.objectStorage!, "putObject");
    const response = await multipartDocumentUpload(app, finance.token, {
      business_object_type: "core_user",
      business_object_id: employee.user.id,
      classification: "medical",
      document_type: "medical_record",
      file_name: "medical.pdf",
      mime_type: "application/pdf",
    }, Buffer.from("%PDF-synthetic medical proof"), "media-restricted-denied-001");
    expect(response.statusCode).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("backs off a no-progress batch, does not self-requeue, and terminalizes expiry", async () => {
    const admin = await loginAs(app, "ADM");
    const parent = await companyParent(app, admin.user.id);
    const unavailable: ObjectStoragePort = {
      kind: "memory",
      bucket: "missing-object-test",
      putObject: async () => { throw new ObjectStorageProviderError("unavailable", "synthetic outage"); },
      getObject: async () => null,
      statObject: async () => null,
      removeObject: async () => undefined,
    };
    await expect(new MediaLifecycleService(app.store.pgPool!, unavailable).upload(
      logoInput(admin.user, parent, "media-no-progress-001", Buffer.from("missing")),
    )).rejects.toMatchObject({ code: "unavailable" });
    const sent: unknown[] = [];
    const jobs: JobQueue = { send: async (message) => { sent.push(message); } };
    const result = await reconcileMedia(app.store.pgPool!, { head: async () => null }, jobs, 1);
    expect(result).toMatchObject({ leased: 1, finalized: 0, pending: 1 });
    expect(sent).toEqual([]);
    const backedOff = await app.store.pgPool!.query(
      `SELECT state,attempt_count,lease_expires_at > now() AS backed_off
       FROM documents.media_upload_intents WHERE idempotency_key='media-no-progress-001'`,
    );
    expect(backedOff.rows[0]).toMatchObject({ state: "retry_wait", backed_off: true });
    await app.store.pgPool!.query(
      "UPDATE documents.media_upload_intents SET expires_at=now()-interval '1 second' WHERE idempotency_key='media-no-progress-001'",
    );
    expect((await reconcileMedia(app.store.pgPool!, { head: async () => null }, jobs, 1)).leased).toBe(0);
    const terminal = await app.store.pgPool!.query(
      "SELECT state,last_safe_error FROM documents.media_upload_intents WHERE idempotency_key='media-no-progress-001'",
    );
    expect(terminal.rows[0]).toEqual({ state: "quarantined", last_safe_error: "intent_expired" });

    await app.store.pgPool!.query(
      `INSERT INTO documents.media_upload_intents
        (id,company_id,actor_user_id,operation,parent_type,parent_id,business_object_type,
         idempotency_key,request_fingerprint,object_key,document_id,expected_pointer_document_id,
         expected_parent_version,file_name,mime_type,measured_size_bytes,checksum_sha256,
         classification,document_type,owner_user_id,state,expires_at)
       SELECT gen_random_uuid(),company_id,actor_user_id,operation,parent_type,parent_id,business_object_type,
              idempotency_key||'-expired-'||n,request_fingerprint,gen_random_uuid()::text,
              gen_random_uuid(),expected_pointer_document_id,expected_parent_version,file_name,mime_type,
              measured_size_bytes,checksum_sha256,classification,document_type,owner_user_id,
              'retry_wait',now()-interval '1 second'
       FROM documents.media_upload_intents CROSS JOIN generate_series(1,3) n
       WHERE idempotency_key='media-no-progress-001'`,
    );
    sent.length = 0;
    const boundedFirst = await reconcileMedia(app.store.pgPool!, { head: async () => null }, jobs, 2);
    expect(boundedFirst).toMatchObject({ leased: 0, quarantined: 2 });
    expect(sent).toEqual([{ kind: "media" }]);
    const remaining = await app.store.pgPool!.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM documents.media_upload_intents WHERE state='retry_wait' AND idempotency_key LIKE 'media-no-progress-001-expired-%'",
    );
    expect(remaining.rows[0]?.count).toBe(1);
    sent.length = 0;
    expect((await reconcileMedia(app.store.pgPool!, { head: async () => null }, jobs, 2)).quarantined).toBe(1);
    expect(sent).toEqual([]);
  });

  it("enforces tenant ownership on every non-quarantined lifecycle transition", async () => {
    const admin = await loginAs(app, "ADM");
    const id = crypto.randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO documents.doc_metadata
        (id,business_object_type,business_object_id,classification,document_type,current_version,
         file_name,storage_key,mime_type,size_bytes,created_by_user_id,lifecycle_state,lifecycle_reason)
       VALUES ($1,'core_user',$2,'normal','legacy_generic',1,'legacy.pdf',$3,'application/pdf',1,$2,
               'quarantined','legacy_company_owner_unverified')`,
      [id, admin.user.id, `legacy/${id}`],
    );
    await expect(app.store.pgPool!.query(
      "UPDATE documents.doc_metadata SET lifecycle_state='replaced' WHERE id=$1",
      [id],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(app.store.pgPool!.query(
      `INSERT INTO documents.doc_metadata
        (id,business_object_type,business_object_id,classification,document_type,current_version,
         file_name,storage_key,mime_type,size_bytes,created_by_user_id,lifecycle_state)
       VALUES (gen_random_uuid(),'core_user',$1,'normal','invalid',1,'bad.pdf',$2,'application/pdf',1,$1,'staged')`,
      [admin.user.id, `invalid/${crypto.randomUUID()}`],
    )).rejects.toMatchObject({ code: "23514" });
  });
});

async function companyParent(app: FastifyInstance, actorId: string) {
  const result = await app.store.pgPool!.query<{
    company_id: string;
    version: number;
    logo_document_id: string | null;
  }>(
    `SELECT preference.company_id,company.version,company.logo_document_id
     FROM platform.user_session_preferences preference
     JOIN platform.company_profiles company ON company.id=preference.company_id
     WHERE preference.user_id=$1`,
    [actorId],
  );
  const row = result.rows[0]!;
  return { companyId: row.company_id, version: row.version, pointer: row.logo_document_id };
}

function logoInput(
  actor: Awaited<ReturnType<typeof loginAs>>["user"],
  parent: { companyId: string; version: number; pointer: string | null },
  idempotencyKey: string,
  body: Buffer,
): DurableMediaUploadInput {
  return {
    actor,
    operation: "replace_company_logo",
    parentType: "company_profile",
    parentId: parent.companyId,
    businessObjectType: "company_profile",
    ownerUserId: actor.id,
    classification: "normal",
    documentType: "company_logo",
    fileName: "company-logo.png",
    mimeType: "image/png",
    body,
    idempotencyKey,
    expectedParentVersion: parent.version,
    expectedPointerDocumentId: parent.pointer,
  };
}

function multipartDocumentUpload(
  target: FastifyInstance,
  token: string,
  fields: Record<string, string>,
  body: Buffer,
  idempotencyKey: string,
) {
  const boundary = `----media-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="identity.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
  ));
  chunks.push(body, Buffer.from(`\r\n--${boundary}--\r\n`));
  return target.inject({
    method: "POST",
    url: "/api/v1/documents",
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(chunks),
  });
}
