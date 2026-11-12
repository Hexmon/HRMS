import { randomUUID } from "node:crypto";
import { authHeader, loginAs } from "#testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { PDFDocument } from "pdf-lib";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import { MediaLifecycleService } from "../media-lifecycle.js";

describe("PostgreSQL document routes fail closed before private object I/O", () => {
  let app: FastifyInstance;
  const store = createMemoryDataStore();
  const storage = new MemoryObjectStorage();

  beforeEach(async () => {
    store.kind = "memory";
    store.persistence = null;
    store.objectStorage = storage;
    store.pgPool = null;
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
      const response = await app.inject({
        method: "GET",
        url,
        headers: authHeader(token),
      });
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

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/documents",
      headers: authHeader(token),
    });
    expect(list.statusCode).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    [
      "expense_ticket",
      "Expense receipt upload requires transaction-owned parent authorization",
    ],
    [
      "project",
      "This document parent is not yet supported by the durable media protocol",
    ],
  ])(
    "rejects unsupported durable %s parents before lifecycle upload",
    async (businessObjectType, expectedMessage) => {
      const { token } = await loginAs(app, "ADM");
      configurePostgresMediaStore();
      const upload = vi.spyOn(MediaLifecycleService.prototype, "upload");

      const response = await multipartDocumentUpload({
        token,
        fields: {
          business_object_type: businessObjectType,
          business_object_id: randomUUID(),
          classification: "normal",
          document_type: "identity_proof",
        },
        fileName: "proof.pdf",
        mimeType: "application/pdf",
        body: await validPdf(),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().message).toBe(expectedMessage);
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("rejects disallowed and oversized durable media before lifecycle upload", async () => {
    const { token, user } = await loginAs(app, "ADM");
    configurePostgresMediaStore();
    const upload = vi.spyOn(MediaLifecycleService.prototype, "upload");

    const disallowed = await multipartDocumentUpload({
      token,
      fields: durableFields(user.id),
      fileName: "proof.exe",
      mimeType: "application/x-msdownload",
      body: Buffer.from("unsafe"),
    });
    expect(disallowed.statusCode).toBe(409);
    expect(disallowed.json().message).toBe(
      "Uploaded file content does not match its declared type",
    );

    const previousLimit = store.documentProcessing.mediaUploads.maxBytes;
    store.documentProcessing.mediaUploads.maxBytes = 4;
    try {
      const oversizedBody = await validPdf();
      const oversized = await multipartDocumentUpload({
        token,
        fields: durableFields(user.id),
        fileName: "proof.pdf",
        mimeType: "application/pdf",
        body: oversizedBody,
      });
      expect(oversized.statusCode).toBe(409);
      expect(oversized.json()).toMatchObject({
        message: "File is larger than the configured media upload limit",
        details: { max_bytes: 4, actual_bytes: oversizedBody.length },
      });
    } finally {
      store.documentProcessing.mediaUploads.maxBytes = previousLimit;
    }
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects executable bytes disguised as an allowlisted PDF", async () => {
    const { token, user } = await loginAs(app, "ADM");
    configurePostgresMediaStore();
    const upload = vi.spyOn(MediaLifecycleService.prototype, "upload");

    const response = await multipartDocumentUpload({
      token,
      fields: durableFields(user.id),
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("MZ\u0090\u0000disguised-executable"),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      "Uploaded file content does not match its declared type",
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects multipart metadata smuggling and multiple file parts", async () => {
    const { token, user } = await loginAs(app, "ADM");
    configurePostgresMediaStore();
    const upload = vi.spyOn(MediaLifecycleService.prototype, "upload");

    const disguised = await multipartDocumentUpload({
      token,
      fields: {
        ...durableFields(user.id),
        mime_type: "application/pdf",
        file_name: "safe.pdf",
        size_bytes: "12",
      },
      fileName: "payload.exe",
      mimeType: "application/x-msdownload",
      body: Buffer.from("unsafe-bytes"),
    });
    expect(disguised.statusCode).toBe(409);
    expect(disguised.json().message).toMatch(
      /metadata must come from the file part/u,
    );

    const multiple = await multipartDocumentUpload({
      token,
      fields: durableFields(user.id),
      fileName: "first.pdf",
      mimeType: "application/pdf",
      body: await validPdf(),
      extraFiles: [
        {
          fileName: "second.exe",
          mimeType: "application/x-msdownload",
          body: Buffer.from("second-unsafe"),
        },
      ],
    });
    expect(multiple.statusCode).toBe(409);
    expect(multiple.json().message).toBe(
      "Exactly one multipart file is allowed",
    );

    const unexpectedFileField = await multipartDocumentUpload({
      token,
      fields: durableFields(user.id),
      fileName: "proof.pdf",
      fileFieldName: "attachment",
      mimeType: "application/pdf",
      body: await validPdf(),
    });
    expect(unexpectedFileField.statusCode).toBe(409);
    expect(unexpectedFileField.json().message).toBe(
      "Unexpected multipart file field",
    );

    const duplicateField = await multipartDocumentUpload({
      token,
      fields: durableFields(user.id),
      extraFieldEntries: [["classification", "medical"]],
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      body: await validPdf(),
    });
    expect(duplicateField.statusCode).toBe(409);
    expect(duplicateField.json().message).toBe("Duplicate multipart field");
    expect(upload).not.toHaveBeenCalled();
  });

  it("passes an allowlisted normalized durable command and returns public metadata", async () => {
    const { token, user } = await loginAs(app, "ADM");
    configurePostgresMediaStore();
    const documentId = randomUUID();
    const now = new Date().toISOString();
    const upload = vi
      .spyOn(MediaLifecycleService.prototype, "upload")
      .mockResolvedValue({
        intent_id: randomUUID(),
        state: "finalized",
        document: {
          id: documentId,
          business_object_type: "core_user",
          business_object_id: user.id,
          owner_user_id: user.id,
          classification: "normal",
          document_type: "identity_proof",
          current_version: 1,
          file_name: "proof.pdf",
          storage_key: "private/secret-object",
          mime_type: "application/pdf",
          size_bytes: 17,
          checksum_sha256: "checksum",
          metadata: { provider_etag: "secret" },
          created_by_user_id: user.id,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

    const response = await multipartDocumentUpload({
      token,
      idempotencyKey: "documents-route-upload-001",
      fields: {
        ...durableFields(user.id),
        company_id: randomUUID(),
        actor: "attacker-controlled-actor",
        role: "Admin",
        operation: "replace_company_logo",
        owner_user_id: randomUUID(),
        expectedPointerDocumentId: randomUUID(),
        expectedVersion: "999",
        storage_key: "attacker-controlled-key",
      },
      fileName: "proof.pdf",
      mimeType: "APPLICATION/PDF",
      body: await validPdf(),
    });

    expect(response.statusCode).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toEqual({
      actor: expect.objectContaining({ id: user.id }),
      operation: "create",
      parentType: "core_user",
      parentId: user.id,
      businessObjectType: "core_user",
      ownerUserId: user.id,
      classification: "normal",
      documentType: "identity_proof",
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      body: await validPdf(),
      idempotencyKey: "documents-route-upload-001",
    });
    expect(response.json()).toMatchObject({ id: documentId, metadata: {} });
    expect(response.json()).not.toHaveProperty("storage_key");
    expect(JSON.stringify(response.json())).not.toMatch(
      /secret-object|provider_etag/u,
    );
  });

  function configurePostgresMediaStore(): void {
    store.kind = "postgres";
    store.pgPool = {} as Pool;
    store.objectStorage = storage;
    store.persistence = {
      classifyExpenseDocumentAccess: async () => "other",
      close: async () => undefined,
    } as unknown as NonNullable<typeof store.persistence>;
  }

  function durableFields(userId: string): Record<string, string> {
    return {
      business_object_type: "core_user",
      business_object_id: userId,
      classification: "normal",
      document_type: "identity_proof",
    };
  }

  async function multipartDocumentUpload(input: {
    token: string;
    fields: Record<string, string>;
    fileName: string;
    mimeType: string;
    body: Buffer;
    fileFieldName?: string;
    idempotencyKey?: string;
    extraFieldEntries?: Array<[string, string]>;
    extraFiles?: Array<{
      fileName: string;
      mimeType: string;
      body: Buffer;
      fieldName?: string;
    }>;
  }) {
    const boundary = `----documents-unit-${randomUUID()}`;
    const chunks: Buffer[] = [];
    for (const [name, value] of Object.entries(input.fields)) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    }
    for (const [name, value] of input.extraFieldEntries ?? []) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    }
    const files = [
      {
        fileName: input.fileName,
        mimeType: input.mimeType,
        body: input.body,
        fieldName: input.fileFieldName,
      },
      ...(input.extraFiles ?? []),
    ];
    for (const file of files) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName ?? "file"}"; filename="${file.fileName}"\r\n` +
            `Content-Type: ${file.mimeType}\r\n\r\n`,
        ),
      );
      chunks.push(file.body, Buffer.from("\r\n"));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: {
        ...authHeader(input.token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "idempotency-key": input.idempotencyKey ?? "documents-route-policy-001",
      },
      payload: Buffer.concat(chunks),
    });
  }
});

let pdfFixture: Promise<Buffer> | undefined;

function validPdf(): Promise<Buffer> {
  pdfFixture ??= (async () => {
    const document = await PDFDocument.create();
    document.addPage([100, 100]);
    return Buffer.from(await document.save());
  })();
  return pdfFixture;
}
