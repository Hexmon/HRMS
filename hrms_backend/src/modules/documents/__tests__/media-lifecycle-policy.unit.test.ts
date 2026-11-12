import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { Roles, type AuthUser, type UUID } from "#shared";
import {
  assertExpectedParent,
  assertParentAuthorization,
  durableReadAllowed,
  headMatchesIntent,
  lockMediaAuthorizationRows,
  mapDocument,
  requestFingerprint,
  type DurableMediaUploadInput,
  type IntentRow,
} from "../media-lifecycle.js";

const actorId = "11111111-1111-4111-8111-111111111111" as UUID;
const companyId = "22222222-2222-4222-8222-222222222222" as UUID;
const parentId = "33333333-3333-4333-8333-333333333333" as UUID;
const documentId = "44444444-4444-4444-8444-444444444444" as UUID;
const intentId = "55555555-5555-4555-8555-555555555555" as UUID;
const checksum = "a".repeat(64);

function actor(): AuthUser {
  return {
    id: actorId,
    employee_code: "MEDIA-001",
    email: "media.actor@example.test",
    full_name: "Media Actor",
    department_id: companyId,
    designation_id: parentId,
    roles: [Roles.Employee],
    hierarchy_path: "root.media",
    employment_status: "active",
  };
}

function uploadInput(
  overrides: Partial<DurableMediaUploadInput> = {},
): DurableMediaUploadInput {
  return {
    actor: actor(),
    operation: "replace_profile_photo",
    parentType: "core_user",
    parentId,
    businessObjectType: "core_user",
    ownerUserId: parentId,
    classification: "normal",
    documentType: "profile_photo",
    fileName: "profile.png",
    mimeType: "image/png",
    body: Buffer.from("profile-bytes"),
    idempotencyKey: "media-policy-test",
    expectedParentVersion: 7,
    expectedPointerDocumentId: null,
    ...overrides,
  };
}

function intent(overrides: Partial<IntentRow> = {}): IntentRow {
  return {
    id: intentId,
    company_id: companyId,
    actor_user_id: actorId,
    operation: "replace_profile_photo",
    parent_type: "core_user",
    parent_id: parentId,
    business_object_type: "core_user",
    request_fingerprint: "b".repeat(64),
    object_key: `companies/${companyId}/media/${documentId}`,
    document_id: documentId,
    expected_pointer_document_id: null,
    expected_parent_version: 7,
    file_name: "profile.png",
    mime_type: "image/png",
    measured_size_bytes: 13,
    checksum_sha256: checksum,
    classification: "normal",
    document_type: "profile_photo",
    owner_user_id: parentId,
    state: "uploading",
    provider_etag: null,
    provider_size_bytes: null,
    lease_owner: "lease-1",
    ...overrides,
  };
}

function accessRow(overrides: Record<string, unknown> = {}) {
  return {
    actor_id: actorId,
    owner_user_id: parentId,
    created_by_user_id: parentId,
    target_user_id: parentId,
    actor_hierarchy_path: "root.manager",
    target_hierarchy_path: "root.peer",
    roles: [],
    document_type: "generic",
    classification: "normal",
    current_logo: false,
    current_profile: false,
    ...overrides,
  };
}

