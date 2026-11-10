/** Refuse network or database targets outside the disposable local probe stack. */
export function requireLocalTestEnvironment(environment: NodeJS.ProcessEnv): void {
  let database: URL;
  let valkey: URL;
  try {
    database = new URL(environment.TEST_DATABASE_URL ?? "");
    valkey = new URL(environment.VALKEY_URL ?? "");
  } catch {
    throw new Error("Refusing invalid local probe URL");
  }

  // node-postgres accepts URL query parameters (including host/port) that can
  // override the visible authority. The probe resets this database on startup.
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.hostname !== "127.0.0.1" ||
    database.port !== "55432" ||
    database.pathname !== "/hrms_platform_test" ||
    database.search !== "" ||
    database.hash !== ""
  ) {
    throw new Error("Refusing non-disposable TEST_DATABASE_URL");
  }
  if (
    valkey.protocol !== "redis:" ||
    valkey.hostname !== "127.0.0.1" ||
    valkey.port !== "56379" ||
    valkey.search !== "" ||
    valkey.hash !== ""
  ) {
    throw new Error("Refusing non-local VALKEY_URL");
  }
  if (
    environment.APP_ENV !== "local" ||
    environment.EMAIL_DELIVERY_MODE !== "log" ||
    environment.CLOUDINARY_MOCK_UPLOADS !== "true"
  ) {
    throw new Error("Refusing non-local application delivery configuration");
  }
}
