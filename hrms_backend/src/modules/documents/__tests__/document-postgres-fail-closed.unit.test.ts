import { randomUUID } from "node:crypto";
import { authHeader, loginAs } from "#testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";

describe("PostgreSQL document routes fail closed before private object I/O", () => {
  let app: FastifyInstance;
  const store = createMemoryDataStore();
  const storage = new MemoryObjectStorage();

  beforeEach(async () => {
    store.kind = "memory";
    store.persistence = null;
    store.objectStorage = storage;
    app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("blocks ordinary metadata and content before GET/HEAD", async () => {
    const { token } = await loginAs(app, "ADM");
    const documentId = randomUUID();
    store.kind = "postgres";
    store.persistence = {
      classifyExpenseDocumentAccess: async () => "other",
      close: async () => undefined,
    } as unknown as NonNullable<typeof store.persistence>;
    const get = vi.spyOn(storage, "getObject");
    const stat = vi.spyOn(storage, "statObject");

    for (const url of [
      `/api/v1/documents/${documentId}`,
      `/api/v1/documents/${documentId}/content`,
    ]) {
      const response = await app.inject({ method: "GET", url, headers: authHeader(token) });
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toMatch(/immutable tenant ownership/u);
    }
    expect(get).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
  });

  it("blocks upload and list before PUT or provider enumeration", async () => {
    const { token } = await loginAs(app, "ADM");
    store.kind = "postgres";
    const put = vi.spyOn(storage, "putObject");

    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: authHeader(token),
      payload: {
        business_object_type: "employee",
        business_object_id: randomUUID(),
        classification: "normal",
        document_type: "identity_proof",
        file_name: "proof.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
      },
    });
    expect(upload.statusCode).toBe(409);
    expect(put).not.toHaveBeenCalled();

    const list = await app.inject({ method: "GET", url: "/api/v1/documents", headers: authHeader(token) });
    expect(list.statusCode).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });
});
