import type { Pool, PoolClient } from "pg";
import type { UUID } from "#shared";
import { badRequest, conflict, notFound } from "../../platform/errors.js";

type JsonObject = Record<string, unknown>;
type GeoShapeType = "circle" | "polygon";
type GeoVersionStatus = "draft" | "published";

type PostgresError = {
  code?: string;
  constraint?: string;
  message?: string;
};

type WorkSiteRow = {
  id: UUID;
  site_code: string;
  name: string;
  site_type: string;
  timezone: string;
  is_active: boolean;
  metadata: JsonObject;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  version: number;
};

type GeofenceRow = {
  id: UUID;
  work_site_id: UUID;
  geofence_code: string;
  name: string;
  is_active: boolean;
  current_published_version_id: UUID | null;
  metadata: JsonObject;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  version: number;
};

type VersionRow = {
  id: UUID;
  geofence_id: UUID;
  version_number: number;
  version_status: GeoVersionStatus;
  shape_type: GeoShapeType;
  circle_radius_meters: string | null;
  shape_metadata: JsonObject;
  effective_from: Date | null;
  effective_until: Date | null;
  canonical_hash: string | null;
  published_at: Date | null;
  published_by_user_id: UUID | null;
  created_at: Date;
  created_by_user_id: UUID | null;
  geometry_type: string | null;
  shape_geojson: GeoJsonGeometry;
};

type PolygonValidationRow = {
  geometry_type: string | null;
  srid: number | null;
  coord_dim: number | null;
  is_empty: boolean | null;
  is_valid: boolean | null;
  valid_reason: string | null;
  npoints: number | null;
  area_square_meters: number | null;
};

type GeoJsonGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: string; coordinates?: unknown };

export type AdminGeoWorkSiteInput = {
  siteCode: string;
  name: string;
  siteType: string;
  timezone: string;
  isActive?: boolean;
  metadata?: JsonObject;
};

export type AdminGeoWorkSiteUpdateInput = Partial<AdminGeoWorkSiteInput> & {
  expectedVersion: number;
};

export type AdminGeoGeofenceInput = {
  geofenceCode: string;
  name: string;
  isActive?: boolean;
  metadata?: JsonObject;
};

export type AdminGeoGeofenceUpdateInput = Partial<AdminGeoGeofenceInput> & {
  expectedVersion: number;
};

export type AdminGeoVersionInput =
  | {
      shapeType: "circle";
      center: { longitude: number; latitude: number };
      radiusMeters: number;
      shapeMetadata?: JsonObject;
    }
  | {
      shapeType: "polygon";
      vertices: Array<[number, number]>;
      shapeMetadata?: JsonObject;
    };

export type AdminGeoWorkSiteDto = ReturnType<typeof presentWorkSite>;
export type AdminGeoGeofenceDto = ReturnType<typeof presentGeofence>;
export type AdminGeoVersionDto = ReturnType<typeof presentVersion>;

export class PostgresAdminGeoRepository {
  constructor(private readonly pool: Pool) {}

  async listWorkSites(companyId: UUID): Promise<AdminGeoWorkSiteDto[]> {
    const result = await this.pool.query<WorkSiteRow>(
      `${workSiteSelect}
       WHERE company_id = $1 AND deleted_at IS NULL
       ORDER BY is_active DESC, lower(name), site_code`,
      [companyId],
    );
    return result.rows.map(presentWorkSite);
  }

  async getWorkSite(companyId: UUID, workSiteId: UUID): Promise<AdminGeoWorkSiteDto> {
    const site = await findWorkSite(this.pool, companyId, workSiteId);
    if (!site) throw notFound("Work site not found", { workSiteId });
    return presentWorkSite(site);
  }

