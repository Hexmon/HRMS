import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin company profile", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("allows Admin to read and update company profile with optimistic concurrency", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbiddenRead = await app.inject({
      method: "GET",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(employee.token)
    });
    expect(forbiddenRead.statusCode).toBe(403);

    const read = await app.inject({
      method: "GET",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token)
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      company_name: "Hawkaii HRMS",
      timezone: "Asia/Kolkata",
      fiscal_year_start_month: 4,
      version: 1
    });

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token),
      payload: {
        company_name: "Hawkaii HRMS India",
        website: "https://hawkaii.com",
        industry: "Software / SaaS",
        address: "Bengaluru",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        currency: "INR",
        fiscal_year_start_month: 4,
        working_week: "Mon-Fri",
        work_hours_per_day: 8.5,
        logo_label: "HK",
        expected_version: read.json().version
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      company_name: "Hawkaii HRMS India",
      website: "https://hawkaii.com",
      work_hours_per_day: 8.5,
      version: 2
    });
    expect(app.store.outbox.at(-1)).toMatchObject({
      aggregate_type: "company_profile",
      aggregate_id: update.json().id,
      event_type: "admin.company_profile.updated",
      payload: expect.objectContaining({
        actor_user_id: admin.user.id,
        company_name: "Hawkaii HRMS India"
      })
    });

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(admin.token),
      payload: {
        company_name: "Stale Update",
        expected_version: 1
      }
    });
    expect(stale.statusCode).toBe(409);

    const forbiddenWrite = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/company-profile",
      headers: authHeader(employee.token),
      payload: {
        company_name: "Not allowed",
        expected_version: 2
      }
    });
    expect(forbiddenWrite.statusCode).toBe(403);
  });

  it("uploads company logo through the document storage policy", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const policy = await app.inject({
      method: "GET",
      url: "/api/v1/documents/upload-policy",
      headers: authHeader(admin.token)
    });
    expect(policy.statusCode).toBe(200);
    expect(policy.json().company_logo).toMatchObject({
      max_bytes: 2 * 1024 * 1024,
      image_max_width: 512,
      image_max_height: 512,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]
    });

    const forbidden = await multipartUpload(app, {
      url: "/api/v1/admin/company-profile/logo",
      token: employee.token,
      fields: {},
      file: {
        fieldName: "file",
        fileName: "company-logo.jpg",
        mimeType: "image/jpeg",
        body: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])
      }
    });
    expect(forbidden.statusCode).toBe(403);

    const upload = await multipartUpload(app, {
      url: "/api/v1/admin/company-profile/logo",
      token: admin.token,
      fields: {},
      file: {
        fieldName: "file",
        fileName: "company-logo.jpg",
        mimeType: "image/jpeg",
        body: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])
      }
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().company).toMatchObject({
      logo_document_id: expect.any(String),
      logo_file_name: "company-logo.jpg",
      logo_mime_type: "image/jpeg",
      logo_size_bytes: 7
    });
    expect(upload.json().document.metadata).toMatchObject({
      media_upload_policy_max_bytes: 2 * 1024 * 1024,
      cloudinary_upload_compressed: true
    });

    const oversized = await multipartUpload(app, {
      url: "/api/v1/admin/company-profile/logo",
      token: admin.token,
      fields: {},
      file: {
        fieldName: "file",
        fileName: "too-large.jpg",
        mimeType: "image/jpeg",
        body: Buffer.alloc(2 * 1024 * 1024 + 1, 1)
      }
    });
    expect(oversized.statusCode).toBe(400);
    expect(oversized.json().message).toMatch(/larger than the configured media upload limit/iu);
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
