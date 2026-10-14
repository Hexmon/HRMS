import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

describe("cross-schema reference integrity triggers", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("validates attendance tenant references and restricts parent mutations", async () => {
    const employee = app.store.users.find((user) => user.employee_code === "E1");
    const preference = app.store.userSessionPreferences.find(
      (candidate) => candidate.user_id === employee?.id,
    );
    if (!employee || !preference?.company_id) {
      throw new Error("Employee company fixture is unavailable.");
    }

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_templates (
          company_id, code, name, status, is_company_default, version
        ) VALUES ($1, 'INVALID_COMPANY', 'Invalid company', 'active', false, 1)`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "attendance_company_profile_reference",
    });

    const template = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO attendance.shift_templates (
        company_id, code, name, status, is_company_default, version
      ) VALUES ($1, 'INTEGRITY', 'Integrity', 'active', false, 1)
      RETURNING id`,
      [preference.company_id],
    );
    const templateId = template.rows[0]?.id;
    if (!templateId) throw new Error("Shift template fixture was not created.");

    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_assignments (
          company_id, employee_user_id, template_id, effective_from, status, version
        ) VALUES ($1, $2, $3, '2026-01-01', 'active', 1)`,
        [preference.company_id, randomUUID(), templateId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "attendance_employee_user_reference",
    });

    const otherEmployee = app.store.users.find(
      (user) => user.employee_code === "E2",
    );
    if (!otherEmployee) throw new Error("Second employee fixture is unavailable.");
    const otherCompanyId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (
        id, company_name, company_slug, status
      ) VALUES ($1, 'Other company', $2, 'active')`,
      [otherCompanyId, `other-${otherCompanyId}`],
    );
    await app.store.pgPool!.query(
      `UPDATE platform.user_session_preferences
       SET company_id = $1
       WHERE user_id = $2`,
      [otherCompanyId, otherEmployee.id],
    );
    await expect(
      app.store.pgPool!.query(
        `INSERT INTO attendance.shift_assignments (
          company_id, employee_user_id, template_id, effective_from, status, version
        ) VALUES ($1, $2, $3, '2026-01-01', 'active', 1)`,
        [preference.company_id, otherEmployee.id, templateId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "attendance_employee_company_reference",
    });

    await app.store.pgPool!.query(
      `INSERT INTO attendance.shift_assignments (
        company_id, employee_user_id, template_id, effective_from, status, version
      ) VALUES ($1, $2, $3, '2026-01-01', 'active', 1)`,
      [preference.company_id, employee.id, templateId],
    );

    await expect(
      app.store.pgPool!.query(
        "UPDATE platform.user_session_preferences SET company_id = NULL WHERE user_id = $1",
        [employee.id],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_employee_attendance_membership_reference",
    });

    await expect(
      app.store.pgPool!.query("DELETE FROM core.users WHERE id = $1", [employee.id]),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "core_user_attendance_reference",
    });

    await expect(
      app.store.pgPool!.query("DELETE FROM platform.company_profiles WHERE id = $1", [
        preference.company_id,
      ]),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "platform_company_profile_attendance_reference",
    });
  });
});
