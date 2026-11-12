import { describe, expect, it } from "vitest";
import { Roles, type AuthUser, type UUID } from "#shared";
import {
  assertExpectedParent,
  durableReadAllowed,
  headMatchesIntent,
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