  async createWorkSite(input: {
    companyId: UUID;
    actorUserId: UUID;
    values: AdminGeoWorkSiteInput;
  }): Promise<AdminGeoWorkSiteDto> {
    try {
      const result = await this.pool.query<WorkSiteRow>(
        `WITH work_site AS (
           INSERT INTO attendance.work_sites (
             company_id, site_code, name, site_type, timezone, is_active,
             metadata, created_by_user_id, updated_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
           RETURNING *
         )
         ${workSiteProjection}
         FROM work_site`,
        [
          input.companyId,
          input.values.siteCode,
          input.values.name,
          input.values.siteType,
          input.values.timezone,
          input.values.isActive ?? true,
          JSON.stringify(input.values.metadata ?? {}),
          input.actorUserId,
        ],
      );
      return presentWorkSite(result.rows[0]!);
    } catch (error) {
      throw mapAdminGeoPostgresError(error);
    }
  }

  async updateWorkSite(input: {
    companyId: UUID;
    actorUserId: UUID;
    workSiteId: UUID;
    values: AdminGeoWorkSiteUpdateInput;
  }): Promise<AdminGeoWorkSiteDto> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await findWorkSite(client, input.companyId, input.workSiteId, true);
      if (!current) throw notFound("Work site not found", { workSiteId: input.workSiteId });
      assertExpectedVersion("Work site", current.version, input.values.expectedVersion, {
        workSiteId: input.workSiteId,
      });
      const next = {
        siteCode: input.values.siteCode ?? current.site_code,
        name: input.values.name ?? current.name,
        siteType: input.values.siteType ?? current.site_type,
        timezone: input.values.timezone ?? current.timezone,
        isActive: input.values.isActive ?? current.is_active,
        metadata: input.values.metadata ?? current.metadata,
      };
      const result = await client.query<WorkSiteRow>(
        `WITH work_site AS (
           UPDATE attendance.work_sites
           SET site_code = $3,
               name = $4,
               site_type = $5,
               timezone = $6,
               is_active = $7,
               metadata = $8::jsonb,
               updated_by_user_id = $9,
               updated_at = transaction_timestamp(),
               version = version + 1
           WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
           RETURNING *
         )
         ${workSiteProjection}
         FROM work_site`,
        [
          input.workSiteId,
          input.companyId,
          next.siteCode,
          next.name,
          next.siteType,
          next.timezone,
          next.isActive,
          JSON.stringify(next.metadata),
          input.actorUserId,
        ],
      );
      await client.query("COMMIT");
      return presentWorkSite(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }

  async deleteWorkSite(input: {
    companyId: UUID;
    actorUserId: UUID;
    workSiteId: UUID;
    expectedVersion: number;
  }): Promise<AdminGeoWorkSiteDto> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await findWorkSite(client, input.companyId, input.workSiteId, true);
      if (!current) throw notFound("Work site not found", { workSiteId: input.workSiteId });
      assertExpectedVersion("Work site", current.version, input.expectedVersion, {
        workSiteId: input.workSiteId,
      });
      const result = await client.query<WorkSiteRow>(
        `WITH work_site AS (
           UPDATE attendance.work_sites
           SET is_active = false,
               deleted_at = COALESCE(deleted_at, transaction_timestamp()),
               updated_by_user_id = $3,
               updated_at = transaction_timestamp(),
               version = version + 1
           WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
           RETURNING *
         )
         ${workSiteProjection}
         FROM work_site`,
        [input.workSiteId, input.companyId, input.actorUserId],
      );
      await client.query("COMMIT");
      return presentWorkSite(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }

  async listGeofences(companyId: UUID, workSiteId: UUID): Promise<AdminGeoGeofenceDto[]> {
    await requireWorkSite(this.pool, companyId, workSiteId);
    const result = await this.pool.query<GeofenceRow>(
      `${geofenceSelect}
       WHERE company_id = $1
         AND work_site_id = $2
         AND deleted_at IS NULL
       ORDER BY is_active DESC, lower(name), geofence_code`,
      [companyId, workSiteId],
    );
    return result.rows.map(presentGeofence);
  }

  async getGeofence(companyId: UUID, geofenceId: UUID): Promise<AdminGeoGeofenceDto> {
    const geofence = await findGeofence(this.pool, companyId, geofenceId);
    if (!geofence) throw notFound("Geofence not found", { geofenceId });
    return presentGeofence(geofence);
  }

