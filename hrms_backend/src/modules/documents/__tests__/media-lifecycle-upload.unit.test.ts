import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { Roles, type AuthUser, type DocumentMetadata, type UUID } from "#shared";
import type { ObjectStoragePort } from "../../../platform/data-store.js";
import { ObjectStorageProviderError } from "../../../platform/object-storage.js";
import {
  MediaLifecycleService,
  type DurableMediaUploadInput,
  type DurableMediaUploadResult,
  type IntentRow,
} from "../media-lifecycle.js";

const actorId = "11111111-1111-4111-8111-111111111111" as UUID;
const companyId = "22222222-2222-4222-8222-222222222222" as UUID;
const parentId = "33333333-3333-4333-8333-333333333333" as UUID;
const documentId = "44444444-4444-4444-8444-444444444444" as UUID;
const intentId = "55555555-5555-4555-8555-555555555555" as UUID;
const bytes = Buffer.from("durable-media-bytes");
const checksum = createHash("sha256").update(bytes).digest("hex");

describe("durable media upload orchestration", () => {
  it("rejects an empty upload before preparing an intent or touching storage", async () => {
    const fixture = uploadFixture();

    await expect(fixture.service.upload(uploadInput({ body: Buffer.alloc(0) }))).rejects.toMatchObject({
      statusCode: 409,
      message: "Media upload body is empty",
    });

    expect(fixture.methods.prepare).not.toHaveBeenCalled();
    expect(fixture.storage.putObject).not.toHaveBeenCalled();
  });

  it("replays a finalized intent without writing object storage", async () => {
    const fixture = uploadFixture({ prepared: intent({ state: "finalized" }) });

    await expect(fixture.service.upload(uploadInput())).resolves.toBe(fixture.finalized);

    expect(fixture.methods.finalizedResult).toHaveBeenCalledWith(expect.objectContaining({ state: "finalized" }));
    expect(fixture.storage.putObject).not.toHaveBeenCalled();
  });

  it("finalizes an already confirmed object without writing it again", async () => {
    const fixture = uploadFixture({ prepared: intent({ state: "object_confirmed", lease_owner: null }) });

    await expect(fixture.service.upload(uploadInput())).resolves.toBe(fixture.finalized);

    expect(fixture.methods.finalize).toHaveBeenCalledWith(intentId);
    expect(fixture.storage.putObject).not.toHaveBeenCalled();
  });

  it.each(["quarantined", "failed"] as const)("rejects a terminal %s intent", async (state) => {
    const fixture = uploadFixture({ prepared: intent({ state, lease_owner: null }) });

    await expect(fixture.service.upload(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      details: { intent_id: intentId, state },
    });

    expect(fixture.storage.putObject).not.toHaveBeenCalled();
  });

  it("verifies provider metadata before confirming and finalizing a successful PUT", async () => {
    const fixture = uploadFixture();

    await expect(fixture.service.upload(uploadInput())).resolves.toBe(fixture.finalized);

    expect(fixture.storage.putObject).toHaveBeenCalledWith("private/object", bytes, {
      "content-type": "application/pdf",
      "x-hrms-intent-id": intentId,
      "x-hrms-document-id": documentId,
      "x-hrms-checksum-sha256": checksum,
    });
    expect(fixture.storage.statObject).toHaveBeenCalledWith("private/object");
    expect(fixture.methods.confirmObject).toHaveBeenCalledWith(intentId, "lease-1", fixture.evidence);
    expect(fixture.methods.confirmObject.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.methods.finalize.mock.invocationCallOrder[0]!,
    );
  });

  it.each(["finalized", "object_confirmed"] as const)(
    "uses the concurrent winner when the waiter observes %s",
    async (state) => {
      const winner = intent({ state, lease_owner: null });
      const fixture = uploadFixture({ claims: [null], concurrent: winner });

      await expect(fixture.service.upload(uploadInput())).resolves.toBe(fixture.finalized);

      if (state === "finalized") {
        expect(fixture.methods.finalizedResult).toHaveBeenCalledWith(winner);
      } else {
        expect(fixture.methods.finalize).toHaveBeenCalledWith(intentId);
      }
      expect(fixture.storage.putObject).not.toHaveBeenCalled();
    },
  );

  it.each(["quarantined", "failed"] as const)(
    "rejects when the concurrent winner leaves a terminal %s intent",
    async (state) => {
      const fixture = uploadFixture({
        claims: [null],
        concurrent: intent({ state, lease_owner: null }),
      });

      await expect(fixture.service.upload(uploadInput())).rejects.toMatchObject({
        statusCode: 409,
        details: { intent_id: intentId, state },
      });
    },
  );

  it("returns a stable retry conflict when neither claim attempt acquires the lease", async () => {
    const fixture = uploadFixture({
      claims: [null, null],
      concurrent: intent({ state: "retry_wait", lease_owner: null }),
    });

    await expect(fixture.service.upload(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "An identical media upload is still in progress; retry with the same idempotency key",
    });
  });

  it("rejects a claimed intent that has no durable lease owner", async () => {
    const fixture = uploadFixture({ claims: [intent({ lease_owner: null })] });

    await expect(fixture.service.upload(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Media upload lease is unavailable",
    });

    expect(fixture.storage.putObject).not.toHaveBeenCalled();
  });

  it("records a retryable safe failure and preserves a definite PUT error", async () => {
    const providerError = new ObjectStorageProviderError("unavailable", "provider unavailable");
    const fixture = uploadFixture({ putError: providerError });

    await expect(fixture.service.upload(uploadInput())).rejects.toBe(providerError);

    expect(fixture.methods.recordSafeFailure).toHaveBeenCalledWith(intentId, "lease-1", "object_put_failed");
  });

  it("recovers an ambiguous PUT timeout only after matching provider HEAD evidence", async () => {
    const fixture = uploadFixture({
      putError: new ObjectStorageProviderError("timeout", "ambiguous PUT"),
    });

    await expect(fixture.service.upload(uploadInput())).resolves.toBe(fixture.finalized);

    expect(fixture.methods.recordSafeFailure).not.toHaveBeenCalled();
    expect(fixture.methods.confirmObject).toHaveBeenCalledWith(intentId, "lease-1", fixture.evidence);
  });

  it("records and preserves a HEAD error after an ambiguous PUT timeout", async () => {
    const headError = new ObjectStorageProviderError("unavailable", "HEAD unavailable");
    const fixture = uploadFixture({
      putError: new ObjectStorageProviderError("timeout", "ambiguous PUT"),
      statError: headError,
    });

    await expect(fixture.service.upload(uploadInput())).rejects.toBe(headError);

    expect(fixture.methods.recordSafeFailure).toHaveBeenCalledWith(
      intentId,
      "lease-1",
      "object_head_failed_after_ambiguous_put",
    );
  });

  it("keeps an ambiguous outcome retryable when provider evidence is absent", async () => {
    const fixture = uploadFixture({
      putError: new ObjectStorageProviderError("timeout", "ambiguous PUT"),
      evidence: null,
    });

    await expect(fixture.service.upload(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Media provider outcome could not be confirmed; retry with the same idempotency key",
    });

    expect(fixture.methods.recordSafeFailure).toHaveBeenCalledWith(
      intentId,
      "lease-1",
      "object_put_outcome_unconfirmed",
    );
  });

  it("keeps a completed PUT retryable when its verification HEAD fails", async () => {
    const headError = new ObjectStorageProviderError("unavailable", "HEAD unavailable");
    const fixture = uploadFixture({ statError: headError });

    await expect(fixture.service.upload(uploadInput())).rejects.toBe(headError);

    expect(fixture.methods.recordSafeFailure).toHaveBeenCalledWith(
      intentId,
      "lease-1",
      "object_head_failed_after_put",
    );
  });

  it("quarantines a completed PUT when persisted identity markers do not match", async () => {
    const fixture = uploadFixture({
      evidence: providerEvidence({
        metadata: {
          "x-hrms-intent-id": "wrong-intent",
          "x-hrms-document-id": documentId,
          "x-hrms-checksum-sha256": checksum,
        },
      }),
    });

    await expect(fixture.service.upload(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Stored media does not match the prepared upload",
    });

    expect(fixture.methods.quarantine).toHaveBeenCalledWith(
      intentId,
      "lease-1",
      "provider_evidence_mismatch",
    );
    expect(fixture.methods.confirmObject).not.toHaveBeenCalled();
  });

  it("returns a deterministic conflict when an intent disappears after polling expires", async () => {
    vi.useFakeTimers();
    try {
      const query = vi.fn();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        query.mockResolvedValueOnce({ rows: [intent()], rowCount: 1 });
      }
      query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const service = new MediaLifecycleService({ query } as unknown as Pool, {} as ObjectStoragePort);
      const internals = service as unknown as {
        awaitConcurrentIntent(intentId: UUID): Promise<IntentRow>;
      };

      const outcome = internals.awaitConcurrentIntent(intentId);
      const assertion = expect(outcome).rejects.toMatchObject({
        statusCode: 409,
        message: "Concurrent media upload intent disappeared",
      });
      await vi.runAllTimersAsync();

      await assertion;
      expect(query).toHaveBeenCalledTimes(41);
    } finally {
      vi.useRealTimers();
    }
  });
});