describe("durable media lifecycle decisions", () => {
  it("uses the shared user-company-preference lock order with sorted users", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
    } as unknown as PoolClient;

    await lockMediaAuthorizationRows(client, companyId, parentId, "core_user", actorId);

    expect(calls).toHaveLength(3);
    expect(calls[0]?.sql).toContain("FROM core.users");
    expect(calls[0]?.sql).toContain("ORDER BY id FOR UPDATE");
    expect(calls[0]?.params[0]).toEqual([actorId, parentId]);
    expect(calls[1]?.sql).toContain("FROM platform.company_profiles");
    expect(calls[1]?.sql).toContain("FOR SHARE");
    expect(calls[2]?.sql).toContain("FROM platform.user_session_preferences");
    expect(calls[2]?.sql).toContain("ORDER BY user_id FOR UPDATE");
  });

  it("serializes first proof creation and requires replacement once a proof is active", async () => {
    const input = uploadInput({
      actor: { ...actor(), id: parentId },
      operation: "create",
      parentType: "core_user",
      parentId,
      ownerUserId: parentId,
      documentType: "identity_proof",
      mimeType: "application/pdf",
      expectedParentVersion: undefined,
      expectedPointerDocumentId: undefined,
    });
    const { client, queries } = authorizationClient([{ id: documentId }]);

    await expect(assertParentAuthorization(client, companyId, input, true)).rejects.toThrow(
      "Employee proof already exists; replace the current document",
    );
    expect(queries.find((query) => query.includes("FROM core.users target"))).toContain(
      "FOR UPDATE OF target,membership",
    );
    expect(queries.find((query) => query.includes("FROM documents.doc_metadata"))).toContain(
      "LIMIT 1 FOR UPDATE",
    );
  });

  it("allows first proof creation when the serialized active-purpose lookup is empty", async () => {
    const input = uploadInput({
      actor: { ...actor(), id: parentId },
      operation: "create",
      parentType: "core_user",
      parentId,
      ownerUserId: parentId,
      documentType: "identity_proof",
      mimeType: "application/pdf",
      expectedParentVersion: undefined,
      expectedPointerDocumentId: undefined,
    });
    const { client } = authorizationClient([]);

    await expect(assertParentAuthorization(client, companyId, input, true)).resolves.toBeUndefined();
  });

  it("fails closed when the actor's active company changes", async () => {
    const otherCompanyId = "66666666-6666-4666-8666-666666666666" as UUID;
    const { client, calls } = policyClient({ currentCompanyId: otherCompanyId });

    await expect(assertParentAuthorization(client, companyId, uploadInput(), true)).rejects.toMatchObject({
      statusCode: 403,
      message: "Media tenant context changed",
    });
    expect(calls).toHaveLength(1);
  });

  it("allows only an active Admin to update the selected company logo", async () => {
    const logoInput = uploadInput({
      operation: "replace_company_logo",
      parentType: "company_profile",
      parentId: companyId,
      documentType: "company_logo",
      expectedPointerDocumentId: null,
    });
    const denied = policyClient({ roles: [Roles.Employee] });
    await expect(assertParentAuthorization(denied.client, companyId, logoInput, true)).rejects.toMatchObject({
      statusCode: 403,
      message: "Company logo upload denied",
    });

    const wrongParent = policyClient({ roles: [Roles.Admin] });
    await expect(assertParentAuthorization(
      wrongParent.client,
      companyId,
      { ...logoInput, parentId },
      true,
    )).rejects.toMatchObject({ statusCode: 403, message: "Company logo upload denied" });

    const allowed = policyClient({
      roles: [Roles.Admin],
      companyRows: [{ id: companyId, version: 7, logo_document_id: null }],
    });
    await expect(assertParentAuthorization(allowed.client, companyId, logoInput, true)).resolves.toBeUndefined();
    assertLiveAuthorityQueries(allowed.calls, actorId);
    const companyQuery = allowed.calls.find(({ sql }) => sql.includes("FROM platform.company_profiles WHERE"));
    expect(companyQuery?.sql).toContain("FOR UPDATE");
    expect(companyQuery?.params).toEqual([companyId]);
  });

  it("denies missing or unauthorized profile-photo parents and allows an Admin manager", async () => {
    const missing = policyClient({ userRows: [] });
    await expect(assertParentAuthorization(missing.client, companyId, uploadInput(), true)).rejects.toMatchObject({
      statusCode: 404,
      message: "Media parent not found",
    });

    const employee = policyClient({ roles: [Roles.Employee] });
    await expect(assertParentAuthorization(employee.client, companyId, uploadInput(), true)).rejects.toMatchObject({
      statusCode: 403,
      message: "Profile photo upload denied",
    });
    const lockedUserQuery = employee.calls.find(({ sql }) => sql.includes("FROM core.users target"));
    expect(lockedUserQuery?.sql).toContain("JOIN platform.user_session_preferences membership");
    expect(lockedUserQuery?.sql).toContain("membership.company_id=$2");
    expect(lockedUserQuery?.sql).toContain("target.deleted_at IS NULL");
    expect(lockedUserQuery?.sql).toContain("FOR UPDATE OF target,membership");
    expect(lockedUserQuery?.params).toEqual([parentId, companyId]);

    const self = policyClient({ roles: [Roles.Employee] });
    await expect(assertParentAuthorization(
      self.client,
      companyId,
      uploadInput({ actor: { ...actor(), id: parentId } }),
      true,
    )).resolves.toBeUndefined();
    assertLiveAuthorityQueries(self.calls, parentId);

    const hrManager = policyClient({ roles: [Roles.HRManager] });
    await expect(assertParentAuthorization(hrManager.client, companyId, uploadInput(), true)).resolves.toBeUndefined();

    const admin = policyClient({ roles: [Roles.Admin] });
    await expect(assertParentAuthorization(admin.client, companyId, uploadInput(), false)).resolves.toBeUndefined();
    const userQuery = admin.calls.find(({ sql }) => sql.includes("FROM core.users target"));
    expect(userQuery?.sql).not.toContain("FOR UPDATE");
    expect(userQuery?.params).toEqual([parentId, companyId]);
  });

  it.each([
    ["generic", "normal"],
    ["identity_proof", "medical"],
  ] as const)("rejects employee-proof purpose/classification pair %s/%s", async (documentType, classification) => {
    const { client } = policyClient();
    await expect(assertParentAuthorization(client, companyId, uploadInput({
      actor: { ...actor(), id: parentId },
      operation: "create",
      documentType,
      classification,
      expectedParentVersion: undefined,
      expectedPointerDocumentId: undefined,
    }), true)).rejects.toMatchObject({
      statusCode: 403,
      message: "Employee proof type or classification is not allowed",
    });
  });

  it("requires Admin authority and a same-purpose active document for proof replacement", async () => {
    const replacementInput = uploadInput({
      operation: "create",
      documentType: "identity_proof",
      mimeType: "application/pdf",
      expectedParentVersion: undefined,
      expectedPointerDocumentId: documentId,
    });
    const denied = policyClient({ roles: [Roles.Employee] });
    await expect(assertParentAuthorization(denied.client, companyId, replacementInput, true)).rejects.toMatchObject({
      statusCode: 403,
      message: "Employee proof upload denied",
    });

    const wrongPurpose = policyClient({
      roles: [Roles.Admin],
      replacementRows: [{ id: documentId, document_type: "address_proof" }],
    });
    await expect(assertParentAuthorization(
      wrongPurpose.client,
      companyId,
      replacementInput,
      true,
    )).rejects.toMatchObject({
      statusCode: 409,
      message: "Employee proof replacement target changed or has a different purpose",
    });

    const allowed = policyClient({
      roles: [Roles.Admin],
      replacementRows: [{ id: documentId, document_type: "identity_proof" }],
    });
    await expect(assertParentAuthorization(allowed.client, companyId, replacementInput, true)).resolves.toBeUndefined();
    const replacementQuery = allowed.calls.find(({ sql }) => sql.includes("WHERE id=$1 AND company_id=$2"));
    expect(replacementQuery?.sql).toContain("FOR UPDATE");
    expect(replacementQuery?.sql).toContain("business_object_id=$3");
    expect(replacementQuery?.sql).toContain("business_object_type IN ('core_user','employee')");
    expect(replacementQuery?.sql).toContain("lifecycle_state='active'");
    expect(replacementQuery?.sql).toContain("deleted_at IS NULL");
    expect(replacementQuery?.params).toEqual([documentId, companyId, parentId]);
  });

  it("rejects unsupported durable parent types after tenant and role revalidation", async () => {
    const { client } = policyClient();

    await expect(assertParentAuthorization(client, companyId, uploadInput({
      parentType: "generic",
      operation: "create",
    }), true)).rejects.toMatchObject({
      statusCode: 409,
      message: "Unsupported durable media parent type",
    });
  });

  it("builds a stable opaque fingerprint and changes it for command-relevant input", () => {
    const input = uploadInput();
    const first = requestFingerprint(input, checksum);
    const second = requestFingerprint(
      { ...input, body: Buffer.from(input.body) },
      checksum,
    );
    const mutations: Array<{
      name: string;
      input: DurableMediaUploadInput;
      checksum?: string;
    }> = [
      { name: "operation", input: { ...input, operation: "create" } },
      { name: "parent type", input: { ...input, parentType: "generic" } },
      { name: "parent id", input: { ...input, parentId: actorId } },
      {
        name: "business object type",
        input: { ...input, businessObjectType: "employee" },
      },
      { name: "owner", input: { ...input, ownerUserId: actorId } },
      {
        name: "classification",
        input: { ...input, classification: "medical" },
      },
      {
        name: "document type",
        input: { ...input, documentType: "identity_proof" },
      },
      { name: "file name", input: { ...input, fileName: "changed.png" } },
      { name: "MIME type", input: { ...input, mimeType: "image/jpeg" } },
      {
        name: "measured size",
        input: { ...input, body: Buffer.from("different-size") },
      },
      { name: "checksum", input, checksum: "c".repeat(64) },
      {
        name: "expected version",
        input: { ...input, expectedParentVersion: 8 },
      },
      {
        name: "expected pointer",
        input: { ...input, expectedPointerDocumentId: documentId },
      },
    ];

    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).toBe(first);
    for (const mutation of mutations) {
      expect(
        requestFingerprint(mutation.input, mutation.checksum ?? checksum),
        mutation.name,
      ).not.toBe(first);
    }
    expect(first).not.toContain(input.fileName);
  });

  it("accepts provider evidence only when size and all identity markers match", () => {
    const prepared = intent();
    const valid = {
      size: 13,
      metadata: {
        "x-hrms-intent-id": intentId,
        "x-hrms-document-id": documentId,
        "x-hrms-checksum-sha256": checksum,
      },
    };

    expect(headMatchesIntent(valid, prepared)).toBe(true);
    expect(headMatchesIntent({ ...valid, size: 12 }, prepared)).toBe(false);
    expect(headMatchesIntent({ size: 13 }, prepared)).toBe(false);
    expect(
      headMatchesIntent(
        {
          ...valid,
          metadata: { ...valid.metadata, "x-hrms-intent-id": actorId },
        },
        prepared,
      ),
    ).toBe(false);
    expect(
      headMatchesIntent(
        {
          ...valid,
          metadata: { ...valid.metadata, "x-hrms-document-id": actorId },
        },
        prepared,
      ),
    ).toBe(false);
    expect(
      headMatchesIntent(
        {
          ...valid,
          metadata: {
            ...valid.metadata,
            "x-hrms-checksum-sha256": "d".repeat(64),
          },
        },
        prepared,
      ),
    ).toBe(false);
  });

  it("enforces optimistic parent version and pointer checks for both parent types", () => {
    expect(() => assertExpectedParent(undefined, uploadInput())).toThrow(
      "Media parent not found",
    );
    expect(() =>
      assertExpectedParent(
        { version: 6, profile_photo_document_id: null },
        uploadInput(),
      ),
    ).toThrow("Media parent changed concurrently");
    expect(() =>
      assertExpectedParent(
        { version: 7, profile_photo_document_id: documentId },
        uploadInput(),
      ),
    ).toThrow("Media pointer changed concurrently");
    expect(() =>
      assertExpectedParent(
        { version: 7, profile_photo_document_id: null },
        uploadInput(),
      ),
    ).not.toThrow();
    expect(() =>
      assertExpectedParent(
        { version: 99, profile_photo_document_id: documentId },
        uploadInput({
          expectedParentVersion: undefined,
          expectedPointerDocumentId: undefined,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertExpectedParent(
        { version: 2, logo_document_id: documentId },
        uploadInput({
          operation: "replace_company_logo",
          parentType: "company_profile",
          parentId: companyId,
          expectedParentVersion: 2,
          expectedPointerDocumentId: documentId,
        }),
      ),
    ).not.toThrow();
  });

  it("maps database numbers, dates and nullable metadata into the public document shape", () => {
    const createdAt = new Date("2026-11-12T01:02:03.000Z");
    const updatedAt = new Date("2026-11-12T02:03:04.000Z");
    const deletedAt = new Date("2026-11-12T03:04:05.000Z");
    const mapped = mapDocument({
      id: documentId,
      company_id: companyId,
      business_object_type: "core_user",
      business_object_id: parentId,
      owner_user_id: parentId,
      classification: "normal",
      document_type: "profile_photo",
      current_version: 1,
      file_name: "profile.png",
      storage_key: "opaque-key",
      mime_type: "image/png",
      size_bytes: "13",
      checksum_sha256: checksum,
      metadata: null,
      created_by_user_id: actorId,
      lifecycle_state: "tombstoned",
      replaced_by_document_id: null,
      lifecycle_reason: "removed",
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: deletedAt,
    });

    expect(mapped).toEqual({
      id: documentId,
      company_id: companyId,
      business_object_type: "core_user",
      business_object_id: parentId,
      owner_user_id: parentId,
      classification: "normal",
      document_type: "profile_photo",
      current_version: 1,
      file_name: "profile.png",
      storage_key: "opaque-key",
      mime_type: "image/png",
      size_bytes: 13,
      checksum_sha256: checksum,
      metadata: {},
      created_by_user_id: actorId,
      lifecycle_state: "tombstoned",
      replaced_by_document_id: null,
      lifecycle_reason: "removed",
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
      deleted_at: deletedAt.toISOString(),
    });
    expect(
      mapDocument({
        ...mapped,
        created_at: createdAt,
        updated_at: updatedAt,
        deleted_at: null,
      }).deleted_at,
    ).toBeNull();
  });

  it("shows only current company logos and current authorized profile photos", () => {
    expect(
      durableReadAllowed(
        accessRow({ document_type: "company_logo", current_logo: true }),
        "raw",
      ),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({ document_type: "company_logo", current_logo: false }),
        "metadata",
      ),
    ).toBe(false);
    expect(
      durableReadAllowed(
        accessRow({ document_type: "profile_photo", current_profile: false }),
        "metadata",
      ),
    ).toBe(false);
    expect(
      durableReadAllowed(
        accessRow({
          document_type: "profile_photo",
          current_profile: true,
          target_user_id: actorId,
        }),
        "raw",
      ),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({
          document_type: "profile_photo",
          current_profile: true,
          target_hierarchy_path: "root.manager2.report",
        }),
        "metadata",
      ),
    ).toBe(false);
    expect(
      durableReadAllowed(
        accessRow({
          document_type: "profile_photo",
          current_profile: true,
          roles: [Roles.Admin],
        }),
        "raw",
      ),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({
          document_type: "profile_photo",
          current_profile: true,
          roles: [Roles.Auditor],
        }),
        "metadata",
      ),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({
          document_type: "profile_photo",
          current_profile: true,
          roles: [Roles.HRManager],
        }),
        "metadata",
      ),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({
          document_type: "profile_photo",
          current_profile: true,
          target_hierarchy_path: "root.manager.report",
        }),
        "metadata",
      ),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({ document_type: "profile_photo", current_profile: true }),
        "metadata",
      ),
    ).toBe(false);
  });

  it("limits employee-proof metadata and bytes to self and Admin", () => {
    for (const mode of ["metadata", "raw"] as const) {
      for (const documentType of [
        "identity_proof",
        "address_proof",
        "education_proof",
        "experience_proof",
      ]) {
        expect(
          durableReadAllowed(
            accessRow({
              document_type: documentType,
              owner_user_id: actorId,
            }),
            mode,
          ),
        ).toBe(true);
        expect(
          durableReadAllowed(
            accessRow({
              document_type: documentType,
              roles: [Roles.Admin],
            }),
            mode,
          ),
        ).toBe(true);
      }
      for (const role of [
        Roles.HRManager,
        Roles.Auditor,
        Roles.FinanceManager,
        Roles.Director,
        Roles.AssetManager,
      ]) {
        for (const documentType of [
          "identity_proof",
          "address_proof",
          "education_proof",
          "experience_proof",
        ]) {
          expect(
            durableReadAllowed(
              accessRow({ document_type: documentType, roles: [role] }),
              mode,
            ),
          ).toBe(false);
        }
      }
    }
  });

  it("applies restricted and general document role policies without broadening peer access", () => {
    for (const mode of ["metadata", "raw"] as const) {
      for (const role of [Roles.Admin, Roles.Auditor, Roles.HRManager]) {
        expect(
          durableReadAllowed(
            accessRow({ classification: "medical", roles: [role] }),
            mode,
          ),
        ).toBe(true);
      }
      expect(
        durableReadAllowed(accessRow({ classification: "compensation" }), mode),
      ).toBe(false);
    }

    expect(
      durableReadAllowed(accessRow({ owner_user_id: actorId }), "raw"),
    ).toBe(true);
    expect(
      durableReadAllowed(
        accessRow({ created_by_user_id: actorId }),
        "metadata",
      ),
    ).toBe(true);
    for (const mode of ["metadata", "raw"] as const) {
      for (const role of [
        Roles.Admin,
        Roles.Auditor,
        Roles.FinanceManager,
        Roles.Director,
        Roles.AssetManager,
      ]) {
        expect(durableReadAllowed(accessRow({ roles: [role] }), mode)).toBe(
          true,
        );
      }
      expect(durableReadAllowed(accessRow(), mode)).toBe(false);
    }
  });
});

