import { randomUUID } from "node:crypto";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
type JsonRecord = Record<string, unknown>;

const originalDatabaseUrl = process.env.DATABASE_URL;
const baseUrl = "/api/v1/attendance";

function uniqueCode(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function activeCompanyId(app: TestApp, userId: string): Promise<string> {
  const result = await app.store.pgPool!.query<{ company_id: string }>(
    `SELECT company_id
     FROM platform.user_session_preferences
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const companyId = result.rows[0]?.company_id;
  if (!companyId) throw new Error("Active test company was not found.");
  return companyId;
}

async function createCompany(app: TestApp, label = uniqueCode("company")): Promise<string> {
  const companyId = randomUUID();
  await app.store.pgPool!.query(
    `INSERT INTO platform.company_profiles (
       id, company_name, company_slug, status, bootstrap_completed_at
     ) VALUES ($1, $2, $3, 'active', now())`,
    [companyId, `Admin Geo ${label}`, label.toLowerCase()],
  );
  return companyId;
}

async function request(
  app: FastifyInstance,
  token: string,
  method: InjectOptions["method"],
  url: string,
  payload?: JsonRecord,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: authHeader(token),
    ...(payload === undefined ? {} : { payload }),
  });
}

function json(response: LightMyRequestResponse): JsonRecord {
  return response.json() as JsonRecord;
}

function expectEnvelope(response: LightMyRequestResponse, statusCode: number, code?: string): JsonRecord {
  expect(response.statusCode, response.body).toBe(statusCode);
  const body = json(response);
  expect(body).toEqual(
    expect.objectContaining({
      code: expect.any(String),
      message: expect.any(String),
      request_id: expect.any(String),
    }),
  );
  if (code) expect(body.code).toBe(code);
  return body;
}

function expectOk(response: LightMyRequestResponse): JsonRecord {
  expect(response.statusCode, response.body).toBe(200);
  return json(response);
}

async function createWorkSite(
  app: TestApp,
  token: string,
  input: Partial<{
    siteCode: string;
    name: string;
    siteType: string;
    timezone: string;
    metadata: JsonRecord;
    companyId: string;
  }> = {},
): Promise<JsonRecord> {
  const response = await request(app, token, "POST", `${baseUrl}/work-sites`, {
    siteCode: input.siteCode ?? uniqueCode("SITE"),
    name: input.name ?? "Admin Geo Site",
    siteType: input.siteType ?? "office",
    timezone: input.timezone ?? "Asia/Kolkata",
    metadata: input.metadata ?? { source: "integration" },
  });
  return expectOk(response).workSite as JsonRecord;
}

async function createGeofence(
  app: TestApp,
  token: string,
  workSiteId: string,
  input: Partial<{
    geofenceCode: string;
    name: string;
    metadata: JsonRecord;
    workSiteId: string;
    companyId: string;
  }> = {},
): Promise<JsonRecord> {
  const response = await request(app, token, "POST", `${baseUrl}/work-sites/${workSiteId}/geofences`, {
    geofenceCode: input.geofenceCode ?? uniqueCode("FENCE"),
    name: input.name ?? "Admin Geo Fence",
    metadata: input.metadata ?? { source: "integration" },
  });
  return expectOk(response).geofence as JsonRecord;
}

async function createCircleDraft(
  app: TestApp,
  token: string,
  geofenceId: string,
  input: Partial<{ longitude: number; latitude: number; radiusMeters: number }> = {},
): Promise<JsonRecord> {
  const response = await request(app, token, "POST", `${baseUrl}/geofences/${geofenceId}/versions`, {
    shapeType: "circle",
    center: {
      longitude: input.longitude ?? 77.5946,
      latitude: input.latitude ?? 12.9716,
    },
    radiusMeters: input.radiusMeters ?? 125,
    shapeMetadata: { source: "circle" },
  });
  return expectOk(response).version as JsonRecord;
}

async function createPolygonDraft(
  app: TestApp,
  token: string,
  geofenceId: string,
  vertices: number[][] = [
    [77.594, 12.971],
    [77.596, 12.971],
    [77.596, 12.973],
    [77.594, 12.973],
  ],
): Promise<JsonRecord> {
  const response = await request(app, token, "POST", `${baseUrl}/geofences/${geofenceId}/versions`, {
    shapeType: "polygon",
    vertices,
    shapeMetadata: { source: "polygon" },
  });
  return expectOk(response).version as JsonRecord;
}

async function directWorkSite(
  app: TestApp,
  companyId: string,
  input: Partial<{ siteCode: string; deleted: boolean }> = {},
): Promise<string> {
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
       company_id, site_code, name, site_type, timezone, is_active, metadata, deleted_at
     ) VALUES ($1, $2, 'Direct Site', 'office', 'Asia/Kolkata', $3, '{}'::jsonb, $4)
     RETURNING id`,
    [
      companyId,
      input.siteCode ?? uniqueCode("DIRECT_SITE"),
      input.deleted ? false : true,
      input.deleted ? new Date() : null,
    ],
  );
  return result.rows[0]!.id;
}

async function directGeofence(
  app: TestApp,
  companyId: string,
  workSiteId: string,
  input: Partial<{ geofenceCode: string; deleted: boolean }> = {},
): Promise<string> {
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
       company_id, work_site_id, geofence_code, name, is_active, metadata, deleted_at
     ) VALUES ($1, $2, $3, 'Direct Fence', $4, '{}'::jsonb, $5)
     RETURNING id`,
    [
      companyId,
      workSiteId,
      input.geofenceCode ?? uniqueCode("DIRECT_FENCE"),
      input.deleted ? false : true,
      input.deleted ? new Date() : null,
    ],
  );
  return result.rows[0]!.id;
}

describe("admin geo CRUD API", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("creates, lists, updates, and logically deletes work sites with tenant isolation and OCC", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const otherCompanyId = await createCompany(app);

    for (const siteType of ["office", "client", "temporary"]) {
      const siteCode = uniqueCode(`SITE_${siteType.toUpperCase()}`);
      const site = await createWorkSite(app, admin.token, {
        siteCode,
        name: `Site ${siteType}`,
        siteType,
        metadata: { siteType, nested: { ok: true } },
      });
      expect(site).toMatchObject({
        siteCode,
        name: `Site ${siteType}`,
        siteType,
        timezone: "Asia/Kolkata",
        isActive: true,
        metadata: { siteType, nested: { ok: true } },
        version: 1,
      });

      const stored = await app.store.pgPool!.query<{ company_id: string }>(
        `SELECT company_id FROM attendance.work_sites WHERE id = $1`,
        [site.id],
      );
      expect(stored.rows[0]?.company_id).toBe(companyId);
    }

    const visible = await createWorkSite(app, admin.token, { siteCode: uniqueCode("VISIBLE") });
    const foreignSiteId = await directWorkSite(app, otherCompanyId);
    const deletedSiteId = await directWorkSite(app, companyId, { deleted: true });

    const listResponse = await request(app, admin.token, "GET", `${baseUrl}/work-sites`);
    const listedIds = ((expectOk(listResponse).items as JsonRecord[]) ?? []).map((site) => site.id);
    expect(listedIds).toContain(visible.id);
    expect(listedIds).not.toContain(foreignSiteId);
    expect(listedIds).not.toContain(deletedSiteId);

    const detail = expectOk(
      await request(app, admin.token, "GET", `${baseUrl}/work-sites/${visible.id}`),
    ).workSite as JsonRecord;
    expect(detail.id).toBe(visible.id);

    expectEnvelope(
      await request(app, admin.token, "GET", `${baseUrl}/work-sites/${foreignSiteId}`),
      404,
      "NOT_FOUND",
    );

    const update = expectOk(
      await request(app, admin.token, "PATCH", `${baseUrl}/work-sites/${visible.id}`, {
        name: "Updated Site",
        siteType: "client",
        isActive: false,
        metadata: { updated: true },
        expectedVersion: visible.version as number,
      }),
    ).workSite as JsonRecord;
    expect(update).toMatchObject({
      id: visible.id,
      name: "Updated Site",
      siteType: "client",
      isActive: false,
      metadata: { updated: true },
      version: 2,
    });
    const afterSpoof = await app.store.pgPool!.query<{ company_id: string }>(
      `SELECT company_id FROM attendance.work_sites WHERE id = $1`,
      [visible.id],
    );
    expect(afterSpoof.rows[0]?.company_id).toBe(companyId);

    expectEnvelope(
      await request(app, admin.token, "PATCH", `${baseUrl}/work-sites/${visible.id}`, {
        name: "Spoofed Site",
        companyId: otherCompanyId,
        expectedVersion: update.version as number,
      }),
      400,
      "VALIDATION_FAILED",
    );

    expectEnvelope(
      await request(app, admin.token, "PATCH", `${baseUrl}/work-sites/${visible.id}`, {
        name: "Stale Site",
        expectedVersion: visible.version as number,
      }),
      409,
      "WORKFLOW_CONFLICT",
    );

    const deleteResponse = expectOk(
      await request(app, admin.token, "DELETE", `${baseUrl}/work-sites/${visible.id}`, {
        expectedVersion: update.version as number,
      }),
    ).workSite as JsonRecord;
    expect(deleteResponse).toMatchObject({ id: visible.id, isActive: false, version: 3 });
    expect(deleteResponse.deletedAt).toEqual(expect.any(String));

    expectEnvelope(
      await request(app, admin.token, "GET", `${baseUrl}/work-sites/${visible.id}`),
      404,
      "NOT_FOUND",
    );
    const historical = await app.store.pgPool!.query<{
      is_active: boolean;
      deleted_at: Date | null;
    }>(`SELECT is_active, deleted_at FROM attendance.work_sites WHERE id = $1`, [visible.id]);
    expect(historical.rows[0]).toMatchObject({ is_active: false });
    expect(historical.rows[0]?.deleted_at).toBeInstanceOf(Date);
  });

  it("returns structured duplicate work-site code conflicts scoped by tenant", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const otherCompanyId = await createCompany(app);
    const siteCode = uniqueCode("DUP_SITE");

    await createWorkSite(app, admin.token, { siteCode });
    const duplicate = await request(app, admin.token, "POST", `${baseUrl}/work-sites`, {
      siteCode,
      name: "Duplicate Site",
      siteType: "office",
      timezone: "Asia/Kolkata",
      metadata: {},
    });
    const duplicateBody = expectEnvelope(duplicate, 409, "WORKFLOW_CONFLICT");
    expect(duplicateBody.details).toMatchObject({ field: "siteCode" });

    const sameCodeOtherCompany = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO attendance.work_sites (
         company_id, site_code, name, site_type, timezone, metadata
       ) VALUES ($1, $2, 'Other Company Same Code', 'office', 'Asia/Kolkata', '{}'::jsonb)
       RETURNING id`,
      [otherCompanyId, siteCode],
    );
    expect(sameCodeOtherCompany.rows[0]?.id).toEqual(expect.any(String));

    const scopedCount = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM attendance.work_sites
       WHERE site_code = $1 AND company_id IN ($2, $3)`,
      [siteCode, companyId, otherCompanyId],
    );
    expect(Number(scopedCount.rows[0]?.count)).toBe(2);
  });

  it("creates, updates, and logically deletes geofences with tenant isolation and scoped uniqueness", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(app, admin.user.id);
    const otherCompanyId = await createCompany(app);
    const site = await createWorkSite(app, admin.token);
    const otherSiteId = await directWorkSite(app, otherCompanyId);

    const geofenceCode = uniqueCode("GEOFENCE");
    const geofence = await createGeofence(app, admin.token, site.id as string, {
      geofenceCode,
      name: "Main Gate",
      metadata: { gate: "main" },
    });
    expect(geofence).toMatchObject({
      workSiteId: site.id,
      geofenceCode,
      name: "Main Gate",
      metadata: { gate: "main" },
      version: 1,
    });
    const stored = await app.store.pgPool!.query<{ company_id: string; work_site_id: string }>(
      `SELECT company_id, work_site_id FROM attendance.geofences WHERE id = $1`,
      [geofence.id],
    );
    expect(stored.rows[0]).toMatchObject({ company_id: companyId, work_site_id: site.id });

    expectEnvelope(
      await request(app, admin.token, "POST", `${baseUrl}/work-sites/${otherSiteId}/geofences`, {
        geofenceCode: uniqueCode("FOREIGN"),
        name: "Foreign",
        metadata: {},
      }),
      404,
      "NOT_FOUND",
    );

    const foreignGeofenceId = await directGeofence(app, otherCompanyId, otherSiteId);
    const deletedGeofenceId = await directGeofence(app, companyId, site.id as string, {
      deleted: true,
    });
    const list = expectOk(
      await request(app, admin.token, "GET", `${baseUrl}/work-sites/${site.id}/geofences`),
    ).items as JsonRecord[];
    const ids = list.map((item) => item.id);
    expect(ids).toContain(geofence.id);
    expect(ids).not.toContain(foreignGeofenceId);
    expect(ids).not.toContain(deletedGeofenceId);

    expectOk(await request(app, admin.token, "GET", `${baseUrl}/geofences/${geofence.id}`));
    expectEnvelope(
      await request(app, admin.token, "GET", `${baseUrl}/geofences/${foreignGeofenceId}`),
      404,
      "NOT_FOUND",
    );

    const updated = expectOk(
      await request(app, admin.token, "PATCH", `${baseUrl}/geofences/${geofence.id}`, {
        geofenceCode: `${geofenceCode}_UPDATED`,
        name: "Updated Fence",
        isActive: false,
        metadata: { updated: true },
        expectedVersion: geofence.version as number,
      }),
    ).geofence as JsonRecord;
    expect(updated).toMatchObject({
      id: geofence.id,
      workSiteId: site.id,
      geofenceCode: `${geofenceCode}_UPDATED`,
      name: "Updated Fence",
      isActive: false,
      metadata: { updated: true },
      version: 2,
    });

    expectEnvelope(
      await request(app, admin.token, "PATCH", `${baseUrl}/geofences/${geofence.id}`, {
        name: "Spoofed Fence",
        workSiteId: otherSiteId,
        companyId: otherCompanyId,
        expectedVersion: updated.version as number,
      }),
      400,
      "VALIDATION_FAILED",
    );

    expectEnvelope(
      await request(app, admin.token, "PATCH", `${baseUrl}/geofences/${geofence.id}`, {
        name: "Stale Fence",
        expectedVersion: geofence.version as number,
      }),
      409,
      "WORKFLOW_CONFLICT",
    );

    const duplicate = await request(app, admin.token, "POST", `${baseUrl}/work-sites/${site.id}/geofences`, {
      geofenceCode: `${geofenceCode}_UPDATED`,
      name: "Duplicate Fence",
      metadata: {},
    });
    const duplicateBody = expectEnvelope(duplicate, 409, "WORKFLOW_CONFLICT");
    expect(duplicateBody.details).toMatchObject({ field: "geofenceCode" });

    const secondSite = await createWorkSite(app, admin.token);
    const sameCodeDifferentSite = await createGeofence(app, admin.token, secondSite.id as string, {
      geofenceCode: `${geofenceCode}_UPDATED`,
    });
    expect(sameCodeDifferentSite.geofenceCode).toBe(`${geofenceCode}_UPDATED`);

    const draft = await createCircleDraft(app, admin.token, geofence.id as string);
    const deleted = expectOk(
      await request(app, admin.token, "DELETE", `${baseUrl}/geofences/${geofence.id}`, {
        expectedVersion: updated.version as number,
      }),
    ).geofence as JsonRecord;
    expect(deleted).toMatchObject({ id: geofence.id, isActive: false, version: 3 });
    expect(deleted.deletedAt).toEqual(expect.any(String));
    expectEnvelope(
      await request(app, admin.token, "GET", `${baseUrl}/geofences/${geofence.id}`),
      404,
      "NOT_FOUND",
    );
    const versionStillExists = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM attendance.geofence_versions
       WHERE id = $1 AND geofence_id = $2`,
      [draft.id, geofence.id],
    );
    expect(Number(versionStillExists.rows[0]?.count)).toBe(1);
  });

  it("creates circle and polygon draft versions with persisted spatial semantics and server numbering", async () => {
    const admin = await loginAs(app, "ADM");
    const site = await createWorkSite(app, admin.token);
    const geofence = await createGeofence(app, admin.token, site.id as string);

    const circle = await createCircleDraft(app, admin.token, geofence.id as string, {
      longitude: 77.5946,
      latitude: 12.9716,
      radiusMeters: 150,
    });
    expect(circle).toMatchObject({
      geofenceId: geofence.id,
      versionNumber: 1,
      versionStatus: "draft",
      shapeType: "circle",
      shape: {
        center: { longitude: 77.5946, latitude: 12.9716 },
        radiusMeters: 150,
      },
    });

    const circleDb = await app.store.pgPool!.query<{
      srid: number;
      geometry_type: string;
      longitude: number;
      latitude: number;
      radius: string;
    }>(
      `SELECT ST_SRID(shape) AS srid,
          ST_GeometryType(shape) AS geometry_type,
          ST_X(shape) AS longitude,
          ST_Y(shape) AS latitude,
          circle_radius_meters::text AS radius
       FROM attendance.geofence_versions
       WHERE id = $1`,
      [circle.id],
    );
    expect(circleDb.rows[0]).toMatchObject({
      srid: 4326,
      geometry_type: "ST_Point",
      longitude: 77.5946,
      latitude: 12.9716,
      radius: "150.00",
    });

    const vertices = [
      [77.594, 12.971],
      [77.596, 12.971],
      [77.596, 12.973],
      [77.594, 12.973],
    ];
    const polygon = await createPolygonDraft(app, admin.token, geofence.id as string, vertices);
    expect(polygon).toMatchObject({
      geofenceId: geofence.id,
      versionNumber: 2,
      versionStatus: "draft",
      shapeType: "polygon",
      shape: { vertices },
    });

    const polygonDb = await app.store.pgPool!.query<{
      srid: number;
      geometry_type: string;
      is_valid: boolean;
      first_point: string;
      last_point: string;
      npoints: number;
    }>(
      `SELECT ST_SRID(shape) AS srid,
          ST_GeometryType(shape) AS geometry_type,
          ST_IsValid(shape) AS is_valid,
          ST_AsText(ST_PointN(ST_ExteriorRing(shape), 1)) AS first_point,
          ST_AsText(ST_PointN(ST_ExteriorRing(shape), ST_NPoints(ST_ExteriorRing(shape)))) AS last_point,
          ST_NPoints(ST_ExteriorRing(shape))::integer AS npoints
       FROM attendance.geofence_versions
       WHERE id = $1`,
      [polygon.id],
    );
    expect(polygonDb.rows[0]).toMatchObject({
      srid: 4326,
      geometry_type: "ST_Polygon",
      is_valid: true,
      first_point: "POINT(77.594 12.971)",
      last_point: "POINT(77.594 12.971)",
      npoints: 5,
    });

    const another = await createCircleDraft(app, admin.token, geofence.id as string);
    expect(another.versionNumber).toBe(3);
  });

  it("rejects invalid circle and polygon drafts with structured errors", async () => {
    const admin = await loginAs(app, "ADM");
    const site = await createWorkSite(app, admin.token);
    const geofence = await createGeofence(app, admin.token, site.id as string);

    for (const { payload, code } of [
      {
        payload: {
          shapeType: "circle",
          center: { longitude: 77.5946, latitude: 12.9716 },
          radiusMeters: 0,
        },
        code: "VALIDATION_FAILED",
      },
      {
        payload: {
          shapeType: "circle",
          center: { longitude: 181, latitude: 12.9716 },
          radiusMeters: 100,
        },
        code: "VALIDATION_FAILED",
      },
      {
        payload: {
          shapeType: "circle",
          center: { longitude: 77.5946, latitude: 91 },
          radiusMeters: 100,
        },
        code: "VALIDATION_FAILED",
      },
      {
        payload: {
          shapeType: "polygon",
          vertices: [
            [77, 12],
            [78, 12],
            [77, 12],
          ],
        },
        code: "VALIDATION_FAILED",
      },
      {
        payload: {
          shapeType: "polygon",
          vertices: [
            [181, 12],
            [182, 12],
            [182, 13],
          ],
        },
        code: "VALIDATION_FAILED",
      },
      {
        payload: {
          shapeType: "polygon",
          vertices: [
            [77, 12],
            [78, 13],
            [78, 12],
            [77, 13],
          ],
        },
        code: "BAD_REQUEST",
      },
    ]) {
      const response = await request(
        app,
        admin.token,
        "POST",
        `${baseUrl}/geofences/${geofence.id}/versions`,
        payload,
      );
      expectEnvelope(response, 400, code);
      expect(response.body).not.toContain("PostGIS");
      expect(response.body).not.toContain("SQL");
    }
  });

  it("updates and deletes drafts while published versions remain immutable through HTTP", async () => {
    const admin = await loginAs(app, "ADM");
    const site = await createWorkSite(app, admin.token);
    const geofence = await createGeofence(app, admin.token, site.id as string);
    const draft = await createCircleDraft(app, admin.token, geofence.id as string, {
      radiusMeters: 100,
    });

    const updated = expectOk(
      await request(
        app,
        admin.token,
        "PATCH",
        `${baseUrl}/geofences/${geofence.id}/versions/${draft.id}`,
        {
          shapeType: "circle",
          center: { longitude: 77.6, latitude: 12.98 },
          radiusMeters: 250,
          shapeMetadata: { updated: true },
        },
      ),
    ).version as JsonRecord;
    expect(updated).toMatchObject({
      id: draft.id,
      versionNumber: draft.versionNumber,
      shape: {
        center: { longitude: 77.6, latitude: 12.98 },
        radiusMeters: 250,
      },
    });

    const deleteDraft = await createCircleDraft(app, admin.token, geofence.id as string);
    expectOk(
      await request(
        app,
        admin.token,
        "DELETE",
        `${baseUrl}/geofences/${geofence.id}/versions/${deleteDraft.id}`,
      ),
    );
    const deletedCount = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM attendance.geofence_versions
       WHERE id = $1`,
      [deleteDraft.id],
    );
    expect(Number(deletedCount.rows[0]?.count)).toBe(0);

    const publishResponse = expectOk(
      await request(
        app,
        admin.token,
        "POST",
        `${baseUrl}/geofences/${geofence.id}/versions/${draft.id}/publish`,
        {
          effectiveFrom: "2026-10-01T00:00:00.000Z",
          effectiveUntil: null,
        },
      ),
    );
    expect((publishResponse.version as JsonRecord).version_status).toBe("published");

    expectEnvelope(
      await request(
        app,
        admin.token,
        "PATCH",
        `${baseUrl}/geofences/${geofence.id}/versions/${draft.id}`,
        {
          shapeType: "circle",
          center: { longitude: 77.61, latitude: 12.99 },
          radiusMeters: 300,
        },
      ),
      409,
      "WORKFLOW_CONFLICT",
    );
    expectEnvelope(
      await request(
        app,
        admin.token,
        "DELETE",
        `${baseUrl}/geofences/${geofence.id}/versions/${draft.id}`,
      ),
      409,
      "WORKFLOW_CONFLICT",
    );
  });

  it("preserves publish effective-period validation and overlap enforcement through admin geo workflow", async () => {
    const admin = await loginAs(app, "ADM");
    const site = await createWorkSite(app, admin.token);
    const geofence = await createGeofence(app, admin.token, site.id as string);

    const invalidPeriodDraft = await createCircleDraft(app, admin.token, geofence.id as string);
    expectEnvelope(
      await request(
        app,
        admin.token,
        "POST",
        `${baseUrl}/geofences/${geofence.id}/versions/${invalidPeriodDraft.id}/publish`,
        {
          effectiveFrom: "2026-11-02T00:00:00.000Z",
          effectiveUntil: "2026-11-02T00:00:00.000Z",
        },
      ),
      400,
      "BAD_REQUEST",
    );

    const first = await createCircleDraft(app, admin.token, geofence.id as string);
    expectOk(
      await request(
        app,
        admin.token,
        "POST",
        `${baseUrl}/geofences/${geofence.id}/versions/${first.id}/publish`,
        {
          effectiveFrom: "2026-11-03T00:00:00.000Z",
          effectiveUntil: "2026-11-10T00:00:00.000Z",
        },
      ),
    );

    const overlapping = await createCircleDraft(app, admin.token, geofence.id as string);
    const overlap = await request(
      app,
      admin.token,
      "POST",
      `${baseUrl}/geofences/${geofence.id}/versions/${overlapping.id}/publish`,
      {
        effectiveFrom: "2026-11-09T00:00:00.000Z",
        effectiveUntil: "2026-11-11T00:00:00.000Z",
      },
    );
    const overlapBody = expectEnvelope(overlap, 409, "WORKFLOW_CONFLICT");
    expect(overlapBody.details).toMatchObject({ code: "geofence_published_period_overlap" });
  });

  it("enforces authorization and missing company context with standard envelopes", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const employeeDenied = await request(app, employee.token, "POST", `${baseUrl}/work-sites`, {
      siteCode: uniqueCode("DENIED"),
      name: "Denied",
      siteType: "office",
      timezone: "Asia/Kolkata",
      metadata: {},
    });
    expectEnvelope(employeeDenied, 403, "FORBIDDEN");

    const preferenceIndex = app.store.userSessionPreferences.findIndex(
      (preference) => preference.user_id === admin.user.id,
    );
    expect(preferenceIndex).toBeGreaterThanOrEqual(0);
    const [preference] = app.store.userSessionPreferences.splice(preferenceIndex, 1);
    try {
      const missingContext = await request(app, admin.token, "GET", `${baseUrl}/work-sites`);
      expectEnvelope(missingContext, 400, "COMPANY_CONTEXT_REQUIRED");
    } finally {
      if (preference) app.store.userSessionPreferences.splice(preferenceIndex, 0, preference);
    }
  });
});