  async createGeofence(input: {
    companyId: UUID;
    actorUserId: UUID;
    workSiteId: UUID;
    values: AdminGeoGeofenceInput;
  }): Promise<AdminGeoGeofenceDto> {
    try {
      await requireWorkSite(this.pool, input.companyId, input.workSiteId);
      const result = await this.pool.query<GeofenceRow>(
        `WITH geofence AS (
           INSERT INTO attendance.geofences (
             company_id, work_site_id, geofence_code, name, is_active,
             metadata, created_by_user_id, updated_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)
           RETURNING *
         )
         ${geofenceProjection}
         FROM geofence`,
        [
          input.companyId,
          input.workSiteId,
          input.values.geofenceCode,
          input.values.name,
          input.values.isActive ?? true,
          JSON.stringify(input.values.metadata ?? {}),
          input.actorUserId,
        ],
      );
      return presentGeofence(result.rows[0]!);
    } catch (error) {
      throw mapAdminGeoPostgresError(error);
    }
  }

  async updateGeofence(input: {
    companyId: UUID;
    actorUserId: UUID;
    geofenceId: UUID;
    values: AdminGeoGeofenceUpdateInput;
  }): Promise<AdminGeoGeofenceDto> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await findGeofence(client, input.companyId, input.geofenceId, true);
      if (!current) throw notFound("Geofence not found", { geofenceId: input.geofenceId });
      assertExpectedVersion("Geofence", current.version, input.values.expectedVersion, {
        geofenceId: input.geofenceId,
      });
      const next = {
        geofenceCode: input.values.geofenceCode ?? current.geofence_code,
        name: input.values.name ?? current.name,
        isActive: input.values.isActive ?? current.is_active,
        metadata: input.values.metadata ?? current.metadata,
      };
      const result = await client.query<GeofenceRow>(
        `WITH geofence AS (
           UPDATE attendance.geofences
           SET geofence_code = $3,
               name = $4,
               is_active = $5,
               metadata = $6::jsonb,
               updated_by_user_id = $7,
               updated_at = transaction_timestamp(),
               version = version + 1
           WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
           RETURNING *
         )
         ${geofenceProjection}
         FROM geofence`,
        [
          input.geofenceId,
          input.companyId,
          next.geofenceCode,
          next.name,
          next.isActive,
          JSON.stringify(next.metadata),
          input.actorUserId,
        ],
      );
      await client.query("COMMIT");
      return presentGeofence(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }

  async deleteGeofence(input: {
    companyId: UUID;
    actorUserId: UUID;
    geofenceId: UUID;
    expectedVersion: number;
  }): Promise<AdminGeoGeofenceDto> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await findGeofence(client, input.companyId, input.geofenceId, true);
      if (!current) throw notFound("Geofence not found", { geofenceId: input.geofenceId });
      assertExpectedVersion("Geofence", current.version, input.expectedVersion, {
        geofenceId: input.geofenceId,
      });
      const result = await client.query<GeofenceRow>(
        `WITH geofence AS (
           UPDATE attendance.geofences
           SET is_active = false,
               deleted_at = COALESCE(deleted_at, transaction_timestamp()),
               updated_by_user_id = $3,
               updated_at = transaction_timestamp(),
               version = version + 1
           WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
           RETURNING *
         )
         ${geofenceProjection}
         FROM geofence`,
        [input.geofenceId, input.companyId, input.actorUserId],
      );
      await client.query("COMMIT");
      return presentGeofence(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }

  async listVersions(companyId: UUID, geofenceId: UUID): Promise<AdminGeoVersionDto[]> {
    await requireGeofence(this.pool, companyId, geofenceId);
    const result = await this.pool.query<VersionRow>(
      `${versionSelect}
       WHERE company_id = $1 AND geofence_id = $2
       ORDER BY version_number DESC`,
      [companyId, geofenceId],
    );
    return result.rows.map(presentVersion);
  }

