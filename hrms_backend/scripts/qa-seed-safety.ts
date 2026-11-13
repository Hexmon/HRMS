import type { QueryResultRow } from "pg";

export interface QaSeedEnvironment {
  APP_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  HRMS_QA_SEED_ALLOW?: string;
  HRMS_QA_SEED_CONFIRM_DATABASE?: string;
}

interface QaSeedPhases {
  releaseSeed: () => Promise<unknown>;
  extrasSeed: () => Promise<unknown>;
}

interface QaSeedSqlClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

interface QaAdminCompanyContextIds {
  adminUserId: string;
  companyId: string;
  preferenceId: string;
}

export function requireQaSeedTarget(env: QaSeedEnvironment): URL {
  const appEnv = env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : "local");
  if (!new Set(["local", "qa"]).has(appEnv)) {
    throw new Error(`QA seed refused APP_ENV=${appEnv}; only isolated local or QA targets are allowed.`);
  }
  if (env.HRMS_QA_SEED_ALLOW !== "true") {
    throw new Error("QA seed requires HRMS_QA_SEED_ALLOW=true as an explicit mutation opt-in.");
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the QA seed.");
  }
  const target = new URL(env.DATABASE_URL);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!databaseName || env.HRMS_QA_SEED_CONFIRM_DATABASE !== databaseName) {
    throw new Error(
      "QA seed requires HRMS_QA_SEED_CONFIRM_DATABASE to exactly match the target database name.",
    );
  }
  if (appEnv === "local" && !new Set(["127.0.0.1", "localhost", "postgres"]).has(target.hostname)) {
    throw new Error(`Local QA seed refused remote database host ${target.hostname}.`);
  }
  return target;
}

export function requireQaPersonaIdentity(
  expectedId: unknown,
  persistedId: unknown,
  employeeCode: unknown,
): asserts persistedId is string {
  if (typeof expectedId !== "string" || persistedId !== expectedId) {
    throw new Error(
      `QA seed employee-code collision for ${String(employeeCode)}; existing identity does not match the deterministic persona.`,
    );
  }
}

export async function ensureQaAdminCompanyContext(
  client: QaSeedSqlClient,
  ids: QaAdminCompanyContextIds,
): Promise<string> {
  const current = await client.query<{ company_id: string }>(
    `SELECT preference.company_id
     FROM platform.user_session_preferences preference
     JOIN core.users admin ON admin.id = preference.user_id
     JOIN platform.company_profiles company ON company.id = preference.company_id
     WHERE preference.user_id = $1
       AND admin.deleted_at IS NULL AND admin.employment_status = 'active'
       AND company.status = 'active'`,
    [ids.adminUserId],
  );
  if (current.rows[0]?.company_id) {
    return current.rows[0].company_id;
  }

  const company = await client.query<{ id: string }>(
    `INSERT INTO platform.company_profiles (
       id, company_name, company_slug, timezone, locale, currency,
       fiscal_year_start_month, working_week, work_hours_per_day,
       status, bootstrap_completed_at
     )
     VALUES ($1, 'Hawkaii HRMS QA', 'hawkaii-hrms', 'Asia/Kolkata', 'en-IN', 'INR',
       4, 'Mon-Fri', 8, 'active', now())
     ON CONFLICT (company_slug) DO UPDATE
     SET status = 'active',
         bootstrap_completed_at = COALESCE(platform.company_profiles.bootstrap_completed_at, now()),
         updated_at = now()
     RETURNING id`,
    [ids.companyId],
  );
  const companyId = company.rows[0]?.id;
  if (!companyId) {
    throw new Error("QA seed could not create or recover its default company.");
  }

  await client.query(
    `INSERT INTO platform.user_session_preferences (
       id, user_id, active_role, company_id, landing_page, locale, timezone
     )
     VALUES ($1, $2, 'admin', $3, '/dashboard', 'en-IN', 'Asia/Kolkata')
     ON CONFLICT (user_id) DO UPDATE
     SET active_role = EXCLUDED.active_role,
         company_id = EXCLUDED.company_id,
         landing_page = EXCLUDED.landing_page,
         locale = EXCLUDED.locale,
         timezone = EXCLUDED.timezone,
         updated_at = now(),
         version = platform.user_session_preferences.version + 1`,
    [ids.preferenceId, ids.adminUserId, companyId],
  );
  return companyId;
}

export async function runGuardedQaSeed(
  env: QaSeedEnvironment,
  phases: QaSeedPhases,
): Promise<void> {
  requireQaSeedTarget(env);
  await phases.releaseSeed();
  await phases.extrasSeed();
}
