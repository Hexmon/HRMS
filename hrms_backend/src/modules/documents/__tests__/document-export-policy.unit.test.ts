import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthUser, DocumentMetadata } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import { canAccessDocument } from "../policy.js";
import { DocumentService } from "../service.js";

const admin = { id: "admin", roles: ["Admin"] } as unknown as AuthUser;
const document = {
  owner_user_id: "admin",
  created_by_user_id: "admin",
  business_object_type: "employee",
  document_type: "identity_proof",
  classification: "normal",
  metadata: {},
} as DocumentMetadata;

describe("generated and public document policy", () => {
  it("denies legacy export metadata even to an admin", () => {
    expect(canAccessDocument(admin, { ...document, document_type: "report_export" }, "read")).toBe(false);
    expect(canAccessDocument(admin, { ...document, metadata: { generated: true } }, "read")).toBe(false);
  });

  it("denies legacy generated exports on metadata, URL and byte paths", () => {
    const publicDocument = { ...document, document_type: "report_export", metadata: { generated: true, storage_adapter: "cloudinary", object_url: "https://example.invalid/public" } };
    for (const permission of ["read", "write", "verify", "audit"] as const) {
      expect(canAccessDocument(admin, publicDocument, permission)).toBe(false);
    }
  });

  it("denies direct legacy export metadata, URL and content even to the creator", async () => {
    const store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    const id = randomUUID();
    store.documents.push({
      ...document,
      id,
      owner_user_id: actor.id,
      created_by_user_id: actor.id,
      business_object_id: actor.id,
      document_type: "report_export",
      metadata: { generated: true, object_url: "https://example.invalid/legacy-public" },
    });
    const service = new DocumentService(store);
    expect(() => service.metadata(actor, id)).toThrow();
    await expect(service.downloadUrl(actor, id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.downloadContent(actor, id)).rejects.toMatchObject({ statusCode: 403 });
  });
});
