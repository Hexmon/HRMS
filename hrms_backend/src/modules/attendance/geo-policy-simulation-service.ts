import type { PoolClient } from "pg";
import type { AttendanceLocationEvidenceInput, AuthUser, UUID } from "#shared";
import { badRequest, conflict, forbidden, notFound } from "../../platform/errors.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { canManageAllAttendance } from "./policy.js";
import {
  AttendanceCommandTransactionRepository,
  classifyAttendanceGeoSpatialCategory,
  type EffectiveGeofenceEvaluationResult,
} from "./command-repository.js";
import { evaluateAttendanceGeoPolicy, type AttendanceGeoSafeEvaluation } from "./geo-policy.js";
import { buildAttendanceGeoLocationStatus } from "./geo-location-status.js";
import {
  InvalidAttendanceGeoPolicyAction,
  InvalidAttendanceMode,
  normalizeAttendancePolicyConfig,
  type EffectiveAttendancePolicy,
  type NormalizedAttendancePolicyConfig,
} from "./policy-config.js";
import { resolveEffectiveAttendancePolicy } from "./policy-resolver.js";

const zeroUuid = "00000000-0000-0000-0000-000000000000";

type SimulationPolicySource =
  | { mode: "effective_employee" }
  | { mode: "persisted_policy"; policy_id: UUID; version_id?: UUID }
  | { mode: "draft_policy"; config: Record<string, unknown> };

type SimulationGeofenceSource =
  | { mode: "policy_effective" }
  | { mode: "persisted"; geofence_ids: UUID[] }
  | { mode: "draft"; geofences: DraftSimulationGeofence[] };

type DraftSimulationGeofence =
  | {
      id?: UUID;
      geofence_id?: UUID;
      work_site_id?: UUID;
      name?: string;
      work_site_name?: string;
      shape_type: "circle";
      center: { longitude: number; latitude: number };
      radius_meters: number;
    }
  | {
      id?: UUID;
      geofence_id?: UUID;
      work_site_id?: UUID;
      name?: string;
      work_site_name?: string;
      shape_type: "polygon";
      vertices: Array<[number, number]>;
    };

type SimulationScenario =
  | {
      type: "coordinates";
      latitude: number;
      longitude: number;
      accuracy_meters: number;
      evidence_age_ms?: number;
    }
  | { type: "permission_denied"; evidence_age_ms?: number }
  | { type: "location_unavailable"; evidence_age_ms?: number }
  | { type: "missing" };

export interface AttendanceGeoPolicySimulationInput {
  employee_user_id: UUID;
  event_at: string;
  policy_source: SimulationPolicySource;
  geofence_source: SimulationGeofenceSource;
  scenario: SimulationScenario;
}

interface DraftEvaluationRow {
  distance_meters: number | string | null;
  boundary_distance_meters: number | string | null;
  radius_meters: number | string | null;
  grace_meters: number | string;
  effective_radius_meters: number | string | null;
  signed_margin_meters: number | string;
  reported_accuracy_meters: number | string;
}

interface WorkSiteLabelRow {
  id: UUID;
  name: string;
  site_type: string | null;
}

interface PersistedPolicyRow {
  policy_id: UUID;
  policy_key: "attendance";
  policy_label: string;
  policy_status: string;
  version_id: UUID;
  version_number: number;
  effective_from: Date;
  effective_until: Date | null;
  config: Record<string, unknown>;
}

export class AttendanceGeoPolicySimulationService {
  constructor(private readonly store: MemoryDataStore) {}

