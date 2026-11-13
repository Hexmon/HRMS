interface QaSeedEnvironment {
  APP_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  HRMS_QA_SEED_ALLOW?: string;
  HRMS_QA_SEED_CONFIRM_DATABASE?: string;
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
