import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("attendance geo policy simulation", () => {
  let app: TestApp;

  beforeEach(async () => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    app = await buildRealApp();
    await app.ready();
    await clearFixtures(app);
  }, 30_000);

  afterEach(async () => {
    try {
      await clearFixtures(app);
    } finally {
      await app?.close();
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  }, 30_000);

  it("simulates geo scenarios with no attendance or configuration side effects", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = companyFor(app, employee.user.id);
    const geofenceId = await createCircleGeofence(app, companyId, 100);
    const policyId = await createPolicy(app, {
      companyId,
      employeeUserId: employee.user.id,
      config: {
        attendanceMode: "geo_required",
        fallbackApprovalMode: "approval_required",
        outsideFenceAction: "deny",
        boundaryUncertainAction: "deny",
        staleEvidenceAction: "deny",
        accuracyExceededAction: "deny",
        effectiveGeofenceIds: [geofenceId],
        maxLocationAgeMs: 60_000,
        maxAccuracyMeters: 100,
      },
    });
    const before = await sideEffectCounts(app);

    const scenarios = [
      {
        name: "inside",
        scenario: coordinateScenario(12.972, 77.595, 10),
        expectedOutcome: "inside_confident",
        expectedVerdict: "allowed",
      },
      {
        name: "outside",
        scenario: coordinateScenario(12.972, 77.598, 10),
        expectedOutcome: "outside_confident",
        expectedVerdict: "rejected",
      },
      {
        name: "boundary",
        scenario: coordinateScenario(12.972, 77.59592, 50),
        expectedOutcome: "boundary_uncertain",
        expectedVerdict: "rejected",
      },
      {
        name: "low accuracy",
        scenario: coordinateScenario(12.972, 77.595, 150),
        expectedOutcome: "accuracy_exceeded",
        expectedVerdict: "rejected",
      },
      {
        name: "stale",
        scenario: coordinateScenario(12.972, 77.595, 10, 120_000),
        expectedOutcome: "stale_evidence",
        expectedVerdict: "rejected",
      },
      {
        name: "permission denied",
        scenario: { type: "permission_denied" },
        expectedOutcome: "permission_denied",
        expectedVerdict: "rejected",
      },
      {
        name: "location unavailable",
        scenario: { type: "location_unavailable" },
        expectedOutcome: "location_unavailable",
        expectedVerdict: "rejected",
      },
      {
        name: "missing",
        scenario: { type: "missing" },
        expectedOutcome: "missing",
        expectedVerdict: "rejected",
      },
    ];

    for (const scenario of scenarios) {
      const response = await simulate(app, admin.token, {
        employee_user_id: employee.user.id,
        policy_source: { mode: "effective_employee" },
        geofence_source: { mode: "policy_effective" },
        scenario: scenario.scenario,
      });
      expect(response.statusCode, scenario.name).toBe(200);
      expect(response.json().simulation).toMatchObject({
        verdict: scenario.expectedVerdict,
        factual_outcome: scenario.expectedOutcome,
      });
      expect(response.json().simulation.reason_code).toMatch(/^geo_/u);
    }

    const persistedPolicy = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: { mode: "persisted_policy", policy_id: policyId },
      geofence_source: { mode: "persisted", geofence_ids: [geofenceId] },
      scenario: coordinateScenario(12.972, 77.595, 10),
    });
    expect(persistedPolicy.statusCode).toBe(200);
    expect(persistedPolicy.json().simulation.policy.policy_id).toBe(policyId);

    const draftPolicy = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "manual_only",
          effectiveGeofenceIds: [geofenceId],
        },
      },
      geofence_source: { mode: "policy_effective" },
      scenario: { type: "missing" },
    });
    expect(draftPolicy.statusCode).toBe(200);
    expect(draftPolicy.json().simulation).toMatchObject({
      verdict: "allowed",
      factual_outcome: "not_required",
      reason_code: "geo_not_required",
    });

    const manualFallback = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "geo_required",
          fallbackApprovalMode: "approval_required",
          outsideFenceAction: "manual_fallback",
          effectiveGeofenceIds: [geofenceId],
        },
      },
      geofence_source: { mode: "policy_effective" },
      scenario: coordinateScenario(12.972, 77.598, 10),
    });
    expect(manualFallback.statusCode).toBe(200);
    expect(manualFallback.json().simulation).toMatchObject({
      verdict: "manual_fallback",
      factual_outcome: "outside_confident",
      selected_action: "manual_fallback",
      review_required: true,
    });

    const after = await sideEffectCounts(app);
    expect(after).toEqual(before);
  }, 30_000);

  it("supports draft circle, draft polygon, and multiple candidate semantics", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = companyFor(app, employee.user.id);
    const siteId = await createWorkSite(app, companyId);

    const draftCircle = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "geo_required",
          outsideFenceAction: "deny",
        },
      },
      geofence_source: {
        mode: "draft",
        geofences: [
          {
            work_site_id: siteId,
            shape_type: "circle",
            center: { latitude: 12.972, longitude: 77.595 },
            radius_meters: 100,
          },
        ],
      },
      scenario: coordinateScenario(12.972, 77.595, 10),
    });
    expect(draftCircle.statusCode).toBe(200);
    expect(draftCircle.json().simulation).toMatchObject({
      factual_outcome: "inside_confident",
      geofence_source: "draft",
    });

    const draftPolygon = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "geo_required",
          outsideFenceAction: "deny",
        },
      },
      geofence_source: {
        mode: "draft",
        geofences: [
          {
            work_site_id: siteId,
            shape_type: "polygon",
            vertices: [
              [77.594, 12.971],
              [77.596, 12.971],
              [77.596, 12.973],
              [77.594, 12.973],
            ],
          },
        ],
      },
      scenario: coordinateScenario(12.972, 77.595, 10),
    });
    expect(draftPolygon.statusCode).toBe(200);
    expect(draftPolygon.json().simulation.factual_outcome).toBe("inside_confident");

    const multiple = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "geo_required",
          outsideFenceAction: "deny",
        },
      },
      geofence_source: {
        mode: "draft",
        geofences: [
          {
            work_site_id: siteId,
            shape_type: "circle",
            center: { latitude: 12.972, longitude: 77.598 },
            radius_meters: 40,
          },
          {
            work_site_id: siteId,
            shape_type: "circle",
            center: { latitude: 12.972, longitude: 77.595 },
            radius_meters: 100,
          },
        ],
      },
      scenario: coordinateScenario(12.972, 77.595, 10),
    });
    expect(multiple.statusCode).toBe(200);
    expect(multiple.json().simulation.evaluation.selected_candidate_ordinal).toBe(2);
    expect(multiple.json().simulation.evaluation.inside_match_count).toBe(1);
  }, 30_000);

  it("rejects unauthorized and cross-tenant simulation inputs", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = companyFor(app, employee.user.id);
    const foreignCompanyId = randomUUID();
    const foreignGeofenceId = await createCircleGeofence(app, foreignCompanyId, 100);

    const denied = await simulate(app, employee.token, {
      employee_user_id: employee.user.id,
      policy_source: { mode: "effective_employee" },
      geofence_source: { mode: "policy_effective" },
      scenario: { type: "missing" },
    });
    expect(denied.statusCode).toBe(403);

    const crossTenant = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "geo_required",
          effectiveGeofenceIds: [foreignGeofenceId],
        },
      },
      geofence_source: { mode: "persisted", geofence_ids: [foreignGeofenceId] },
      scenario: coordinateScenario(12.972, 77.595, 10),
    });
    expect(crossTenant.statusCode).toBe(403);

    const validGeofenceId = await createCircleGeofence(app, companyId, 100);
    const invalidDraft = await simulate(app, admin.token, {
      employee_user_id: employee.user.id,
      policy_source: {
        mode: "draft_policy",
        config: {
          attendanceMode: "geo_required",
          effectiveGeofenceIds: [validGeofenceId],
        },
      },
      geofence_source: {
        mode: "draft",
        geofences: [
          {
            shape_type: "polygon",
            vertices: [
              [77.594, 12.971],
              [77.594, 12.971],
              [77.594, 12.971],
            ],
          },
        ],
      },
      scenario: coordinateScenario(12.972, 77.595, 10),
    });
    expect(invalidDraft.statusCode).toBe(400);
  }, 30_000);
});