  async simulate(
    actor: AuthUser,
    input: AttendanceGeoPolicySimulationInput,
  ): Promise<Record<string, unknown>> {
    if (!canManageAllAttendance(actor)) {
      throw forbidden("Only HR or Admin can simulate attendance geo policy.");
    }
    const companyId = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "attendance.geo_policy.simulate",
      requireActiveEmployment: true,
    }).companyId;
    if (!this.store.pgPool) {
      throw conflict("Attendance geo simulation requires PostgreSQL.");
    }

    const client = await this.store.pgPool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.assertEmployeeInCompany(client, companyId, input.employee_user_id);
      const tx = new AttendanceCommandTransactionRepository(client);
      const policy = await this.resolvePolicy(tx, client, companyId, input);
      const simulationPolicy = await this.applyGeofenceSource(
        client,
        companyId,
        policy,
        input.geofence_source,
      );
      const location = this.locationEvidence(input);
      const geofenceSource = input.geofence_source.mode;
      const locationStatus = await buildAttendanceGeoLocationStatus({
        policy: simulationPolicy,
        companyId,
        occurredAt: input.event_at,
        location,
        evidenceAgeMs:
          input.scenario.type === "missing"
            ? null
            : input.scenario.evidence_age_ms ?? 0,
        evaluateGeofence: (geofenceInput) =>
          geofenceSource === "draft"
            ? this.evaluateDraftGeofences(client, input.geofence_source, geofenceInput)
            : tx.evaluateEffectiveGeofence(geofenceInput),
      });
      const decision = evaluateAttendanceGeoPolicy({
        policy: simulationPolicy,
        locationStatus,
      });
      const workSiteLabels = await this.workSiteLabels(client, companyId, [
        decision.geofence?.workSiteId,
      ]);
      await client.query("COMMIT");
      return {
        simulation: {
          verdict: verdictFor(decision),
          allowed: decision.allowed,
          factual_outcome: decision.factualOutcome,
          selected_action: decision.selectedAction,
          fallback_used: decision.fallbackUsed,
          review_required:
            decision.selectedAction === "manual_fallback" && decision.fallbackUsed,
          reason_code: decision.reasonCode,
          reason_detail: decision.reasonDetail,
          policy: presentPolicy(simulationPolicy),
          policy_source: simulationPolicy.source,
          geofence_source: input.geofence_source.mode,
          geofence: decision.geofence,
          work_site: decision.geofence?.workSiteId
            ? workSiteLabels.get(decision.geofence.workSiteId) ?? null
            : null,
          evaluation: decision.evaluation,
          reasons: decision.reasons,
          scenario: presentScenario(input.scenario),
          shift_context: {
            mode: "effective_shift",
            affects_geo_verdict: false,
            note: "Shift provides attendance time context. Current geo policy evaluation does not directly vary by shift.",
          },
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertEmployeeInCompany(
    client: PoolClient,
    companyId: UUID,
    employeeUserId: UUID,
  ): Promise<void> {
    const result = await client.query<{ id: UUID }>(
      `SELECT employee.id
         FROM core.users employee
         JOIN platform.user_session_preferences preference
           ON preference.user_id = employee.id
        WHERE employee.id = $1
          AND employee.deleted_at IS NULL
          AND preference.company_id = $2`,
      [employeeUserId, companyId],
    );
    if (!result.rows[0]) {
      throw forbidden("Simulation employee is not available in the active company.");
    }
  }

  private async resolvePolicy(
    tx: AttendanceCommandTransactionRepository,
    client: PoolClient,
    companyId: UUID,
    input: AttendanceGeoPolicySimulationInput,
  ): Promise<EffectiveAttendancePolicy> {
    if (input.policy_source.mode === "effective_employee") {
      return resolveEffectiveAttendancePolicy(tx, {
        companyId,
        subjectEmployeeUserId: input.employee_user_id,
        asOf: input.event_at,
      });
    }
    if (input.policy_source.mode === "draft_policy") {
      const config = normalizeAndValidateDraftPolicy(input.policy_source.config);
      return {
        schemaVersion: 1,
        resolverVersion: "attendance-policy-resolver-v1",
        source: "assignment",
        asOf: input.event_at,
        policyKey: "attendance",
        policyId: null,
        policyVersionId: null,
        policyVersionNumber: null,
        legacyPolicyVersion: "draft-simulation",
        policyVersion: "draft-simulation",
        assignmentId: null,
        assignmentScopeType: "employee",
        assignmentScopeId: input.employee_user_id,
        scopeRank: 300,
        effectiveFrom: null,
        effectiveUntil: null,
        config,
        ...config,
      };
    }

    const params: unknown[] = [companyId, input.policy_source.policy_id, input.event_at];
    let versionFilter = "";
    if (input.policy_source.version_id) {
      params.push(input.policy_source.version_id);
      versionFilter = "AND version.id = $4";
    }
    const row = (
      await client.query<PersistedPolicyRow>(
        `SELECT policy.id AS policy_id,
                policy.policy_key,
                policy.label AS policy_label,
                policy.status AS policy_status,
                version.id AS version_id,
                version.version_number,
                version.effective_from,
                version.effective_until,
                version.config
           FROM attendance.policies policy
           JOIN attendance.policy_versions version
             ON version.policy_id = policy.id
            AND version.company_id = policy.company_id
          WHERE policy.company_id = $1
            AND policy.id = $2
            AND policy.policy_key = 'attendance'
            AND policy.deleted_at IS NULL
            AND policy.status = 'active'
            ${versionFilter}
            AND (
              $3::timestamptz IS NULL OR
              (version.effective_from <= $3::timestamptz
               AND (version.effective_until IS NULL OR $3::timestamptz < version.effective_until))
            )
          ORDER BY version.effective_from DESC, version.version_number DESC
          LIMIT 1`,
        params,
      )
    ).rows[0];
    if (!row) {
      throw notFound("Persisted attendance policy version was not found.");
    }
    const config = normalizeAttendancePolicyConfig(row.config);
    return {
      schemaVersion: 1,
      resolverVersion: "attendance-policy-resolver-v1",
      source: "assignment",
      asOf: input.event_at,
      policyKey: "attendance",
      policyId: row.policy_id,
      policyVersionId: row.version_id,
      policyVersionNumber: row.version_number,
      legacyPolicyVersion: String(row.version_number),
      policyVersion: String(row.version_number),
      assignmentId: null,
      assignmentScopeType: "employee",
      assignmentScopeId: input.employee_user_id,
      scopeRank: 300,
      effectiveFrom: row.effective_from.toISOString(),
      effectiveUntil: row.effective_until?.toISOString() ?? null,
      config,
      ...config,
    };
  }

  private async applyGeofenceSource(
    client: PoolClient,
    companyId: UUID,
    policy: EffectiveAttendancePolicy,
    source: SimulationGeofenceSource,
  ): Promise<EffectiveAttendancePolicy> {
    if (source.mode === "policy_effective") {
      await this.assertGeofencesInCompany(client, companyId, policy.effectiveGeofenceIds);
      return policy;
    }
    if (source.mode === "persisted") {
      await this.assertGeofencesInCompany(client, companyId, source.geofence_ids);
      return {
        ...policy,
        effectiveGeofenceId: source.geofence_ids[0] ?? null,
        effectiveGeofenceIds: source.geofence_ids,
        config: {
          ...policy.config,
          effectiveGeofenceId: source.geofence_ids[0] ?? null,
          effectiveGeofenceIds: source.geofence_ids,
        },
      };
    }
    await this.assertDraftGeofencesInCompany(client, companyId, source.geofences);
    const geofenceIds = source.geofences.map((geofence, index) =>
      geofence.geofence_id ?? geofence.id ?? draftUuid(index),
    );
    return {
      ...policy,
      effectiveGeofenceId: geofenceIds[0] ?? null,
      effectiveGeofenceIds: geofenceIds,
      config: {
        ...policy.config,
        effectiveGeofenceId: geofenceIds[0] ?? null,
        effectiveGeofenceIds: geofenceIds,
      },
    };
  }

  private async assertGeofencesInCompany(
    client: PoolClient,
    companyId: UUID,
    geofenceIds: UUID[],
  ): Promise<void> {
    if (geofenceIds.length === 0) return;
    const result = await client.query<{ id: UUID }>(
      `SELECT id
         FROM attendance.geofences
        WHERE company_id = $1
          AND id = ANY($2::uuid[])
          AND is_active = true
          AND deleted_at IS NULL`,
      [companyId, geofenceIds],
    );
    if (result.rows.length !== new Set(geofenceIds).size) {
      throw forbidden("Simulation geofence is not available in the active company.");
    }
  }

  private async assertDraftGeofencesInCompany(
    client: PoolClient,
    companyId: UUID,
    geofences: DraftSimulationGeofence[],
  ): Promise<void> {
    if (geofences.length === 0) {
      throw badRequest("Draft geofence simulation requires at least one geofence.");
    }
    const persistedIds = [
      ...new Set(
        geofences.flatMap((geofence) =>
          geofence.geofence_id ? [geofence.geofence_id] : [],
        ),
      ),
    ];
    await this.assertGeofencesInCompany(client, companyId, persistedIds);
    const workSiteIds = [
      ...new Set(
        geofences.flatMap((geofence) =>
          geofence.work_site_id ? [geofence.work_site_id] : [],
        ),
      ),
    ];
    if (workSiteIds.length === 0) return;
    const result = await client.query<{ id: UUID }>(
      `SELECT id
         FROM attendance.work_sites
        WHERE company_id = $1
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL`,
      [companyId, workSiteIds],
    );
    if (result.rows.length !== workSiteIds.length) {
      throw forbidden("Simulation work site is not available in the active company.");
    }
  }

  private locationEvidence(input: AttendanceGeoPolicySimulationInput):
    | AttendanceLocationEvidenceInput
    | undefined {
    const capturedAt = new Date(
      Date.parse(input.event_at) -
        (input.scenario.type === "coordinates"
          ? input.scenario.evidence_age_ms ?? 0
          : "evidence_age_ms" in input.scenario
            ? input.scenario.evidence_age_ms ?? 0
            : 0),
    ).toISOString();
    if (input.scenario.type === "missing") return undefined;
    if (input.scenario.type === "permission_denied") {
      return { permission_state: "denied", captured_at: capturedAt };
    }
    if (input.scenario.type === "location_unavailable") {
      return { permission_state: "unavailable", captured_at: capturedAt };
    }
    return {
      permission_state: "granted",
      latitude: input.scenario.latitude,
      longitude: input.scenario.longitude,
      accuracy_meters: input.scenario.accuracy_meters,
      captured_at: capturedAt,
      age_ms: input.scenario.evidence_age_ms ?? 0,
      provider: "unknown",
    };
  }

  private async evaluateDraftGeofences(
    client: PoolClient,
    source: SimulationGeofenceSource,
    input: {
      companyId: UUID;
      geofenceIds: UUID[];
      asOf: string;
      latitude: number;
      longitude: number;
      reportedAccuracyMeters: number;
      graceMeters: number;
    },
  ): Promise<EffectiveGeofenceEvaluationResult> {
    if (source.mode !== "draft") {
      throw new Error("Draft geofence source is required.");
    }
    const evaluated = [];
    for (const [index, geofence] of source.geofences.entries()) {
      const row = await this.evaluateDraftGeofence(client, geofence, input);
      const signedMarginMeters = finiteNumber(row.signed_margin_meters, "signed_margin_meters");
      const reportedAccuracyMeters = finiteNumber(row.reported_accuracy_meters, "reported_accuracy_meters");
      const category = classifyAttendanceGeoSpatialCategory(
        signedMarginMeters,
        reportedAccuracyMeters,
      );
      const geofenceId = geofence.geofence_id ?? geofence.id ?? draftUuid(index);
      const evaluation: AttendanceGeoSafeEvaluation = {
        category,
        evaluator_version: "attendance-geo-v2",
        candidate_count: source.geofences.length,
        valid_candidate_count: source.geofences.length,
        inside_match_count: 0,
        multiple_inside_matches: false,
        selected_candidate_ordinal: index + 1,
        selected_work_site_id: geofence.work_site_id ?? zeroUuid,
        selected_geofence_id: geofenceId,
        selected_geofence_version_id: draftUuid(index + 1000),
        selected_shape_type: geofence.shape_type,
        selection_reason: "",
        grace_meters: finiteNumber(row.grace_meters, "grace_meters"),
        signed_margin_meters: signedMarginMeters,
        reported_accuracy_meters: reportedAccuracyMeters,
      };
      if (geofence.shape_type === "circle") {
        evaluation.distance_meters = finiteNumber(row.distance_meters, "distance_meters");
        evaluation.radius_meters = finiteNumber(row.radius_meters, "radius_meters");
        evaluation.effective_radius_meters = finiteNumber(row.effective_radius_meters, "effective_radius_meters");
      } else {
        evaluation.boundary_distance_meters = finiteNumber(row.boundary_distance_meters, "boundary_distance_meters");
      }
      evaluated.push({ geofence, geofenceId, index, category, evaluation });
    }
    const insideMatchCount = evaluated.filter((candidate) => candidate.category === "inside_confident").length;
    const selected = evaluated.sort((left, right) => {
      const priority = categoryPriority(left.category) - categoryPriority(right.category);
      if (priority !== 0) return priority;
      const margin = right.evaluation.signed_margin_meters - left.evaluation.signed_margin_meters;
      if (margin !== 0) return margin;
      return left.index - right.index;
    })[0];
    if (!selected) {
      return {
        configured: false,
        evaluation: {
          category: "no_effective_geofence",
          evaluator_version: "attendance-geo-v2",
          candidate_count: 0,
          valid_candidate_count: 0,
        },
      };
    }
    selected.evaluation.inside_match_count = insideMatchCount;
    selected.evaluation.multiple_inside_matches = insideMatchCount > 1;
    selected.evaluation.selection_reason = selectionReason(selected.category);
    return {
      configured: true,
      category: selected.category,
      reference: {
        geofenceId: selected.geofenceId,
        geofenceVersionId: draftUuid(selected.index + 1000),
        workSiteId: selected.geofence.work_site_id ?? zeroUuid,
        versionNumber: 0,
        shapeType: selected.geofence.shape_type,
        effectiveFrom: input.asOf,
        effectiveUntil: null,
        canonicalHash: "draft-simulation",
      },
      evaluation: selected.evaluation,
    };
  }

  private async evaluateDraftGeofence(
    client: PoolClient,
    geofence: DraftSimulationGeofence,
    input: {
      latitude: number;
      longitude: number;
      reportedAccuracyMeters: number;
      graceMeters: number;
    },
  ): Promise<DraftEvaluationRow> {
    if (geofence.shape_type === "circle") {
      if (!Number.isFinite(geofence.radius_meters) || geofence.radius_meters <= 0) {
        throw badRequest("Draft circle radius must be a positive number.");
      }
      const row = (
        await client.query<DraftEvaluationRow>(
          `WITH point AS (
              SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
            ),
            circle AS (
              SELECT ST_SetSRID(ST_MakePoint($3, $4), 4326) AS geom
            )
            SELECT
              ST_Distance(point.geom::geography, circle.geom::geography) AS distance_meters,
              NULL::double precision AS boundary_distance_meters,
              $5::double precision AS radius_meters,
              $7::double precision AS grace_meters,
              $5::double precision + $7::double precision AS effective_radius_meters,
              $5::double precision + $7::double precision -
                ST_Distance(point.geom::geography, circle.geom::geography) AS signed_margin_meters,
              $6::double precision AS reported_accuracy_meters
             FROM point, circle`,
          [
            input.longitude,
            input.latitude,
            geofence.center.longitude,
            geofence.center.latitude,
            geofence.radius_meters,
            input.reportedAccuracyMeters,
            input.graceMeters,
          ],
        )
      ).rows[0];
      if (!row) throw conflict("Draft circle geofence could not be evaluated.");
      return row;
    }

    const ring = closedRing(geofence.vertices);
    const geojson = JSON.stringify({
      type: "Polygon",
      coordinates: [ring],
    });
    const row = (
      await client.query<DraftEvaluationRow & { is_valid: boolean; valid_reason: string | null }>(
        `WITH point AS (
            SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
          ),
          polygon AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($3), 4326) AS geom
          ),
          validation AS (
            SELECT ST_IsValid(geom) AS is_valid,
                   ST_IsValidReason(geom) AS valid_reason,
                   geom
              FROM polygon
          )
          SELECT
            NULL::double precision AS distance_meters,
            CASE WHEN is_valid THEN ST_Distance(point.geom::geography, ST_Boundary(validation.geom)::geography) ELSE NULL END AS boundary_distance_meters,
            NULL::double precision AS radius_meters,
            $5::double precision AS grace_meters,
            NULL::double precision AS effective_radius_meters,
            CASE
              WHEN NOT is_valid THEN NULL
              WHEN ST_Covers(validation.geom, point.geom)
                THEN ST_Distance(point.geom::geography, ST_Boundary(validation.geom)::geography) + $5::double precision
              ELSE $5::double precision -
                ST_Distance(point.geom::geography, ST_Boundary(validation.geom)::geography)
            END AS signed_margin_meters,
            $4::double precision AS reported_accuracy_meters,
            is_valid,
            valid_reason
           FROM point, validation`,
        [
          input.longitude,
          input.latitude,
          geojson,
          input.reportedAccuracyMeters,
          input.graceMeters,
        ],
      )
    ).rows[0];
    if (!row) throw conflict("Draft polygon geofence could not be evaluated.");
    if (!row.is_valid) {
      throw badRequest("Draft polygon geometry is invalid.", {
        reason: row.valid_reason,
      });
    }
    return row;
  }

  private async workSiteLabels(
    client: PoolClient,
    companyId: UUID,
    workSiteIds: Array<UUID | null | undefined>,
  ): Promise<Map<UUID, { name: string; site_type: string | null }>> {
    const ids = [...new Set(workSiteIds.filter((id): id is UUID => Boolean(id) && id !== zeroUuid))];
    if (ids.length === 0) return new Map();
    const result = await client.query<WorkSiteLabelRow>(
      `SELECT id, name, site_type
         FROM attendance.work_sites
        WHERE company_id = $1
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL`,
      [companyId, ids],
    );
    return new Map(result.rows.map((row) => [row.id, { name: row.name, site_type: row.site_type }]));
  }
}

function normalizeAndValidateDraftPolicy(
  config: Record<string, unknown>,
): NormalizedAttendancePolicyConfig {
  const normalized = normalizeAttendancePolicyConfig(config);
  if (normalized.attendanceMode === InvalidAttendanceMode) {
    throw badRequest("Attendance policy mode value is invalid.", {
      field: "attendanceMode",
    });
  }
  for (const field of [
    "locationUnavailableAction",
    "permissionDeniedAction",
    "outsideFenceAction",
    "boundaryUncertainAction",
    "staleEvidenceAction",
    "accuracyExceededAction",
  ] as const) {
    if (normalized[field] === InvalidAttendanceGeoPolicyAction) {
      throw badRequest("Attendance geo policy action is invalid.", { field });
    }
  }
  return normalized;
}

function presentPolicy(policy: EffectiveAttendancePolicy) {
  return {
    policy_id: policy.policyId,
    policy_version_id: policy.policyVersionId,
    policy_version: policy.policyVersion,
    policy_version_number: policy.policyVersionNumber,
    assignment_scope_type: policy.assignmentScopeType,
    assignment_scope_id: policy.assignmentScopeId,
    attendance_mode: policy.attendanceMode,
    fallback_approval_mode: policy.fallbackApprovalMode,
    effective_geofence_ids: policy.effectiveGeofenceIds,
    geofence_grace_meters: policy.geofenceGraceMeters,
    max_location_age_ms: policy.maxLocationAgeMs,
    max_accuracy_meters: policy.maxAccuracyMeters,
  };
}

function presentScenario(scenario: SimulationScenario) {
  if (scenario.type !== "coordinates") {
    return { type: scenario.type };
  }
  return {
    type: scenario.type,
    accuracy_meters: scenario.accuracy_meters,
    evidence_age_ms: scenario.evidence_age_ms ?? 0,
  };
}

function verdictFor(decision: ReturnType<typeof evaluateAttendanceGeoPolicy>): string {
  if (!decision.allowed) return "rejected";
  if (decision.selectedAction === "manual_fallback" && decision.fallbackUsed) {
    return "manual_fallback";
  }
  return "allowed";
}

function finiteNumber(value: number | string | null, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    throw conflict("PostGIS geofence evaluation produced a non-finite metric.", {
      code: "geofence_evaluation_non_finite_metric",
      field,
    });
  }
  return parsed;
}

function categoryPriority(category: "inside_confident" | "boundary_uncertain" | "outside_confident"): number {
  switch (category) {
    case "inside_confident":
      return 1;
    case "boundary_uncertain":
      return 2;
    case "outside_confident":
      return 3;
  }
}

function selectionReason(category: "inside_confident" | "boundary_uncertain" | "outside_confident"): string {
  switch (category) {
    case "inside_confident":
      return "inside_confident_strongest_margin";
    case "boundary_uncertain":
      return "boundary_uncertain_strongest_margin";
    case "outside_confident":
      return "outside_confident_nearest";
  }
}

function closedRing(vertices: Array<[number, number]>): Array<[number, number]> {
  if (vertices.length < 3) {
    throw badRequest("Draft polygon requires at least three vertices.");
  }
  const unique = new Set(vertices.map(([longitude, latitude]) => `${longitude.toFixed(7)},${latitude.toFixed(7)}`));
  if (unique.size < 3) {
    throw badRequest("Draft polygon requires at least three distinct vertices.");
  }
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) {
    return vertices;
  }
  return [...vertices, first];
}

function draftUuid(index: number): UUID {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}