type ServiceMethods = {
  prepare: ReturnType<typeof vi.fn>;
  claimIntentForPut: ReturnType<typeof vi.fn>;
  awaitConcurrentIntent: ReturnType<typeof vi.fn>;
  finalizedResult: ReturnType<typeof vi.fn>;
  confirmObject: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
  recordSafeFailure: ReturnType<typeof vi.fn>;
  quarantine: ReturnType<typeof vi.fn>;
};

function uploadFixture(options: {
  prepared?: IntentRow;
  claims?: Array<IntentRow | null>;
  concurrent?: IntentRow;
  putError?: Error;
  statError?: Error;
  evidence?: ReturnType<typeof providerEvidence> | null;
} = {}) {
  const prepared = options.prepared ?? intent({ state: "prepared", lease_owner: null });
  const claims = [...(options.claims ?? [intent()])];
  const evidence = options.evidence === undefined ? providerEvidence() : options.evidence;
  const finalized: DurableMediaUploadResult = {
    intent_id: intentId,
    state: "finalized",
    document: {} as DocumentMetadata,
  };
  const storage = {
    kind: "memory",
    bucket: "unit-private-media",
    putObject: options.putError
      ? vi.fn(async () => { throw options.putError; })
      : vi.fn(async () => ({ size: bytes.length, etag: "etag-1" })),
    getObject: vi.fn(),
    statObject: options.statError
      ? vi.fn(async () => { throw options.statError; })
      : vi.fn(async () => evidence),
    removeObject: vi.fn(),
  } as unknown as ObjectStoragePort & {
    putObject: ReturnType<typeof vi.fn>;
    statObject: ReturnType<typeof vi.fn>;
  };
  const service = new MediaLifecycleService({} as Pool, storage);
  const methods = service as unknown as ServiceMethods;
  Object.assign(methods, {
    prepare: vi.fn(async () => ({ intent: prepared, created: false })),
    claimIntentForPut: vi.fn(async () => claims.shift() ?? null),
    awaitConcurrentIntent: vi.fn(async () => options.concurrent ?? intent({ state: "retry_wait", lease_owner: null })),
    finalizedResult: vi.fn(async () => finalized),
    confirmObject: vi.fn(async () => undefined),
    finalize: vi.fn(async () => finalized),
    recordSafeFailure: vi.fn(async () => undefined),
    quarantine: vi.fn(async () => undefined),
  } satisfies ServiceMethods);

  return { service, methods, storage, evidence, finalized };
}

