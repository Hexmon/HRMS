import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("attendance employee privacy summary", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  }, 30_000);

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("requires authentication and existing employee self-service authorization", async () => {
    const anonymous = await app.inject({
      method: "GET",
      url: "/api/v1/attendance/privacy",
    });
    expect(anonymous.statusCode).toBe(401);

    const admin = await loginAs(app, "ADM");
    const adminResponse = await privacyRequest(admin.token);
    expect(adminResponse.statusCode).toBe(403);

    const employee = await loginAs(app, "E1");
    const employeeResponse = await privacyRequest(employee.token);
    expect(employeeResponse.statusCode).toBe(200);
    expect(employeeResponse.json()).toMatchObject({
      effective_policy: {
        attendance_mode: "manual_only",
        policy_source: "built_in",
        location_requirement: "not_requested",
      },
      retention: {
        coordinate_retention_class: "standard",
        coordinate_retention_seconds: 2_592_000,
      },
    });
  });

  it("returns only the authenticated employee's active-company privacy summary", async () => {
    const employee = await loginAs(app, "E1");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/attendance/privacy?employee_user_id=${randomUUID()}&company_id=${randomUUID()}`,
      headers: authHeader(employee.token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.employee_controls).toMatchObject({
      review_attendance_path: "/attendance/calendar",
      correct_attendance_path: "/attendance",
      manage_devices_path: "/ems/profile",
    });
    expectForbiddenPrivacyKeys(body);
  });

  it("uses resolver precedence for employee, department, company, and built-in policies", async () => {
    const employee = await loginAs(app, "E1");
    const fixture = employeeFixture(employee.user.id);
    await clearPolicyAssignments(fixture.companyId);

    const companyPolicy = await createAttendancePolicy({
      companyId: fixture.companyId,
      name: "privacy_company_policy",
      config: { attendanceMode: "geo_optional" },
    });
    const departmentPolicy = await createAttendancePolicy({
      companyId: fixture.companyId,
      name: "privacy_department_policy",
      config: { attendanceMode: "geo_preferred" },
    });
    const employeePolicy = await createAttendancePolicy({
      companyId: fixture.companyId,
      name: "privacy_employee_policy",
      versionNumber: 9,
      config: {
        attendanceMode: "geo_required",
        fallbackApprovalMode: "approval_required",
        permissionDeniedAction: "manual_fallback",
        locationUnavailableAction: "manual_fallback",
        outsideFenceAction: "deny",
        boundaryUncertainAction: "allow",
        staleEvidenceAction: "manual_fallback",
        accuracyExceededAction: "manual_fallback",
        effectiveGeofenceIds: [randomUUID()],
        geofenceGraceMeters: 35,
        maxLocationAgeMs: 90_000,
        maxAccuracyMeters: 50,
        coordinateRetentionClasses: { short: 3_600 },
        defaultCoordinateRetentionClass: "short",
      },
    });
    await assignPolicy({
      companyId: fixture.companyId,
      policyId: companyPolicy,
      scopeType: "company",
      scopeId: null,
    });
    await assignPolicy({
      companyId: fixture.companyId,
      policyId: departmentPolicy,
      scopeType: "department",
      scopeId: fixture.departmentId,
    });
    await assignPolicy({
      companyId: fixture.companyId,
      policyId: employeePolicy,
      scopeType: "employee",
      scopeId: fixture.employeeUserId,
    });

    const employeeScoped = await privacyJson(employee.token);
    expect(employeeScoped).toMatchObject({
      effective_policy: {
        attendance_mode: "geo_required",
        policy_source: "assignment",
        location_requirement: "requested_policy_controlled",
        fallback_approval_mode: "approval_required",
        max_location_age_ms: 90_000,
        max_accuracy_meters: 50,
        geofence: { configured: true, grace_meters: 35 },
        actions: {
          permission_denied: "manual_fallback",
          location_unavailable: "manual_fallback",
          outside_fence: "deny",
          boundary_uncertain: "allow",
          stale_evidence: "manual_fallback",
          accuracy_exceeded: "manual_fallback",
        },
      },
      manual_fallback: {
        available_when_policy_selects_manual_fallback: true,
        explicit_submission_required: true,
        review_required: true,
      },
      retention: {
        coordinate_retention_class: "short",
        coordinate_retention_seconds: 3_600,
      },
    });

    await app.store.pgPool!.query(
      "DELETE FROM attendance.policy_assignments WHERE company_id = $1 AND scope_type = 'employee'",
      [fixture.companyId],
    );
    const departmentScoped = await privacyJson(employee.token);
    expect(departmentScoped.effective_policy.attendance_mode).toBe("geo_preferred");
    expect(departmentScoped.effective_policy.location_requirement).toBe(
      "requested_policy_controlled",
    );

    await app.store.pgPool!.query(
      "DELETE FROM attendance.policy_assignments WHERE company_id = $1 AND scope_type = 'department'",
      [fixture.companyId],
    );
    const companyScoped = await privacyJson(employee.token);
    expect(companyScoped.effective_policy.attendance_mode).toBe("geo_optional");
    expect(companyScoped.effective_policy.location_requirement).toBe(
      "requested_optional",
    );

    await clearPolicyAssignments(fixture.companyId);
    const builtIn = await privacyJson(employee.token);
    expect(builtIn.effective_policy).toMatchObject({
      attendance_mode: "manual_only",
      policy_source: "built_in",
      location_requirement: "not_requested",
    });
  });

  it("does not silently replace invalid policy actions with hardcoded values", async () => {
    const employee = await loginAs(app, "E1");
    const fixture = employeeFixture(employee.user.id);
    await clearPolicyAssignments(fixture.companyId);
    const policyId = await createAttendancePolicy({
      companyId: fixture.companyId,
      name: "privacy_invalid_action_policy",
      config: {
        attendanceMode: "geo_required",
        permissionDeniedAction: "__unsupported_for_privacy_test__",
      },
    });
    await assignPolicy({
      companyId: fixture.companyId,
      policyId,
      scopeType: "employee",
      scopeId: fixture.employeeUserId,
    });

    const response = await privacyRequest(employee.token);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      details: expect.objectContaining({
        code: "attendance_privacy_invalid_policy_action",
        field: "permissionDeniedAction",
      }),
    });
  });

  it("keeps exact-location, offline, retention, and historical semantics explicit", async () => {
    const employee = await loginAs(app, "E1");
    const body = await privacyJson(employee.token);

    expect(body).toMatchObject({
      retention: {
        applies_to_new_coordinate_evidence: true,
        historical_evidence_uses_recorded_expiry: true,
        purge: {
          eligibility: "eligible_after_retention_duration",
          processing: "background_worker",
          immediate_at_expiry: false,
        },
      },
      evidence_access: {
        routine_evidence: {
          employee_self_view: "sanitized_own_evidence",
          manager_view: "scoped_sanitized_evidence",
          hr_admin_auditor_view: "role_scoped_sanitized_evidence",
          reports_exclude_exact_coordinates: true,
        },
        exact_location: {
          employee_can_view_exact_coordinates: false,
          requires_record_visibility: true,
          requires_permission: "attendance:view_exact_location",
          successful_authorized_reveals_audited: true,
          denied_reveals_not_guaranteed_in_exact_coordinate_audit: true,
          available_only_while_unexpired_unpurged: true,
        },
      },
      offline_mobile: {
        registered_device_required: true,
        offline_supported_for_registered_devices: true,
        offline_evidence_may_include_location: true,
        accepted_offline_events_are_provisional: true,
        payroll_eligible_from_offline_sync: false,
      },
    });
  });

  async function privacyRequest(token: string) {
    return app.inject({
      method: "GET",
      url: "/api/v1/attendance/privacy",
      headers: authHeader(token),
    });
  }

  async function privacyJson(token: string): Promise<Record<string, any>> {
    const response = await privacyRequest(token);
    expect(response.statusCode).toBe(200);
    return response.json() as Record<string, any>;
  }

  function employeeFixture(employeeUserId: string): {
    employeeUserId: string;
    companyId: string;
    departmentId: string;
  } {
    const user = app.store.users.find((candidate) => candidate.id === employeeUserId);
    const companyId = app.store.userSessionPreferences.find(
      (preference) => preference.user_id === employeeUserId,
    )?.company_id;
    if (!user?.department_id || !companyId) {
      throw new Error("Expected employee fixture with company and department.");
    }
    return { employeeUserId, companyId, departmentId: user.department_id };
  }

  async function clearPolicyAssignments(companyId: string): Promise<void> {
    await app.store.pgPool!.query(
      "DELETE FROM attendance.policy_assignments WHERE company_id = $1",
      [companyId],
    );
  }

  async function createAttendancePolicy(input: {
    companyId: string;
    name: string;
    versionNumber?: number;
    config?: Record<string, unknown>;
  }): Promise<string> {
    const policy = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO attendance.policies (
        company_id, policy_key, name, label, status, created_at, updated_at, deleted_at, version
      ) VALUES ($1, 'attendance', $2, $2, 'active', now(), now(), NULL, 1)
      RETURNING id`,
      [input.companyId, input.name],
    );
    const policyId = policy.rows[0]?.id;
    if (!policyId) throw new Error("Attendance policy fixture was not created.");
    await app.store.pgPool!.query(
      `INSERT INTO attendance.policy_versions (
        company_id, policy_id, version_number, effective_from, effective_until,
        config, created_at
      ) VALUES ($1, $2, $3, '2026-01-01T00:00:00.000Z', NULL, $4::jsonb, now())`,
      [
        input.companyId,
        policyId,
        input.versionNumber ?? 1,
        JSON.stringify(input.config ?? {}),
      ],
    );
    return policyId;
  }

  async function assignPolicy(input: {
    companyId: string;
    policyId: string;
    scopeType: "employee" | "department" | "company";
    scopeId: string | null;
  }): Promise<void> {
    await app.store.pgPool!.query(
      `INSERT INTO attendance.policy_assignments (
        company_id, policy_id, scope_type, scope_id, effective_from, effective_until,
        status, created_at, updated_at, deleted_at, version
      ) VALUES ($1, $2, $3, $4, '2026-01-01T00:00:00.000Z', NULL,
        'active', now(), now(), NULL, 1)`,
      [input.companyId, input.policyId, input.scopeType, input.scopeId],
    );
  }
});

function expectForbiddenPrivacyKeys(value: unknown): void {
  const keys = collectKeys(value);
  const forbidden = [
    "latitude",
    "longitude",
    "geofence_id",
    "geofence_ids",
    "policy_id",
    "policy_version_id",
    "assignment_id",
    "location_evidence_id",
    "attendance_event_id",
    "command_id",
    "client_event_id",
    "device_id",
    "registered_device_id",
    "installation_id_hash",
    "audit_id",
    "request_snapshot",
    "raw_payload",
    "attestation",
  ];
  for (const key of forbidden) {
    expect(keys, `privacy response must not expose ${key}`).not.toContain(key);
  }
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    collectKeys(nested, keys);
  }
  return keys;
}