function coordinateScenario(
  latitude: number,
  longitude: number,
  accuracyMeters: number,
  evidenceAgeMs = 0,
) {
  return {
    type: "coordinates",
    latitude,
    longitude,
    accuracy_meters: accuracyMeters,
    evidence_age_ms: evidenceAgeMs,
  };
}

async function simulate(
  app: TestApp,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/attendance/geo/simulate",
    headers: authHeader(token),
    payload: {
      event_at: "2026-05-22T05:30:00.000Z",
      ...payload,
    },
  });
}

function companyFor(app: TestApp, userId: string): string {
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === userId,
  )?.company_id;
  if (!companyId) throw new Error("Company fixture is unavailable.");
  return companyId;
}

async function clearFixtures(app: TestApp): Promise<void> {
  if (!app) return;
  const pool = app.store.pgPool;
  if (!pool) return;
  await pool.query(`
    TRUNCATE TABLE
      attendance.geo_fallback_reviews,
      attendance.regularization_correction_applications,
      attendance.regularization_actions,
      attendance.regularization_request_items,
      attendance.regularization_requests,
      attendance.decision_reasons,
      attendance.attendance_decisions,
      attendance.location_evidence,
      attendance.attendance_events,
      attendance.punch_events,
      attendance.command_decisions,
      attendance.command_executions,
      attendance.employee_command_states,
      attendance.break_segments,
      attendance.sessions,
      attendance.daily_records,
      attendance.policy_assignments,
      attendance.policy_versions,
      attendance.policies,
      attendance.geofence_versions,
      attendance.geofences,
      attendance.work_sites
    RESTART IDENTITY CASCADE
  `);
  await pool.query("DELETE FROM platform.outbox_events WHERE aggregate_type = 'attendance'");
  await pool.query("DELETE FROM platform.idempotency_keys WHERE scope LIKE 'attendance.%'");
}

