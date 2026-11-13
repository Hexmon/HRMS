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

const qaCompanySlug = "hawkaii-hrms";

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
  const current = await client.query<{
    company_id: string | null;
    company_slug: string | null;
    company_status: string | null;
  }>(
    `SELECT preference.company_id, company.company_slug, company.status AS company_status
     FROM platform.user_session_preferences preference
     JOIN core.users admin ON admin.id = preference.user_id
     LEFT JOIN platform.company_profiles company ON company.id = preference.company_id
     WHERE preference.user_id = $1
       AND admin.deleted_at IS NULL AND admin.employment_status = 'active'`,
    [ids.adminUserId],
  );
  const currentContext = current.rows[0];
  if (currentContext) {
    if (
      currentContext.company_id !== ids.companyId ||
      currentContext.company_slug !== qaCompanySlug ||
      currentContext.company_status !== "active"
    ) {
      throw new Error(
        "QA seed refused an Admin company preference that does not exactly match the deterministic QA company.",
      );
    }
    return ids.companyId;
  }

  const sameSlug = await client.query<{ id: string; status: string }>(
    `SELECT id, status
     FROM platform.company_profiles
     WHERE company_slug = $1
     FOR UPDATE`,
    [qaCompanySlug],
  );
  const existingCompany = sameSlug.rows[0];
  if (existingCompany && (existingCompany.id !== ids.companyId || existingCompany.status !== "active")) {
    throw new Error(
      "QA seed refused a company slug that does not exactly match the active deterministic QA company.",
    );
  }

  if (!existingCompany) {
    await client.query(
      `INSERT INTO platform.company_profiles (
         id, company_name, company_slug, timezone, locale, currency,
         fiscal_year_start_month, working_week, work_hours_per_day,
         status, bootstrap_completed_at
       )
       VALUES ($1, 'Hawkaii HRMS QA', $2, 'Asia/Kolkata', 'en-IN', 'INR',
         4, 'Mon-Fri', 8, 'active', now())`,
      [ids.companyId, qaCompanySlug],
    );
  }

  await client.query(
    `INSERT INTO platform.user_session_preferences (
       id, user_id, active_role, company_id, landing_page, locale, timezone
     )
     VALUES ($1, $2, 'admin', $3, '/dashboard', 'en-IN', 'Asia/Kolkata')
     ON CONFLICT (user_id) DO NOTHING`,
    [ids.preferenceId, ids.adminUserId, ids.companyId],
  );

  const verified = await client.query<{ company_id: string }>(
    `SELECT preference.company_id
     FROM platform.user_session_preferences preference
     JOIN platform.company_profiles company ON company.id = preference.company_id
     WHERE preference.user_id = $1
       AND preference.company_id = $2
       AND company.company_slug = $3
       AND company.status = 'active'`,
    [ids.adminUserId, ids.companyId, qaCompanySlug],
  );
  if (verified.rows[0]?.company_id !== ids.companyId) {
    throw new Error("QA seed could not establish the exact deterministic Admin company context.");
  }
  return ids.companyId;
}

export async function rethrowAfterQaSeedRollback(
  client: QaSeedSqlClient,
  primaryError: unknown,
): Promise<never> {
  await client.query("ROLLBACK").catch(() => undefined);
  throw primaryError;
}

export async function runGuardedQaSeed(
  env: QaSeedEnvironment,
  phases: QaSeedPhases,
): Promise<void> {
  requireQaSeedTarget(env);
  await phases.releaseSeed();
  await phases.extrasSeed();
}