function uploadInput(overrides: Partial<DurableMediaUploadInput> = {}): DurableMediaUploadInput {
  const actor: AuthUser = {
    id: actorId,
    employee_code: "MEDIA-001",
    email: "media.actor@example.test",
    full_name: "Media Actor",
    department_id: companyId,
    designation_id: parentId,
    roles: [Roles.Employee],
    hierarchy_path: "company.employee",
    employment_status: "active",
  };
  return {
    actor,
    operation: "create",
    parentType: "core_user",
    parentId,
    businessObjectType: "core_user",
    ownerUserId: parentId,
    classification: "normal",
    documentType: "identity_proof",
    fileName: "identity.pdf",
    mimeType: "application/pdf",
    body: bytes,
    idempotencyKey: "upload-unit-1",
    ...overrides,
  };
}

function intent(overrides: Partial<IntentRow> = {}): IntentRow {
  return {
    id: intentId,
    company_id: companyId,
    actor_user_id: actorId,
    operation: "create",
    parent_type: "core_user",
    parent_id: parentId,
    business_object_type: "core_user",
    request_fingerprint: "f".repeat(64),
    object_key: "private/object",
    document_id: documentId,
    expected_pointer_document_id: null,
    expected_parent_version: null,
    file_name: "identity.pdf",
    mime_type: "application/pdf",
    measured_size_bytes: bytes.length,
    checksum_sha256: checksum,
    classification: "normal",
    document_type: "identity_proof",
    owner_user_id: parentId,
    state: "uploading",
    provider_etag: null,
    provider_size_bytes: null,
    lease_owner: "lease-1",
    ...overrides,
  };
}

function providerEvidence(overrides: {
  size?: number;
  etag?: string;
  contentType?: string;
  metadata?: Record<string, string>;
} = {}) {
  return {
    size: bytes.length,
    etag: "etag-1",
    contentType: "application/pdf",
    metadata: {
      "x-hrms-intent-id": intentId,
      "x-hrms-document-id": documentId,
      "x-hrms-checksum-sha256": checksum,
    },
    ...overrides,
  };
}