  async getVersion(
    companyId: UUID,
    geofenceId: UUID,
    versionId: UUID,
  ): Promise<AdminGeoVersionDto> {
    const version = await findVersion(this.pool, companyId, geofenceId, versionId);
    if (!version) throw notFound("Geofence version not found", { geofenceId, versionId });
    return presentVersion(version);
  }

  async createVersion(input: {
    companyId: UUID;
    actorUserId: UUID;
    geofenceId: UUID;
    values: AdminGeoVersionInput;
  }): Promise<AdminGeoVersionDto> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireGeofence(client, input.companyId, input.geofenceId, true);
      const numberResult = await client.query<{ next_version_number: number }>(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
         FROM attendance.geofence_versions
         WHERE company_id = $1 AND geofence_id = $2`,
        [input.companyId, input.geofenceId],
      );
      const versionNumber = numberResult.rows[0]!.next_version_number;
      const inserted = await insertVersion(client, {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        geofenceId: input.geofenceId,
        versionNumber,
        values: input.values,
      });
      await client.query("COMMIT");
      return presentVersion(inserted);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }

  async updateVersion(input: {
    companyId: UUID;
    geofenceId: UUID;
    versionId: UUID;
    values: AdminGeoVersionInput;
  }): Promise<AdminGeoVersionDto> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await findVersion(client, input.companyId, input.geofenceId, input.versionId, true);
      if (!current) {
        throw notFound("Geofence version not found", {
          geofenceId: input.geofenceId,
          versionId: input.versionId,
        });
      }
      assertDraftVersion(current);
      if (input.values.shapeType === "polygon") {
        await validatePolygonGeoJson(client, polygonGeoJson(input.values.vertices));
      }
      const result = input.values.shapeType === "circle"
        ? await client.query<VersionRow>(
            `WITH version AS (
               UPDATE attendance.geofence_versions
               SET shape_type = 'circle',
                   shape = ST_SetSRID(ST_MakePoint($4, $5), 4326),
                   circle_radius_meters = $6,
                   shape_metadata = $7::jsonb
               WHERE id = $1
                 AND company_id = $2
                 AND geofence_id = $3
                 AND version_status = 'draft'
               RETURNING *
             )
             ${versionProjection}
             FROM version`,
            [
              input.versionId,
              input.companyId,
              input.geofenceId,
              input.values.center.longitude,
              input.values.center.latitude,
              input.values.radiusMeters,
              JSON.stringify(input.values.shapeMetadata ?? {}),
            ],
          )
        : await client.query<VersionRow>(
            `WITH version AS (
               UPDATE attendance.geofence_versions
               SET shape_type = 'polygon',
                   shape = ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
                   circle_radius_meters = NULL,
                   shape_metadata = $5::jsonb
               WHERE id = $1
                 AND company_id = $2
                 AND geofence_id = $3
                 AND version_status = 'draft'
               RETURNING *
             )
             ${versionProjection}
             FROM version`,
            [
              input.versionId,
              input.companyId,
              input.geofenceId,
              JSON.stringify(polygonGeoJson(input.values.vertices)),
              JSON.stringify(input.values.shapeMetadata ?? {}),
            ],
          );
      await client.query("COMMIT");
      return presentVersion(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }

  async deleteVersion(input: {
    companyId: UUID;
    geofenceId: UUID;
    versionId: UUID;
  }): Promise<{ deleted: true; versionId: UUID }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await findVersion(client, input.companyId, input.geofenceId, input.versionId, true);
      if (!current) {
        throw notFound("Geofence version not found", {
          geofenceId: input.geofenceId,
          versionId: input.versionId,
        });
      }
      assertDraftVersion(current);
      await client.query(
        `DELETE FROM attendance.geofence_versions
         WHERE id = $1 AND company_id = $2 AND geofence_id = $3`,
        [input.versionId, input.companyId, input.geofenceId],
      );
      await client.query("COMMIT");
      return { deleted: true, versionId: input.versionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw mapAdminGeoPostgresError(error);
    } finally {
      client.release();
    }
  }
}

async function insertVersion(
  client: PoolClient,
  input: {
    companyId: UUID;
    actorUserId: UUID;
    geofenceId: UUID;
    versionNumber: number;
    values: AdminGeoVersionInput;
  },
): Promise<VersionRow> {
  if (input.values.shapeType === "polygon") {
    await validatePolygonGeoJson(client, polygonGeoJson(input.values.vertices));
  }
  const result = input.values.shapeType === "circle"
    ? await client.query<VersionRow>(
        `WITH version AS (
           INSERT INTO attendance.geofence_versions (
             company_id, geofence_id, version_number, shape_type, shape,
             circle_radius_meters, shape_metadata, created_by_user_id
           ) VALUES (
             $1, $2, $3, 'circle',
             ST_SetSRID(ST_MakePoint($4, $5), 4326),
             $6, $7::jsonb, $8
           )
           RETURNING *
         )
         ${versionProjection}
         FROM version`,
        [
          input.companyId,
          input.geofenceId,
          input.versionNumber,
          input.values.center.longitude,
          input.values.center.latitude,
          input.values.radiusMeters,
          JSON.stringify(input.values.shapeMetadata ?? {}),
          input.actorUserId,
        ],
      )
    : await client.query<VersionRow>(
        `WITH version AS (
           INSERT INTO attendance.geofence_versions (
             company_id, geofence_id, version_number, shape_type, shape,
             shape_metadata, created_by_user_id
           ) VALUES (
             $1, $2, $3, 'polygon',
             ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
             $5::jsonb, $6
           )
           RETURNING *
         )
         ${versionProjection}
         FROM version`,
        [
          input.companyId,
          input.geofenceId,
          input.versionNumber,
          JSON.stringify(polygonGeoJson(input.values.vertices)),
          JSON.stringify(input.values.shapeMetadata ?? {}),
          input.actorUserId,
        ],
      );
  return result.rows[0]!;
}

async function validatePolygonGeoJson(client: PoolClient, geoJson: GeoJsonGeometry): Promise<void> {
  const result = await client.query<PolygonValidationRow>(
    `WITH input AS (
       SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS shape
     )
     SELECT ST_GeometryType(shape) AS geometry_type,
       ST_SRID(shape) AS srid,
       ST_CoordDim(shape) AS coord_dim,
       ST_IsEmpty(shape) AS is_empty,
       ST_IsValid(shape) AS is_valid,
       ST_IsValidReason(shape) AS valid_reason,
       ST_NPoints(shape) AS npoints,
       CASE WHEN ST_IsValid(shape) THEN ST_Area(shape::geography) ELSE NULL END AS area_square_meters
     FROM input`,
    [JSON.stringify(geoJson)],
  );
  const row = result.rows[0]!;
  const diagnostics = {
    geometryType: row.geometry_type,
    srid: row.srid,
    coordDim: row.coord_dim,
    isEmpty: row.is_empty,
    isValid: row.is_valid,
    validReason: row.valid_reason,
    npoints: row.npoints,
    areaSquareMeters: row.area_square_meters,
  };
  if (row.geometry_type !== "ST_Polygon") {
    throw badRequest("Polygon geofences must be stored as a polygon.", {
      field: "vertices",
      geometry: diagnostics,
    });
  }
  if (row.is_empty || row.srid !== 4326 || row.coord_dim !== 2 || !row.is_valid) {
    throw badRequest("Invalid polygon geofence.", {
      field: "vertices",
      geometry: diagnostics,
    });
  }
  if (Number(row.area_square_meters ?? 0) <= 0) {
    throw badRequest("Polygon geofence area must be greater than zero.", {
      field: "vertices",
      geometry: diagnostics,
    });
  }
}

async function requireWorkSite(
  client: Pool | PoolClient,
  companyId: UUID,
  workSiteId: UUID,
  lock = false,
): Promise<WorkSiteRow> {
  const site = await findWorkSite(client, companyId, workSiteId, lock);
  if (!site) throw notFound("Work site not found", { workSiteId });
  return site;
}

async function requireGeofence(
  client: Pool | PoolClient,
  companyId: UUID,
  geofenceId: UUID,
  lock = false,
): Promise<GeofenceRow> {
  const geofence = await findGeofence(client, companyId, geofenceId, lock);
  if (!geofence) throw notFound("Geofence not found", { geofenceId });
  return geofence;
}

async function findWorkSite(
  client: Pool | PoolClient,
  companyId: UUID,
  workSiteId: UUID,
  lock = false,
): Promise<WorkSiteRow | null> {
  const result = await client.query<WorkSiteRow>(
    `${workSiteSelect}
     WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
     ${lock ? "FOR UPDATE" : ""}`,
    [workSiteId, companyId],
  );
  return result.rows[0] ?? null;
}

async function findGeofence(
  client: Pool | PoolClient,
  companyId: UUID,
  geofenceId: UUID,
  lock = false,
): Promise<GeofenceRow | null> {
  const result = await client.query<GeofenceRow>(
    `${geofenceSelect}
     WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
     ${lock ? "FOR UPDATE" : ""}`,
    [geofenceId, companyId],
  );
  return result.rows[0] ?? null;
}

async function findVersion(
  client: Pool | PoolClient,
  companyId: UUID,
  geofenceId: UUID,
  versionId: UUID,
  lock = false,
): Promise<VersionRow | null> {
  const result = await client.query<VersionRow>(
    `${versionSelect}
     WHERE id = $1 AND company_id = $2 AND geofence_id = $3
     ${lock ? "FOR UPDATE" : ""}`,
    [versionId, companyId, geofenceId],
  );
  return result.rows[0] ?? null;
}

function assertExpectedVersion(
  aggregate: string,
  currentVersion: number,
  expectedVersion: number,
  details: JsonObject,
): void {
  if (currentVersion !== expectedVersion) {
    throw conflict(`${aggregate} was modified by another actor.`, {
      ...details,
      currentVersion,
      expectedVersion,
    });
  }
}

function assertDraftVersion(version: VersionRow): void {
  if (version.version_status !== "draft") {
    throw conflict("Published geofence versions are immutable.", {
      versionId: version.id,
      geofenceId: version.geofence_id,
      status: version.version_status,
    });
  }
}

function polygonGeoJson(vertices: Array<[number, number]>): GeoJsonGeometry {
  const closed = [...vertices];
  const first = closed[0]!;
  const last = closed.at(-1)!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    closed.push([first[0], first[1]]);
  }
  return {
    type: "Polygon",
    coordinates: [closed],
  };
}

function presentWorkSite(row: WorkSiteRow) {
  return {
    id: row.id,
    siteCode: row.site_code,
    name: row.name,
    siteType: row.site_type,
    timezone: row.timezone,
    isActive: row.is_active,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
    version: row.version,
  };
}

function presentGeofence(row: GeofenceRow) {
  return {
    id: row.id,
    workSiteId: row.work_site_id,
    geofenceCode: row.geofence_code,
    name: row.name,
    isActive: row.is_active,
    currentPublishedVersionId: row.current_published_version_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
    version: row.version,
  };
}

function presentVersion(row: VersionRow) {
  return {
    id: row.id,
    geofenceId: row.geofence_id,
    versionNumber: row.version_number,
    versionStatus: row.version_status,
    shapeType: row.shape_type,
    shape: presentShape(row),
    shapeMetadata: row.shape_metadata ?? {},
    effectiveFrom: row.effective_from?.toISOString() ?? null,
    effectiveUntil: row.effective_until?.toISOString() ?? null,
    canonicalHash: row.canonical_hash,
    publishedAt: row.published_at?.toISOString() ?? null,
    publishedByUserId: row.published_by_user_id,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
  };
}

function presentShape(row: VersionRow) {
  if (row.shape_type === "circle") {
    const coordinates = isPointGeoJson(row.shape_geojson)
      ? row.shape_geojson.coordinates
      : ([Number.NaN, Number.NaN] as [number, number]);
    return {
      center: {
        longitude: coordinates[0],
        latitude: coordinates[1],
      },
      radiusMeters: row.circle_radius_meters === null
        ? null
        : Number(row.circle_radius_meters),
    };
  }
  return {
    vertices: openPolygonVertices(row.shape_geojson),
    geometryType: row.geometry_type,
  };
}

function openPolygonVertices(geometry: GeoJsonGeometry): Array<[number, number]> {
  const ring = polygonRing(geometry);
  if (!ring) return [];
  const vertices = ring
    .filter(isLngLatCoordinate)
    .map(([longitude, latitude]) => [longitude, latitude] as [number, number]);
  const first = vertices[0];
  const last = vertices.at(-1);
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return vertices.slice(0, -1);
  }
  return vertices;
}

function isPointGeoJson(geometry: GeoJsonGeometry): geometry is {
  type: "Point";
  coordinates: [number, number];
} {
  return geometry.type === "Point" && isLngLatCoordinate(geometry.coordinates);
}

function polygonRing(geometry: GeoJsonGeometry): unknown[] | undefined {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const [ring] = geometry.coordinates;
    return Array.isArray(ring) ? ring : undefined;
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    const [polygon] = geometry.coordinates;
    if (!Array.isArray(polygon)) return undefined;
    const [ring] = polygon;
    return Array.isArray(ring) ? ring : undefined;
  }
  return undefined;
}

function isLngLatCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function mapAdminGeoPostgresError(error: unknown): never {
  if (!isPostgresError(error)) throw error;
  if (error.code === "23505") {
    if (error.constraint === "attendance_work_sites_company_code_uq") {
      throw conflict("Work site code already exists.", {
        field: "siteCode",
        constraint: error.constraint,
      });
    }
    if (error.constraint === "attendance_geofences_site_code_uq") {
      throw conflict("Geofence code already exists for this work site.", {
        field: "geofenceCode",
        constraint: error.constraint,
      });
    }
    if (error.constraint === "attendance_geofence_versions_company_geofence_number_uq") {
      throw conflict("A geofence version with this number already exists.", {
        constraint: error.constraint,
      });
    }
  }
  if (error.code === "23514") {
    if (error.constraint === "attendance_work_sites_timezone_valid") {
      throw badRequest("Work site timezone must be a valid timezone name.", {
        field: "timezone",
        constraint: error.constraint,
      });
    }
    if (error.constraint === "attendance_work_sites_metadata_object_check") {
      throw badRequest("Work site metadata must be a JSON object.", {
        field: "metadata",
        constraint: error.constraint,
      });
    }
    if (error.constraint === "attendance_geofences_metadata_object_check") {
      throw badRequest("Geofence metadata must be a JSON object.", {
        field: "metadata",
        constraint: error.constraint,
      });
    }
    if (error.constraint === "attendance_geofence_versions_spatial_shape_check") {
      throw badRequest("Geofence shape is invalid.", {
        field: "shape",
        constraint: error.constraint,
      });
    }
    if (error.constraint?.includes("published_immutable")) {
      throw conflict("Published geofence versions are immutable.", {
        constraint: error.constraint,
      });
    }
  }
  throw error;
}

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === "object" && error !== null && "code" in error;
}

const workSiteProjection = `
  SELECT id, site_code, name, site_type, timezone, is_active, metadata,
    created_at, updated_at, deleted_at, version`;

const workSiteSelect = `
  ${workSiteProjection}
  FROM attendance.work_sites work_site`;

const geofenceProjection = `
  SELECT id, work_site_id, geofence_code, name, is_active,
    current_published_version_id, metadata, created_at, updated_at,
    deleted_at, version`;

const geofenceSelect = `
  ${geofenceProjection}
  FROM attendance.geofences geofence`;

const versionProjection = `
  SELECT id, geofence_id, version_number, version_status, shape_type,
    circle_radius_meters::text, shape_metadata, effective_from,
    effective_until, canonical_hash, published_at, published_by_user_id,
    created_at, created_by_user_id, ST_GeometryType(shape) AS geometry_type,
    ST_AsGeoJSON(shape)::json AS shape_geojson`;

const versionSelect = `
  ${versionProjection}
  FROM attendance.geofence_versions version`;