async function createWorkSite(app: TestApp, companyId: string): Promise<string> {
  const result = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
       company_id, site_code, name, site_type, timezone, metadata
     ) VALUES ($1, $2, 'Simulation Site', 'office', 'Asia/Kolkata', '{}'::jsonb)
     RETURNING id`,
    [companyId, `SIM-SITE-${randomUUID()}`],
  );
  return result.rows[0]!.id;
}

async function createCircleGeofence(
  app: TestApp,
  companyId: string,
  radiusMeters: number,
): Promise<string> {
  const siteId = await createWorkSite(app, companyId);
  const geofence = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
       company_id, work_site_id, geofence_code, name, metadata
     ) VALUES ($1, $2, $3, 'Simulation Fence', '{}'::jsonb)
     RETURNING id`,
    [companyId, siteId, `SIM-GEO-${randomUUID()}`],
  );
  const geofenceId = geofence.rows[0]!.id;
  const version = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
       company_id, geofence_id, version_number, version_status,
       shape_type, shape, circle_radius_meters, shape_metadata,
       created_by_user_id, published_by_user_id, published_at,
       effective_from, effective_until, canonical_hash
     ) VALUES (
       $1, $2, 1, 'published', 'circle',
       ST_SetSRID(ST_MakePoint(77.595, 12.972), 4326), $3, '{}'::jsonb,
       $4::uuid, $4::uuid, now(),
       '2026-01-01T00:00:00.000Z', NULL,
       attendance.geofence_shape_canonical_hash(
         'circle',
         ST_SetSRID(ST_MakePoint(77.595, 12.972), 4326),
         $3
       )
     )
     RETURNING id`,
    [companyId, geofenceId, radiusMeters, randomUUID()],
  );
  await app.store.pgPool!.query(
    `UPDATE attendance.geofences
        SET current_published_version_id = $1
      WHERE id = $2`,
    [version.rows[0]!.id, geofenceId],
  );
  return geofenceId;
}

async function createPolicy(
  app: TestApp,
  input: {
    companyId: string;
    employeeUserId: string;
    config: Record<string, unknown>;
  },
): Promise<string> {
  const policyId = randomUUID();
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policies (
       id, company_id, policy_key, name, label, status
     ) VALUES ($1, $2, 'attendance', $3, 'Simulation Policy', 'active')`,
    [policyId, input.companyId, `simulation-${randomUUID()}`],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_versions (
       company_id, policy_id, version_number, effective_from, config
     ) VALUES ($1, $2, 1, '2026-01-01T00:00:00.000Z', $3::jsonb)`,
    [input.companyId, policyId, JSON.stringify(input.config)],
  );
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_assignments (
       company_id, policy_id, scope_type, scope_id, effective_from, status
     ) VALUES ($1, $2, 'employee', $3, '2026-01-01T00:00:00.000Z', 'active')`,
    [input.companyId, policyId, input.employeeUserId],
  );
  return policyId;
}

async function sideEffectCounts(app: TestApp): Promise<Record<string, string>> {
  const result = await app.store.pgPool!.query<Record<string, string>>(
    `SELECT
       (SELECT count(*)::text FROM attendance.attendance_events) AS attendance_events,
       (SELECT count(*)::text FROM attendance.location_evidence) AS location_evidence,
       (SELECT count(*)::text FROM attendance.punch_events) AS punch_events,
       (SELECT count(*)::text FROM attendance.sessions) AS sessions,
       (SELECT count(*)::text FROM attendance.daily_records) AS daily_records,
       (SELECT count(*)::text FROM attendance.geo_fallback_reviews) AS geo_fallback_reviews,
       (SELECT count(*)::text FROM attendance.regularization_requests) AS regularization_requests,
       (SELECT count(*)::text FROM attendance.regularization_correction_applications) AS correction_applications,
       (SELECT count(*)::text FROM attendance.command_executions) AS command_executions,
       (SELECT count(*)::text FROM platform.idempotency_keys WHERE scope LIKE 'attendance.%') AS idempotency_keys,
       (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type = 'attendance') AS attendance_outbox_events,
       (SELECT count(*)::text FROM attendance.policy_versions) AS policy_versions,
       (SELECT count(*)::text FROM attendance.geofence_versions) AS geofence_versions`,
  );
  return result.rows[0]!;
}