function authorizationClient(activeProofRows: Array<{ id: UUID }>) {
  const queries: string[] = [];
  const query = async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM platform.user_session_preferences preference")) {
      return { rows: [{ company_id: companyId }] };
    }
    if (sql.includes("FROM core.user_roles assignment")) {
      return { rows: [{ role_key: Roles.Employee }] };
    }
    if (sql.includes("FROM core.users target")) {
      return { rows: [{ id: parentId, version: 1, profile_photo_document_id: null }] };
    }
    if (sql.includes("FROM documents.doc_metadata")) return { rows: activeProofRows };
    throw new Error(`Unexpected authorization query: ${sql}`);
  };
  return {
    client: { query } as unknown as PoolClient,
    queries,
  };
}

function policyClient(options: {
  currentCompanyId?: UUID;
  roles?: string[];
  companyRows?: Array<Record<string, unknown>>;
  userRows?: Array<Record<string, unknown>>;
  replacementRows?: Array<{ id: UUID; document_type: string }>;
  currentProofRows?: Array<{ id: UUID }>;
} = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM platform.user_session_preferences preference")) {
      return { rows: [{ company_id: options.currentCompanyId ?? companyId }], rowCount: 1 };
    }
    if (sql.includes("FROM core.user_roles assignment")) {
      const roles = options.roles ?? [Roles.Employee];
      return { rows: roles.map((role_key) => ({ role_key })), rowCount: roles.length };
    }
    if (sql.includes("FROM platform.company_profiles WHERE")) {
      const rows = options.companyRows ?? [{ id: companyId, version: 7, logo_document_id: null }];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM core.users target")) {
      const rows = options.userRows ?? [{ id: parentId, version: 7, profile_photo_document_id: null }];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("WHERE id=$1 AND company_id=$2")) {
      const rows = options.replacementRows ?? [];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM documents.doc_metadata")) {
      const rows = options.currentProofRows ?? [];
      return { rows, rowCount: rows.length };
    }
    throw new Error(`Unexpected policy query: ${sql}`);
  };
  return { client: { query } as unknown as PoolClient, calls };
}

