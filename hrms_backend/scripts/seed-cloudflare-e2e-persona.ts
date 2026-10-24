import { createHash } from "node:crypto";
import { Client } from "pg";
import { getLocalDemoPassword, hashPasswordSync } from "#auth";
import { Roles } from "#shared";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the local Cloudflare E2E seed.");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "postgres"].includes(target.hostname) || target.pathname !== "/hrms_platform") {
  throw new Error("The Cloudflare E2E persona seed accepts only the local hrms_platform database.");
}

function idFor(name: string): string {
  const hash = createHash("sha256").update(`cloudflare-e2e:${name}`).digest("hex");
  const variant = (8 + (Number.parseInt(hash.slice(16, 17), 16) % 4)).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const source = await client.query<{
    department_id: string;
    designation_id: string;
    manager_user_id: string;
    company_id: string;
  }>(
    `SELECT employee.department_id, employee.designation_id,
            employee.manager_user_id, preference.company_id
       FROM core.users employee
       JOIN platform.user_session_preferences preference ON preference.user_id = employee.id
      WHERE employee.employee_code = 'E2' AND preference.company_id IS NOT NULL`,
  );
  const context = source.rows[0];
  if (!context) throw new Error("Seed E2 and its company context before the Cloudflare E2E persona.");

  // The synthetic browser journey must be runnable on weekends as well as
  // weekdays. This local-only seed changes no production company policy.
  await client.query(
    "UPDATE platform.company_profiles SET working_week = 'Mon-Sun' WHERE id = $1",
    [context.company_id],
  );

  const personas = [
    { key: "race", code: "E4", email: "worker-race@example.test", name: "Worker Race Employee", role: Roles.Employee, path: "CEO.SALES.S1.D1.E4", managerId: context.manager_user_id },
    { key: "exit", code: "E5", email: "worker-exit@example.test", name: "Worker Exit Employee", role: Roles.Employee, path: "CEO.SALES.S1.D1.E5", managerId: context.manager_user_id },
    { key: "geo", code: "E6", email: "worker-geo@example.test", name: "Worker Geo Employee", role: Roles.Employee, path: "CEO.SALES.S1.D1.E6", managerId: context.manager_user_id },
    { key: "hr", code: "H1", email: "worker-hr@example.test", name: "Worker HR Manager", role: Roles.HRManager, path: "CEO.H1", managerId: null },
  ] as const;
  for (const persona of personas) {
    const userId = idFor(`${persona.key}-employee`);
    await client.query(
      `INSERT INTO core.users (
         id, employee_code, email, full_name, department_id, designation_id,
         manager_user_id, hierarchy_path, employment_status, timezone, joined_on
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree, 'active', 'Asia/Kolkata', '2026-01-01')
       ON CONFLICT (employee_code) DO UPDATE SET
         email = EXCLUDED.email, full_name = EXCLUDED.full_name,
         department_id = EXCLUDED.department_id, designation_id = EXCLUDED.designation_id,
         manager_user_id = EXCLUDED.manager_user_id, employment_status = EXCLUDED.employment_status,
         deleted_at = NULL`,
      [userId, persona.code, persona.email, persona.name, context.department_id,
        context.designation_id, persona.managerId, persona.path],
    );
    await client.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from)
       VALUES ($1, $2, $3, 'active', '2026-01-01')
       ON CONFLICT (id) DO UPDATE SET role_key = EXCLUDED.role_key, status = EXCLUDED.status`,
      [idFor(`${persona.key}-role`), userId, persona.role],
    );
    await client.query(
      `INSERT INTO platform.user_credentials (id, user_id, password_hash, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         status = EXCLUDED.status, deleted_at = NULL`,
      [idFor(`${persona.key}-credential`), userId,
        hashPasswordSync(getLocalDemoPassword(), `hrms-cloudflare-e2e-${persona.key}`)],
    );
    await client.query(
      `INSERT INTO platform.user_session_preferences (
         id, user_id, active_role, company_id, landing_page, locale, timezone, version
       ) VALUES ($1, $2, $3, $4, '/dashboard', 'en-IN', 'Asia/Kolkata', 1)
       ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id,
         active_role = EXCLUDED.active_role`,
      [idFor(`${persona.key}-preference`), userId, persona.role, context.company_id],
    );
  }

  // Only E6 uses geolocation. One-minute retention lets the browser exercise
  // real capture and the hourly purge without touching any other persona.
  const geoPolicyId = idFor("geo-policy");
  await client.query(
    `INSERT INTO attendance.policies
       (id, company_id, policy_key, name, label, status, created_at, updated_at, version)
     VALUES ($1, $2, 'attendance', 'Cloudflare E2E geo', 'Cloudflare E2E geo',
       'active', now(), now(), 1)
     ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`,
    [geoPolicyId, context.company_id],
  );
  await client.query(
    `INSERT INTO attendance.policy_versions
       (id, company_id, policy_id, version_number, effective_from, config, created_at)
     VALUES ($1, $2, $3, 1, '2026-01-01T00:00:00Z', $4::jsonb, now())
     ON CONFLICT (id) DO NOTHING`,
    [idFor("geo-policy-version"), context.company_id, geoPolicyId,
      JSON.stringify({ attendanceMode: "geo_optional", coordinateRetentionClasses: { short: 60 },
        defaultCoordinateRetentionClass: "short", fullDayPunchWindow: true,
        allowOffDayPunches: true })],
  );
  await client.query(
    `INSERT INTO attendance.policy_assignments
       (id, company_id, policy_id, scope_type, scope_id, effective_from,
        status, created_at, updated_at, version)
     VALUES ($1, $2, $3, 'employee', $4, '2026-01-01T00:00:00Z',
       'active', now(), now(), 1)
     ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`,
    [idFor("geo-policy-assignment"), context.company_id, geoPolicyId, idFor("geo-employee")],
  );
  await client.query("COMMIT");
  console.log("Seeded idempotent local E4/E5/E6 employees, H1 HR manager, and E6 geo policy.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
