import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Roles, type AuthUser } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore, type DataStore } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import { EmsService } from "../service.js";

describe("EMS employee-document tenant boundary", () => {
  let app: FastifyInstance;
  let store: DataStore;

  beforeEach(async () => {
    store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("allows a current-company employee through the memory and durable route paths", async () => {
    const employee = await loginAs(app, "E1");
    await expect(
      new EmsService(store).listEmployeeDocuments(employee.user, employee.user.id, {
        page: 1,
        page_size: 10,
      }),
    ).resolves.toMatchObject({ total: 0 });

    const classifier = enablePostgresClassifier(store, "authorized");
    const putObject = vi.spyOn(store.objectStorage!, "putObject");
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(employee.token),
    });
    expect(list.statusCode).toBe(200);

    const upload = await app.inject({
      method: "POST",
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      headers: authHeader(employee.token),
      payload: uploadPayload(),
    });
    expect(upload.statusCode).toBe(200);
    expect(classifier).toHaveBeenCalledWith(employee.user.id, employee.user.id, "read");
    expect(classifier).toHaveBeenCalledWith(employee.user.id, employee.user.id, "write");
    expect(putObject).toHaveBeenCalledTimes(1);
  });

  it("hides a durable foreign target before parsing or provider I/O", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    enablePostgresClassifier(store, "hidden");
    const putObject = vi.spyOn(store.objectStorage!, "putObject");
    const before = {
      documents: store.documents.length,
      versions: store.documentVersions.length,
      outbox: store.outbox.length,
    };

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      headers: authHeader(admin.token),
      payload: uploadPayload(),
    });
    expect(response.statusCode).toBe(404);
    expect(putObject).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(before.documents);
    expect(store.documentVersions).toHaveLength(before.versions);
    expect(store.outbox).toHaveLength(before.outbox);
  });

  it("fails closed without a durable classifier and trusts an authorized durable decision over a stale snapshot", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    store.kind = "postgres";
    store.persistence = persistenceWithClassifier(undefined);
    await expect(
      new EmsService(store).listEmployeeDocuments(admin.user, employee.user.id, {
        page: 1,
        page_size: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    enablePostgresClassifier(store, "authorized");
    const targetPreference = store.userSessionPreferences.find(
      (preference) => preference.user_id === employee.user.id,
    )!;
    const companyB = { ...store.companyProfiles[0]!, id: randomUUID(), company_slug: "ems-unit-b" };
    store.companyProfiles.push(companyB);
    targetPreference.company_id = companyB.id;
    await expect(
      new EmsService(store).listEmployeeDocuments(admin.user, employee.user.id, {
        page: 1,
        page_size: 10,
      }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it("allows same-company privileged reads but limits writes to self or HR/Admin", async () => {
    const auditor = await loginAs(app, "AUD");
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const memoryService = new EmsService(store);
    await expect(
      memoryService.attachEmployeeDocument(auditor.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 403 });
    enablePostgresClassifier(store, "authorized");
    const service = new EmsService(store);

    await expect(
      service.listEmployeeDocuments(auditor.user, employee.user.id, { page: 1, page_size: 10 }),
    ).resolves.toMatchObject({ total: 0 });
    enablePostgresClassifier(store, "forbidden");
    await expect(
      service.attachEmployeeDocument(auditor.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 403 });
    enablePostgresClassifier(store, "authorized");
    await expect(
      service.attachEmployeeDocument(admin.user, employee.user.id, uploadPayload()),
    ).resolves.toMatchObject({
      access_policy: { business_object_id: employee.user.id },
    });
  });

  it("hides a cross-company employee in memory mode before document access", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const targetPreference = store.userSessionPreferences.find(
      (preference) => preference.user_id === employee.user.id,
    )!;
    const companyB = { ...store.companyProfiles[0]!, id: randomUUID(), company_slug: "ems-memory-b" };
    store.companyProfiles.push(companyB);
    targetPreference.company_id = companyB.id;

    await expect(
      new EmsService(store).listEmployeeDocuments(admin.user, employee.user.id, {
        page: 1,
        page_size: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps same-company hierarchy denial and inactive-actor denial ahead of storage", async () => {
    const peer = await loginAs(app, "E2");
    const employee = await loginAs(app, "E1");
    enablePostgresClassifier(store, "forbidden");
    const putObject = vi.spyOn(store.objectStorage!, "putObject");
    const service = new EmsService(store);

    await expect(
      service.listEmployeeDocuments(peer.user, employee.user.id, { page: 1, page_size: 10 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    const peerRecord = store.users.find((user) => user.id === peer.user.id)!;
    peerRecord.roles.push(Roles.HRManager);
    peer.user.roles.push(Roles.HRManager);
    const peerPreference = store.userSessionPreferences.find(
      (preference) => preference.user_id === peer.user.id,
    )!;
    peerPreference.active_role = Roles.HRManager;
    peerRecord.employment_status = "inactive";
    peer.user.employment_status = "inactive";
    const inactive = vi.fn().mockRejectedValue(
      Object.assign(new Error("inactive"), { statusCode: 401 }),
    );
    store.persistence = persistenceWithClassifier(inactive);
    await expect(
      service.attachEmployeeDocument(peer.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("denies stale privileged and hierarchy snapshots when durable authorization was removed", async () => {
    const actor = await loginAs(app, "E2");
    const employee = await loginAs(app, "E1");
    actor.user.roles.push(Roles.HRManager);
    const actorRecord = store.users.find((user) => user.id === actor.user.id)!;
    actorRecord.roles.push(Roles.HRManager);
    actorRecord.hierarchy_path = "company.manager";
    employee.user.hierarchy_path = "company.manager.employee";
    store.users.find((user) => user.id === employee.user.id)!.hierarchy_path = employee.user.hierarchy_path;
    const classifier = enablePostgresClassifier(store, "forbidden");
    const putObject = vi.spyOn(store.objectStorage!, "putObject");
    const service = new EmsService(store);

    await expect(
      service.listEmployeeDocuments(actor.user, employee.user.id, { page: 1, page_size: 10 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.attachEmployeeDocument(actor.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(classifier).toHaveBeenCalledWith(actor.user.id, employee.user.id, "read");
    expect(classifier).toHaveBeenCalledWith(actor.user.id, employee.user.id, "write");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("uses the durable actor for restricted document policy after a stale role snapshot", async () => {
    const admin = await loginAs(app, "ADM");
    await new EmsService(store).attachEmployeeDocument(admin.user, admin.user.id, {
      ...uploadPayload(),
      classification: "medical",
    });
    const durableActor: AuthUser = { ...admin.user, roles: [Roles.Employee] };
    enablePostgresClassifier(store, "authorized", durableActor);
    const putObject = vi.spyOn(store.objectStorage!, "putObject");
    putObject.mockClear();
    const service = new EmsService(store);

    await expect(
      service.listEmployeeDocuments(admin.user, admin.user.id, { page: 1, page_size: 10 }),
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      service.attachEmployeeDocument(admin.user, admin.user.id, {
        ...uploadPayload(),
        classification: "medical",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("uses the durable actor for replacement authorization and audit metadata", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const staleEmployee = await loginAs(app, "E2");
    const original = await new EmsService(store).attachEmployeeDocument(
      admin.user,
      employee.user.id,
      { ...uploadPayload(), classification: "medical" },
    );
    const durableActor: AuthUser = { ...staleEmployee.user, roles: [Roles.HRManager] };
    enablePostgresClassifier(store, "authorized", durableActor);

    const replacement = await new EmsService(store).attachEmployeeDocument(
      staleEmployee.user,
      employee.user.id,
      {
        ...uploadPayload(),
        classification: "medical",
        file_name: "identity-replacement.pdf",
        replace_document_id: original.document.id,
      },
    );

    expect(replacement.document.metadata).not.toHaveProperty("replaces_document_id");
    expect(store.documents.find((document) => document.id === replacement.document.id)?.metadata)
      .toMatchObject({ replaces_document_id: original.document.id });
    expect(store.documents.find((document) => document.id === original.document.id)).toMatchObject({
      deleted_at: expect.any(String),
      metadata: {
        replaced_by_document_id: replacement.document.id,
        replaced_by_user_id: durableActor.id,
      },
    });
  });

  it("hides a target transferred after the request snapshot without provider or metadata mutation", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    enablePostgresClassifier(store, "hidden");
    const putObject = vi.spyOn(store.objectStorage!, "putObject");
    const before = store.documents.length;

    await expect(
      new EmsService(store).attachEmployeeDocument(admin.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(putObject).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(before);
  });
});

function enablePostgresClassifier(
  store: DataStore,
  result: "authorized" | "forbidden" | "hidden",
  durableActor?: AuthUser,
) {
  const classifier = vi.fn(async (userId: string) => {
    if (result !== "authorized") return { decision: result };
    const actor = durableActor ?? store.users.find((user) => user.id === userId);
    if (!actor) throw new Error("Authorized EMS classifier test requires a durable actor.");
    return { decision: "authorized" as const, actor: structuredClone(actor) };
  });
  store.kind = "postgres";
  store.persistence = persistenceWithClassifier(classifier);
  return classifier;
}

function persistenceWithClassifier(
  classifier: ReturnType<typeof vi.fn> | undefined,
): NonNullable<DataStore["persistence"]> {
  return {
    classifyEmsEmployeeDocumentAccess: classifier,
    flushDomain: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as NonNullable<DataStore["persistence"]>;
}

function uploadPayload() {
  return {
    classification: "normal" as const,
    document_type: "identity_proof",
    file_name: "identity.pdf",
    mime_type: "application/pdf",
    size_bytes: 128,
  };
}
