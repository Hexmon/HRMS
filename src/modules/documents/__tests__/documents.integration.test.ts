import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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

  it("denies restricted classifications to unauthorized managers", async () => {
    const admin = await loginAs(app, "ADM");
    const director = await loginAs(app, "S1");
    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: authHeader(admin.token),
      payload: {
        business_object_type: "employee",
        business_object_id: director.user.id,
        classification: "medical",
        document_type: "medical_record",
        file_name: "medical.pdf",
        mime_type: "application/pdf",
        size_bytes: 100
      }
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().metadata.storage_adapter).toBe(app.store.objectStorage?.kind);
    await expect(app.store.objectStorage?.statObject(upload.json().storage_key)).resolves.toMatchObject({
      size: expect.any(Number)
    });

    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${upload.json().id}/download-url`,
      headers: authHeader(director.token)
    });
    expect(denied.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${upload.json().id}/download-url`,
      headers: authHeader(admin.token)
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().url).toEqual(expect.any(String));

    const accessLog = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${upload.json().id}/access-log?page=1&page_size=20`,
      headers: authHeader(admin.token)
    });
    expect(accessLog.statusCode).toBe(200);
    expect(accessLog.json().total).toBeGreaterThanOrEqual(3);
  });

  it("stores multipart PDF, image, and general document uploads with compression metadata", async () => {
    const admin = await loginAs(app, "ADM");
    app.store.documentProcessing.pdfCompression = {
      enabled: true,
      binary: "hawkaii-missing-gs",
      quality: "ebook",
      minBytes: 0,
      timeoutMs: 1000,
      failOpen: true
    };

    const pdfBody = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "utf8");
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
    expect(pdfUpload.statusCode).toBe(200);
    expect(pdfUpload.json().metadata).toMatchObject({
      storage_adapter: app.store.objectStorage?.kind,
      pdf_compression_attempted: true,
      pdf_compressed: false,
      pdf_original_size_bytes: pdfBody.length,
      pdf_output_size_bytes: pdfBody.length
    });
    expect(pdfUpload.json().metadata.pdf_compression_reason).toMatch(/^failed:/u);
    await expect(app.store.objectStorage?.statObject(pdfUpload.json().storage_key)).resolves.toMatchObject({
      size: pdfBody.length
    });

    const imageBody = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const imageUpload = await multipartUpload(app, {
      url: "/api/v1/documents",
      token: admin.token,
      fields: {
        business_object_type: "employee",
        business_object_id: admin.user.id,
        classification: "normal",
        document_type: "profile_photo"
      },
      file: {
        fieldName: "file",
        fileName: "profile-photo.png",
        mimeType: "image/png",
        body: imageBody
      }
    });
    expect(imageUpload.statusCode).toBe(200);
    expect(imageUpload.json().metadata).toMatchObject({
      object_upload_compressed: app.store.objectStorage?.kind === "cloudinary",
      pdf_compression_attempted: false,
      pdf_compressed: false,
      original_size_bytes: imageBody.length,
      stored_size_bytes: imageBody.length
    });

    const textBody = Buffer.from("plain text supporting document", "utf8");
    const textUpload = await multipartUpload(app, {
      url: "/api/v1/documents",
      token: admin.token,
      fields: {
        business_object_type: "employee",
        business_object_id: admin.user.id,
        classification: "normal",
        document_type: "supporting_note"
      },
      file: {
        fieldName: "file",
        fileName: "supporting-note.txt",
        mimeType: "text/plain",
        body: textBody
      }
    });
    expect(textUpload.statusCode).toBe(200);
    expect(textUpload.json().metadata).toMatchObject({
      object_upload_compressed: false,
      pdf_compression_attempted: false,
      pdf_compressed: false,
      original_size_bytes: textBody.length,
      stored_size_bytes: textBody.length
    });

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/documents?page=1&page_size=10&business_object_type=employee&business_object_id=${admin.user.id}`,
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBeGreaterThanOrEqual(3);

    const download = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${pdfUpload.json().id}/download-url`,
      headers: authHeader(admin.token)
    });
    expect(download.statusCode).toBe(200);
    expect(download.json().url).toEqual(expect.any(String));
  });

  it("stores multipart uploads through expense and EMS document wrapper paths", async () => {
    const employee = await loginAs(app, "E1");

    const createExpense = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader(employee.token),
      payload: projectTravelPayload
    });
    expect(createExpense.statusCode).toBe(200);

    const receiptBody = Buffer.from("%PDF-1.4\nreceipt\n%%EOF\n", "utf8");
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
    expect(expenseUpload.statusCode).toBe(200);
    expect(expenseUpload.json()).toMatchObject({
      business_object_type: "expense_ticket",
      business_object_id: createExpense.json().id,
      document_type: "receipt",
      file_name: "receipt.pdf",
      mime_type: "application/pdf",
      size_bytes: receiptBody.length
    });
    expect(app.store.expenseDocuments.some((document) => document.document_id === expenseUpload.json().id)).toBe(true);

    const imageBody = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);
    const emsUpload = await multipartUpload(app, {
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      token: employee.token,
      fields: {
        classification: "normal",
        document_type: "identity_photo"
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
      business_object_type: "employee",
      business_object_id: employee.user.id,
      owner_user_id: employee.user.id,
      document_type: "identity_photo",
      file_name: "identity-photo.jpg",
      mime_type: "image/jpeg",
      size_bytes: imageBody.length
    });
    expect(emsUpload.json().document.metadata).toMatchObject({
      object_upload_compressed: app.store.objectStorage?.kind === "cloudinary",
      original_size_bytes: imageBody.length,
      stored_size_bytes: imageBody.length
    });

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
    expect(emsDownload.json().url).toEqual(expect.any(String));
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
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat(chunks)
  });
}
