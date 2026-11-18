import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { PostgresAttendanceCommandRepository } from "../command-repository.js";
import { resolveEffectiveAttendancePolicy } from "../policy-resolver.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;
const originalDatabaseUrl = process.env.DATABASE_URL;

function employeeFixture(app: TestApp): { employeeUserId: string; companyId: string } {
  const employee = app.store.users.find((user) => user.employee_code === "E1");
  if (!employee) throw new Error("Employee fixture is unavailable.");
  const companyId = app.store.userSessionPreferences.find(
    (preference) => preference.user_id === employee.id,
  )?.company_id;
  if (!companyId) throw new Error("Employee company fixture is unavailable.");
  return { employeeUserId: employee.id, companyId };
}

async function createAttendancePolicy(
  app: TestApp,
  input: {
    companyId: string;
    name: string;
    versionNumber?: number;
    config?: Record<string, unknown>;
    createVersion?: boolean;
  },
): Promise<string> {
  const policy = await app.store.pgPool!.query<{ id: string }>(
    `INSERT INTO attendance.policies (
      company_id, policy_key, name, label, status, created_at, updated_at, deleted_at, version
    ) VALUES ($1, 'attendance', $2, $2, 'active', now(), now(), NULL, 1)
    RETURNING id`,
    [input.companyId, input.name],
  );
  const policyId = policy.rows[0]?.id;
  if (!policyId) throw new Error("Attendance policy fixture was not created.");

  if (input.createVersion !== false) {
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
  }

  return policyId;
}

async function assignEmployeePolicy(
  app: TestApp,
  input: {
    companyId: string;
    policyId: string;
    employeeUserId: string;
  },
): Promise<void> {
  await app.store.pgPool!.query(
    `INSERT INTO attendance.policy_assignments (
      company_id, policy_id, scope_type, scope_id, effective_from, effective_until,
      status, created_at, updated_at, deleted_at, version
    ) VALUES ($1, $2, 'employee', $3, '2026-01-01T00:00:00.000Z', NULL,
      'active', now(), now(), NULL, 1)`,
    [input.companyId, input.policyId, input.employeeUserId],
  );
}

describe("PostgreSQL attendance policy resolver", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

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

  it("uses employee assignment precedence and returns a full policy snapshot", async () => {
    const { employeeUserId, companyId } = employeeFixture(app);
    const policyId = await createAttendancePolicy(app, {
      companyId,
      name: "employee_geo_required",
      versionNumber: 7,
      config: {
        graceMinutes: 3,
        attendanceMode: "geo_required",
        fallbackApprovalMode: "approval_required",
        regularizationMode: "disabled",
        allowRegularization: false,
      },
    });
    await assignEmployeePolicy(app, { companyId, policyId, employeeUserId });

    const repository = new PostgresAttendanceCommandRepository(app.store.pgPool!);
    const resolved = await repository.transaction((tx) =>
      resolveEffectiveAttendancePolicy(tx, {
        companyId,
        subjectEmployeeUserId: employeeUserId,
        asOf: "2026-07-21T09:00:00.000Z",
      }),
    );

    expect(resolved).toMatchObject({
      schemaVersion: 1,
      resolverVersion: "attendance-policy-resolver-v1",
      source: "assignment",
      policyId,
      policyVersionNumber: 7,
      policyVersion: "7",
      legacyPolicyVersion: "7",
      assignmentScopeType: "employee",
      assignmentScopeId: employeeUserId,
      scopeRank: 300,
      attendanceMode: "geo_required",
      fallbackApprovalMode: "approval_required",
      regularizationMode: "disabled",
      config: expect.objectContaining({
        graceMinutes: 3,
        attendanceMode: "geo_required",
      }),
    });
  });

  it("rejects an assignment whose logical policy has no effective version", async () => {
    const { employeeUserId, companyId } = employeeFixture(app);
    const policyId = await createAttendancePolicy(app, {
      companyId,
      name: "employee_no_effective_version",
      createVersion: false,
    });
    await assignEmployeePolicy(app, { companyId, policyId, employeeUserId });
    const repository = new PostgresAttendanceCommandRepository(app.store.pgPool!);

    await expect(
      repository.transaction((tx) =>
        resolveEffectiveAttendancePolicy(tx, {
          companyId,
          subjectEmployeeUserId: employeeUserId,
          asOf: "2026-07-21T09:00:00.000Z",
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      details: expect.objectContaining({
        code: "attendance_policy_no_effective_version",
        policy_id: policyId,
      }),
    });
  });

  it("applies the forward replay guard after the previous trigger and remains idempotent", async () => {
    const { companyId } = employeeFixture(app);
    const policyId = await createAttendancePolicy(app, {
      companyId,
      name: "forward_migration_replay_guard",
      createVersion: false,
    });
    await app.store.pgPool!.query(`
      CREATE OR REPLACE FUNCTION attendance.reject_overlapping_policy_version()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM attendance.policy_versions existing
          WHERE existing.policy_id = NEW.policy_id
            AND existing.company_id = NEW.company_id
            AND existing.id <> NEW.id
            AND NEW.effective_from < COALESCE(existing.effective_until, 'infinity'::timestamptz)
            AND COALESCE(NEW.effective_until, 'infinity'::timestamptz) > existing.effective_from
        ) THEN
          RAISE EXCEPTION 'overlapping attendance policy versions are not allowed'
            USING ERRCODE = '23514', CONSTRAINT = 'attendance_policy_versions_no_overlap';
        END IF;
        RETURN NEW;
      END; $$;
    `);
    const migration = readFileSync(
      "src/db/migrations/0066_attendance_policy_version_replay_guard.sql",
      "utf8",
    );
    await app.store.pgPool!.query(migration);
    await app.store.pgPool!.query(migration);
    const versionId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO attendance.policy_versions
         (id, company_id, policy_id, version_number, effective_from, config, created_at)
       VALUES ($1, $2, $3, 1, '2026-01-01T00:00:00.000Z', '{}'::jsonb, now())`,
      [versionId, companyId, policyId],
    );
    await expect(app.store.pgPool!.query(
      `INSERT INTO attendance.policy_versions
         (id, company_id, policy_id, version_number, effective_from, config, created_at)
       VALUES ($1, $2, $3, 1, '2026-01-01T00:00:00.000Z', '{}'::jsonb, now())
       ON CONFLICT (policy_id, version_number) DO NOTHING`,
      [randomUUID(), companyId, policyId],
    )).resolves.toBeDefined();
    await expect(app.store.pgPool!.query(
      `INSERT INTO attendance.policy_versions
         (id, company_id, policy_id, version_number, effective_from, config, created_at)
       VALUES ($1, $2, $3, 2, '2026-02-01T00:00:00.000Z', '{}'::jsonb, now())`,
      [randomUUID(), companyId, policyId],
    )).rejects.toMatchObject({ constraint: "attendance_policy_versions_no_overlap" });
  });
});