function assertLiveAuthorityQueries(
  calls: Array<{ sql: string; params: unknown[] }>,
  expectedActorId: UUID,
): void {
  const companyQuery = calls.find(({ sql }) => sql.includes("FROM platform.user_session_preferences preference"));
  expect(companyQuery?.sql).toContain("assignment.role_key=preference.active_role");
  expect(companyQuery?.sql).toContain("assignment.status='active'");
  expect(companyQuery?.sql).toContain("assignment.deleted_at IS NULL");
  expect(companyQuery?.sql).toContain("assignment.effective_from<=current_date");
  expect(companyQuery?.sql).toContain("assignment.effective_to IS NULL OR assignment.effective_to>=current_date");
  expect(companyQuery?.sql).toContain("role.status='active' AND role.deleted_at IS NULL");
  expect(companyQuery?.sql).toContain("actor.deleted_at IS NULL AND actor.employment_status='active'");
  expect(companyQuery?.sql).toContain("company.status='active'");
  expect(companyQuery?.params).toEqual([expectedActorId]);

  const roleQuery = calls.find(({ sql }) => sql.includes("FROM core.user_roles assignment"));
  expect(roleQuery?.sql).toContain("role.status='active' AND role.deleted_at IS NULL");
  expect(roleQuery?.sql).toContain("assignment.status='active' AND assignment.deleted_at IS NULL");
  expect(roleQuery?.sql).toContain("assignment.effective_from <= current_date");
  expect(roleQuery?.sql).toContain("assignment.effective_to IS NULL OR assignment.effective_to >= current_date");
  expect(roleQuery?.params).toEqual([expectedActorId]);
}
