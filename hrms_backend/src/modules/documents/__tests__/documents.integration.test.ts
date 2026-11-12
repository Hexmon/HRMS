import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("document management integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("fails closed before generic PostgreSQL document upload or classification access", async () => {
    const admin = await loginAs(app, "ADM");
    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: authHeader(admin.token),
      payload: {
        business_object_type: "employee",
        business_object_id: admin.user.id,
        classification: "medical",
        document_type: "medical_record",
        file_name: "medical.pdf",
        mime_type: "application/pdf",
        size_bytes: 100
      }
    });
    expect(upload.statusCode).toBe(409);
    expect(upload.json().message).toBe("Durable media storage is not configured");
  });

  it("fails closed before parsing generic PostgreSQL multipart document uploads", async () => {
    const admin = await loginAs(app, "ADM");
    app.store.documentProcessing.pdfCompression = {
      enabled: true,
      binary: "hawkaii-missing-gs",
      quality: "ebook",
      minBytes: 0,
      timeoutMs: 1000,
      failOpen: true
    };

    const pdfBody = await validPdf();
    const pdfUpload = await multipartUpload(app, {
      url: "/api/v1/documents",
      token: admin.token,
      fields: {
        business_object_type: "employee",
        business_object_id: admin.user.id,
        classification: "normal",
        document_type: "identity_proof"
      },
      file: {
        fieldName: "file",
        fileName: "identity-proof.pdf",
        mimeType: "application/pdf",
        body: pdfBody
      }
    });
    expect(pdfUpload.statusCode).toBe(409);
    expect(pdfUpload.json().message).toBe(
      "This document parent is not yet supported by the durable media protocol",
    );
  });

  it("exposes and enforces the backend media upload policy", async () => {
    const admin = await loginAs(app, "ADM");

    const policy = await app.inject({
      method: "GET",
      url: "/api/v1/documents/upload-policy",
      headers: authHeader(admin.token)
    });
    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      max_bytes: app.store.documentProcessing.mediaUploads.maxBytes,
      image_max_width: app.store.documentProcessing.mediaUploads.imageMaxWidth,
      image_max_height: app.store.documentProcessing.mediaUploads.imageMaxHeight,
      image_jpeg_quality: app.store.documentProcessing.mediaUploads.imageJpegQuality,
      image_output_mime_type: "image/jpeg"
    });
    expect(policy.json().allowed_mime_types).toContain("application/pdf");

    const disallowed = await multipartUpload(app, {
      url: "/api/v1/documents",
      token: admin.token,
      fields: {
        business_object_type: "employee",
        business_object_id: admin.user.id,
        classification: "normal",
        document_type: "unsupported"
      },
      file: {
        fieldName: "file",
        fileName: "unsafe.exe",
        mimeType: "application/x-msdownload",
        body: Buffer.from("unsafe", "utf8")
      }
    });
    expect(disallowed.statusCode).toBe(409);
    expect(disallowed.json().message).toBe(
      "Uploaded file content does not match its declared type",
    );

    app.store.documentProcessing.mediaUploads.maxBytes = 8;
    const oversized = await multipartUpload(app, {
      url: "/api/v1/documents",
      token: admin.token,
      fields: {
        business_object_type: "core_user",
        business_object_id: admin.user.id,
        classification: "normal",
        document_type: "identity_proof"
      },
      file: {
        fieldName: "file",
        fileName: "too-large.txt",
        mimeType: "text/plain",
        body: Buffer.from("too large", "utf8")
      }
    });
    expect(oversized.statusCode).toBe(409);
    expect(oversized.json()).toMatchObject({
      message: "File is larger than the configured media upload limit",
      details: { max_bytes: 8, actual_bytes: 9 },
    });
  });

  it("keeps SQL expense receipt upload fail closed while the EMS wrapper remains available", async () => {
    const employee = await loginAs(app, "E1");

    const createExpense = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { ...authHeader(employee.token), "idempotency-key": "documents-expense-create-001" },
      payload: projectTravelPayload
    });
    expect(createExpense.statusCode).toBe(200);

    const receiptBody = Buffer.from("%PDF-1.4\nreceipt\n%%EOF\n", "utf8");
    const beforeExpenseUpload = {
      documents: app.store.documents.length,
      expenseDocuments: app.store.expenseDocuments.length,
      outbox: app.store.outbox.length
    };
    expect(app.store.objectStorage).toBeDefined();
    const putObject = vi.spyOn(app.store.objectStorage!, "putObject");
    try {
      const expenseUpload = await multipartUpload(app, {
        url: `/api/v1/expenses/${createExpense.json().id}/documents`,
        token: employee.token,
        fields: {
          classification: "finance",
          document_type: "receipt"
        },
        file: {
          fieldName: "file",
          fileName: "receipt.pdf",
          mimeType: "application/pdf",
          body: receiptBody
        }
      });
      expect(expenseUpload.statusCode).toBe(409);
      expect(expenseUpload.json()).toMatchObject({
        message: "Expense receipt upload requires transaction-owned parent authorization"
      });
      expect(putObject).not.toHaveBeenCalled();
      expect(app.store.documents).toHaveLength(beforeExpenseUpload.documents);
      expect(app.store.expenseDocuments).toHaveLength(beforeExpenseUpload.expenseDocuments);
      expect(app.store.outbox).toHaveLength(beforeExpenseUpload.outbox);
    } finally {
      putObject.mockRestore();
    }

    const imageBody = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    }).jpeg().toBuffer();
    const emsUpload = await multipartUpload(app, {
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      token: employee.token,
      fields: {
        classification: "normal",
        document_type: "identity_proof"
      },
      file: {
        fieldName: "file",
        fileName: "identity-photo.jpg",
        mimeType: "image/jpeg",
        body: imageBody
      }
    });
    expect(emsUpload.statusCode).toBe(200);
    expect(emsUpload.json().document).toMatchObject({
      business_object_type: "core_user",
      business_object_id: employee.user.id,
      owner_user_id: employee.user.id,
      document_type: "identity_proof",
      file_name: "identity-photo.jpg",
      mime_type: "image/jpeg",
      size_bytes: imageBody.length
    });
    expect(emsUpload.json().document.metadata).toEqual({});
    expect(emsUpload.json().document).not.toHaveProperty("storage_key");

    const emsList = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(emsList.statusCode).toBe(200);
    expect(emsList.json().items.some((document: { id: string }) => document.id === emsUpload.json().document.id)).toBe(true);

    const emsDownload = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${emsUpload.json().document.id}/download-url`,
      headers: authHeader(employee.token)
    });
    expect(emsDownload.statusCode).toBe(200);
    expect(emsDownload.json()).toEqual({
      document_id: emsUpload.json().document.id,
      url: `/api/v1/documents/${emsUpload.json().document.id}/content`,
      expires_in_seconds: 0,
    });

    const emsContent = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${emsUpload.json().document.id}/content`,
      headers: authHeader(employee.token)
    });
    expect(emsContent.statusCode).toBe(200);
    expect(emsContent.headers["content-type"]).toBe("image/jpeg");
    expect(emsContent.headers["cache-control"]).toBe("private, no-store");
    expect(emsContent.headers["x-content-type-options"]).toBe("nosniff");
    expect(emsContent.rawPayload).toEqual(imageBody);

    const deleteDocument = await app.inject({
      method: "DELETE",
      url: `/api/v1/documents/${emsUpload.json().document.id}`,
      headers: authHeader(employee.token)
    });
    expect(deleteDocument.statusCode).toBe(409);
    expect(deleteDocument.json().message).toMatch(/immutable tenant ownership/u);

    const listAfterDelete = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(listAfterDelete.statusCode).toBe(200);
    expect(
      listAfterDelete.json().items.some((document: { id: string }) => document.id === emsUpload.json().document.id)
    ).toBe(true);
  });
});

interface MultipartUploadInput {
  url: string;
  token: string;
  fields: Record<string, string>;
  file: {
    fieldName: string;
    fileName: string;
    mimeType: string;
    body: Buffer;
  };
}

function multipartUpload(app: FastifyInstance, input: MultipartUploadInput) {
  const boundary = `----hawkaii-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(
    Buffer.from(
      `Content-Disposition: form-data; name="${input.file.fieldName}"; filename="${input.file.fileName}"\r\n`
    )
  );
  chunks.push(Buffer.from(`Content-Type: ${input.file.mimeType}\r\n\r\n`));
  chunks.push(input.file.body);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return app.inject({
    method: "POST",
    url: input.url,
    headers: {
      ...authHeader(input.token),
      "idempotency-key": "documents-integration-upload-001",
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat(chunks)
  });
}

let pdfFixture: Promise<Buffer> | undefined;

function validPdf(): Promise<Buffer> {
  pdfFixture ??= (async () => {
    const document = await PDFDocument.create();
    document.addPage([100, 100]);
    return Buffer.from(await document.save());
  })();
  return pdfFixture;
}
