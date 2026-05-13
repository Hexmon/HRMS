import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
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
    expect(upload.json().metadata.storage_adapter).toBe("minio");
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
    expect(allowed.json().url).toContain("X-Amz-Signature");

    const accessLog = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${upload.json().id}/access-log?page=1&page_size=20`,
      headers: authHeader(admin.token)
    });
    expect(accessLog.statusCode).toBe(200);
    expect(accessLog.json().total).toBeGreaterThanOrEqual(3);
  });
});
