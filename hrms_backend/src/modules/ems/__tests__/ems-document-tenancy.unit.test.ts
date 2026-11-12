import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Roles } from "#shared";
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
    expect(classifier).toHaveBeenCalledWith(employee.user.id, employee.user.id);
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

  it("normalizes a missing durable classifier and a stale local target company to hidden denial", async () => {
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
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("allows same-company privileged reads but limits writes to self or HR/Admin", async () => {
    const auditor = await loginAs(app, "AUD");
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    enablePostgresClassifier(store, "authorized");
    const service = new EmsService(store);

    await expect(
      service.listEmployeeDocuments(auditor.user, employee.user.id, { page: 1, page_size: 10 }),
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      service.attachEmployeeDocument(auditor.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.attachEmployeeDocument(admin.user, employee.user.id, uploadPayload()),
    ).resolves.toMatchObject({
      access_policy: { business_object_id: employee.user.id },
    });
  });

  it("keeps same-company hierarchy denial and inactive-actor denial ahead of storage", async () => {
    const peer = await loginAs(app, "E2");
    const employee = await loginAs(app, "E1");
    enablePostgresClassifier(store, "authorized");
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
    await expect(
      service.attachEmployeeDocument(peer.user, employee.user.id, uploadPayload()),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(putObject).not.toHaveBeenCalled();
  });
});

function enablePostgresClassifier(store: DataStore, result: "authorized" | "hidden") {
  const classifier = vi.fn().mockResolvedValue(result);
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
