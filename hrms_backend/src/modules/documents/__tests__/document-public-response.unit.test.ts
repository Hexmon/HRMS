import { randomUUID } from "node:crypto";
import type { AuthUser, DocumentMetadata } from "#shared";
import { describe, expect, it } from "vitest";
import { makeStorageKey } from "../../../platform/data-store.js";
import { presentDocument } from "../service.js";

const actor: AuthUser = {
  id: randomUUID(),
  employee_code: "EMP-SECRET-42",
  full_name: "Storage Key Person",
  email: "storage.person@example.test",
  roles: ["Employee"],
  employment_status: "active",
  department_id: randomUUID(),
  designation_id: randomUUID(),
  hierarchy_path: "storage-person",
};

function document(metadata: Record<string, unknown>): DocumentMetadata {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    business_object_type: "employee",
    business_object_id: actor.id,
    owner_user_id: actor.id,
    classification: "normal",
    document_type: "identity_proof",
    current_version: 1,
    file_name: "aadhaar-secret.pdf",
    storage_key: "private-bucket/tenant-secret/key.pdf",
    mime_type: "application/pdf",
    size_bytes: 123,
    checksum_sha256: "checksum",
    metadata,
    created_by_user_id: actor.id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

describe("public document responses", () => {
  it("exposes only allowlisted verification metadata", () => {
    const response = presentDocument(document({
      verified_at: "2026-11-12T00:00:00.000Z",
      verified_by: actor.id,
      rejection_reason: "replace with a readable copy",
      folder: "private-bucket",
      storage_adapter: "r2",
      storage_etag: "secret-etag",
      object_url: "https://provider.example.test/private",
      access_key: "secret-access",
    }));

    expect(response.metadata).toEqual({
      verified_at: "2026-11-12T00:00:00.000Z",
      verified_by: actor.id,
      rejection_reason: "replace with a readable copy",
    });
    expect(response).not.toHaveProperty("storage_key");
    expect(JSON.stringify(response)).not.toMatch(/private-bucket|secret-etag|provider\.example|secret-access/u);
  });

  it("omits invalid or absent metadata instead of copying arbitrary fields", () => {
    expect(presentDocument(document({
      verified_at: 123,
      verified_by: null,
      rejection_reason: false,
    })).metadata).toEqual({});
  });

  it("generates opaque unique keys without identity, file name, document type or date", () => {
    const first = makeStorageKey({ actor, documentType: "identity_proof", fileName: "aadhaar-secret.pdf", version: 1 });
    const second = makeStorageKey({ actor, documentType: "identity_proof", fileName: "aadhaar-secret.pdf", version: 1 });
    expect(first).not.toBe(second);
    for (const key of [first, second]) {
      expect(key).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/u);
      expect(key).not.toMatch(/EMP-SECRET|identity|aadhaar|storage\.person|2026/u);
    }
  });
});
