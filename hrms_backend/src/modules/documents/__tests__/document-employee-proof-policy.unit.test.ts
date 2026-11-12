import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Roles, type AuthUser, type DocumentMetadata, type UUID } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import { DocumentService } from "../service.js";

const proofTypes = [
  "identity_proof",
  "address_proof",
  "education_proof",
  "experience_proof",
] as const;

describe("employee-proof policy in memory document paths", () => {
  it("allows every proof type to its owner and company Admin", async () => {
    const { service, owner, admin, documents } = await fixture();

    for (const document of documents) {
      expect(service.metadata(owner, document.id).id).toBe(document.id);
      expect(service.metadata(admin, document.id).id).toBe(document.id);
      await expect(service.downloadContent(owner, document.id)).resolves.toMatchObject({
        fileName: document.file_name,
      });
      await expect(service.downloadContent(admin, document.id)).resolves.toMatchObject({
        fileName: document.file_name,
      });
    }

    expect(service.list(owner, { page: 1, page_size: 100 }).items).toHaveLength(proofTypes.length);
    expect(service.list(admin, { page: 1, page_size: 100 }).items).toHaveLength(proofTypes.length);
  });

  it.each([
    ["HR", Roles.HRManager],
    ["Auditor", Roles.Auditor],
    ["Finance", Roles.FinanceManager],
    ["Director", Roles.Director],
    ["Asset Manager", Roles.AssetManager],
  ] as const)("denies another employee's proof metadata, list and bytes to %s", async (_label, role) => {
    const { service, storage, documents } = await fixture();
    const actor = makeActor(role);
    const getObject = vi.spyOn(storage, "getObject");

    for (const document of documents) {
      expect(() => service.metadata(actor, document.id)).toThrow(/access denied/u);
      await expect(service.downloadContent(actor, document.id)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(service.list(actor, { page: 1, page_size: 100 })).toMatchObject({ items: [], total: 0 });
    expect(getObject).not.toHaveBeenCalled();
  });
});

async function fixture() {
  const store = createMemoryDataStore();
  store.documents.length = 0;
  const storage = new MemoryObjectStorage();
  store.objectStorage = storage;
  const owner = { ...store.users.find((user) => user.id === seedIds.employee1)!, roles: [Roles.Employee] };
  const admin = { ...store.users.find((user) => user.id === seedIds.admin)!, roles: [Roles.Admin] };
  const documents: DocumentMetadata[] = [];

  for (const documentType of proofTypes) {
    const id = randomUUID() as UUID;
    const storageKey = `employee-proof-policy/${id}`;
    const document: DocumentMetadata = {
      id,
      business_object_type: "employee",
      business_object_id: owner.id,
      owner_user_id: owner.id,
      classification: "normal",
      document_type: documentType,
      current_version: 1,
      file_name: `${documentType}.pdf`,
      storage_key: storageKey,
      mime_type: "application/pdf",
      size_bytes: 5,
      checksum_sha256: null,
      metadata: {},
      created_by_user_id: owner.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    documents.push(document);
    store.documents.push(document);
    await storage.putObject(storageKey, Buffer.from("proof"));
  }

  return { service: new DocumentService(store), storage, owner, admin, documents };
}

function makeActor(role: AuthUser["roles"][number]): AuthUser {
  return {
    id: randomUUID() as UUID,
    employee_code: `DENIED-${role}`,
    email: `${role.toLowerCase()}@example.test`,
    full_name: `Denied ${role}`,
    department_id: randomUUID() as UUID,
    designation_id: randomUUID() as UUID,
    roles: [role],
    hierarchy_path: "company.denied",
    employment_status: "active",
  };
}
