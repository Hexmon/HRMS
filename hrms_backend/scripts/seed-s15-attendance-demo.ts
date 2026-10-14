import { createHash } from "node:crypto";
import { Client, type QueryResult } from "pg";
import { Roles } from "#shared";
import { loadRuntimeEnv, requireEnv } from "./env.js";

const seedTag = "GEO-S15-016";
const defaultCompanyId = uuidFromName("company-default");
const safeRemoteOverride = "S15_ATTENDANCE_DEMO_SEED_ALLOW_REMOTE";
const demoTimeZone = "Asia/Kolkata";

const personaCodes = ["S1", "D1", "E1", "E2", "ADM", "AUD"] as const;
type PersonaCode = (typeof personaCodes)[number];
type DemoDates = {
  manual: string;
  geo: string;
  fallback: string;
  regularization: string;
};
type DemoSiteIds = {
  workSiteId: string;
  geofenceId: string;
};

const preferredRoles: Record<PersonaCode, string> = {
  S1: Roles.Director,
  D1: Roles.Reviewer,
  E1: Roles.Employee,
  E2: Roles.Employee,
  ADM: Roles.Admin,
  AUD: Roles.Auditor,
};

const demoDates = buildDemoDates(new Date(), demoTimeZone);
const ids = buildDemoIds(demoDates);

// Deliberately synthetic "Null Island adjacent" fixture coordinates.
const demoCoordinate = {
  latitude: 0.001,
  longitude: 0.001,
  accuracyMeters: 18,
};

loadRuntimeEnv();
const databaseUrl = requireEnv("DATABASE_URL");
assertSafeSeedTarget(databaseUrl);

const client = new Client({ connectionString: databaseUrl });
await client.connect();

const stats = {
  companyContext: 0,
  workSites: 0,
  geofences: 0,
  commands: 0,
  punches: 0,
  dailyRecords: 0,
  skippedDailyRecords: 0,
  fallbackReviews: 0,
  regularizations: 0,
};

try {
  await client.query("BEGIN");

  const personas = await loadReleasePersonas(client);
  const defaultDemoCompanyId = await ensureDefaultCompany(client);
  const companyId = await resolveSeedCompanyId(
    client,
    personas,
    defaultDemoCompanyId,
  );
  await ensurePersonaPreferences(client, personas, companyId);
  stats.companyContext = 1;

  const demoSite = await seedWorkSiteAndGeofence(
    client,
    companyId,
    personas.ADM.id,
  );
  stats.workSites += 1;
  stats.geofences += 1;

  await seedAttendanceRecords(client, companyId, personas, demoSite);

  await client.query("COMMIT");

  console.log(
    JSON.stringify(
      {
        status: "pass",
        seed: seedTag,
        company_id: companyId,
        date_range: `${demoDates.manual}..${demoDates.regularization}`,
        date_strategy:
          "rolling four-day window ending on the seed execution date",
        timezone: demoTimeZone,
        personas: {
          employee_manual: "E1",
          employee_geo: "E2",
          reviewer: "D1",
          admin: "ADM",
          auditor: "AUD",
        },
        records: stats,
        safety:
          "Synthetic attendance demo rows only; no production guard override was required for this target.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

function uuidFromName(name: string): string {
  const hash = createHash("sha256").update(name).digest("hex");
  const variant = (8 + (Number.parseInt(hash.slice(16, 17), 16) % 4)).toString(
    16,
  );
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function buildDemoDates(now: Date, timeZone: string): DemoDates {
  const attendanceDate = formatDateInTimeZone(now, timeZone);
  return {
    manual: addDays(attendanceDate, -3),
    geo: addDays(attendanceDate, -2),
    fallback: addDays(attendanceDate, -1),
    regularization: attendanceDate,
  };
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateString: string, days: number): string {
  const dateParts = dateString
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  if (
    dateParts.length !== 3 ||
    dateParts.some((part) => !Number.isInteger(part))
  ) {
    throw new Error(`Invalid attendance demo date "${dateString}".`);
  }
  const [year, month, day] = dateParts as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function buildDemoIds(dates: DemoDates): {
  workSite: string;
  geofence: string;
  geofenceVersion: string;
  manualInPunch: string;
  manualOutPunch: string;
  geoInPunch: string;
  geoOutPunch: string;
  fallbackOriginalCommand: string;
  fallbackCommand: string;
  fallbackCommandDecision: string;
  fallbackAuditDecision: string;
  fallbackAttendanceEvent: string;
  fallbackLocationEvidence: string;
  fallbackDecisionReason: string;
  fallbackClientEvent: string;
  fallbackSubmitClientEvent: string;
  fallbackPunch: string;
  fallbackReview: string;
  manualDay: string;
  geoDay: string;
  fallbackDay: string;
  regularizationDay: string;
  regularizationRequest: string;
  regularizationItemIn: string;
  regularizationItemOut: string;
  regularizationSubmittedAction: string;
} {
  const windowNamespace = `${seedTag}:${dates.manual}:${dates.regularization}`;
  return {
    workSite: uuidFromName("geo-s15-016-synthetic-work-site"),
    geofence: uuidFromName("geo-s15-016-synthetic-geofence"),
    geofenceVersion: uuidFromName("geo-s15-016-synthetic-geofence-version-1"),
    manualInPunch: uuidFromName(`${windowNamespace}:manual-in-punch`),
    manualOutPunch: uuidFromName(`${windowNamespace}:manual-out-punch`),
    geoInPunch: uuidFromName(`${windowNamespace}:geo-in-punch`),
    geoOutPunch: uuidFromName(`${windowNamespace}:geo-out-punch`),
    fallbackOriginalCommand: uuidFromName(
      `${windowNamespace}:fallback-original-command`,
    ),
    fallbackCommand: uuidFromName(`${windowNamespace}:fallback-command`),
    fallbackCommandDecision: uuidFromName(
      `${windowNamespace}:fallback-command-decision`,
    ),
    fallbackAuditDecision: uuidFromName(
      `${windowNamespace}:fallback-audit-decision`,
    ),
    fallbackAttendanceEvent: uuidFromName(
      `${windowNamespace}:fallback-attendance-event`,
    ),
    fallbackLocationEvidence: uuidFromName(
      `${windowNamespace}:fallback-location-evidence`,
    ),
    fallbackDecisionReason: uuidFromName(
      `${windowNamespace}:fallback-decision-reason`,
    ),
    fallbackClientEvent: uuidFromName(
      `${windowNamespace}:fallback-client-event`,
    ),
    fallbackSubmitClientEvent: uuidFromName(
      `${windowNamespace}:fallback-submit-client-event`,
    ),
    fallbackPunch: uuidFromName(`${windowNamespace}:fallback-punch`),
    fallbackReview: uuidFromName(`${windowNamespace}:fallback-review`),
    manualDay: uuidFromName(`${windowNamespace}:manual-day`),
    geoDay: uuidFromName(`${windowNamespace}:geo-day`),
    fallbackDay: uuidFromName(`${windowNamespace}:fallback-day`),
    regularizationDay: uuidFromName(`${windowNamespace}:regularization-day`),
    regularizationRequest: uuidFromName(
      `${windowNamespace}:regularization-request`,
    ),
    regularizationItemIn: uuidFromName(
      `${windowNamespace}:regularization-item-in`,
    ),
    regularizationItemOut: uuidFromName(
      `${windowNamespace}:regularization-item-out`,
    ),
    regularizationSubmittedAction: uuidFromName(
      `${windowNamespace}:regularization-action-submitted`,
    ),
  };
}

function assertSafeSeedTarget(connectionString: string): void {
  const markers = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.HRMS_ENV,
    process.env.HRMS_ENV_FILE,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bprod(uction)?\b/u.test(markers) || markers.includes(".env.prod")) {
    throw new Error(
      `${seedTag} demo seed refused to run against a production-marked environment.`,
    );
  }

  let host = "";
  try {
    host = new URL(connectionString).hostname.toLowerCase();
  } catch {
    throw new Error(
      "DATABASE_URL is not a parseable PostgreSQL connection string.",
    );
  }

  const localHosts = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "host.docker.internal",
  ]);
  const looksLocal =
    localHosts.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./u.test(host) ||
    host.startsWith("10.") ||
    host.startsWith("192.168.");

  if (!looksLocal && process.env[safeRemoteOverride] !== "true") {
    throw new Error(
      `${seedTag} demo seed refused remote database host "${host}". Set ${safeRemoteOverride}=true only for an approved non-production QA/staging target.`,
    );
  }
}

async function loadReleasePersonas(
  pg: Client,
): Promise<
  Record<
    PersonaCode,
    { id: string; employee_code: PersonaCode; full_name: string }
  >
> {
  const result = await pg.query<{
    id: string;
    employee_code: PersonaCode;
    full_name: string;
  }>(
    `SELECT id, employee_code, full_name
     FROM core.users
     WHERE employee_code = ANY($1::text[])
       AND deleted_at IS NULL`,
    [personaCodes],
  );
  const byCode = new Map(result.rows.map((row) => [row.employee_code, row]));
  const missing = personaCodes.filter((code) => !byCode.has(code));
  if (missing.length) {
    throw new Error(
      `Missing release seed personas ${missing.join(", ")}. Run pnpm release:seed before ${seedTag}.`,
    );
  }
  return Object.fromEntries(
    personaCodes.map((code) => [code, byCode.get(code)!]),
  ) as Record<
    PersonaCode,
    { id: string; employee_code: PersonaCode; full_name: string }
  >;
}

async function ensureDefaultCompany(pg: Client): Promise<string> {
  const existing = await pg.query<{ id: string }>(
    `SELECT id
     FROM platform.company_profiles
     WHERE company_slug = 'hawkaii-hrms'
     LIMIT 1`,
  );
  const companyId = existing.rows[0]?.id ?? defaultCompanyId;

  await pg.query(
    `INSERT INTO platform.company_profiles (
       id, company_name, company_slug, website, industry, address, timezone, locale, currency,
       fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
       logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
       status, bootstrap_completed_at, created_at, updated_at, version
     )
     VALUES (
       $1, 'Hawkaii HRMS', 'hawkaii-hrms', NULL, NULL, NULL, 'Asia/Kolkata', 'en-IN', 'INR',
       4, 'Mon-Fri', 8, NULL, NULL, NULL, NULL, NULL, NULL,
       'active', now(), now(), now(), 1
     )
     ON CONFLICT (id) DO UPDATE
     SET company_slug = EXCLUDED.company_slug,
         timezone = EXCLUDED.timezone,
         locale = EXCLUDED.locale,
         currency = EXCLUDED.currency,
         working_week = EXCLUDED.working_week,
         work_hours_per_day = EXCLUDED.work_hours_per_day,
         status = 'active',
         bootstrap_completed_at = COALESCE(platform.company_profiles.bootstrap_completed_at, now()),
         updated_at = now()`,
    [companyId],
  );
  return companyId;
}

async function resolveSeedCompanyId(
  pg: Client,
  personas: Record<PersonaCode, { id: string }>,
  fallbackCompanyId: string,
): Promise<string> {
  const result = await pg.query<{ company_id: string }>(
    `SELECT company_id
     FROM platform.user_session_preferences
     WHERE user_id = ANY($1::uuid[])
       AND company_id IS NOT NULL
     GROUP BY company_id
     ORDER BY count(*) DESC, company_id
     LIMIT 1`,
    [personaCodes.map((code) => personas[code].id)],
  );
  return result.rows[0]?.company_id ?? fallbackCompanyId;
}

async function ensurePersonaPreferences(
  pg: Client,
  personas: Record<PersonaCode, { id: string }>,
  companyId: string,
): Promise<void> {
  for (const code of personaCodes) {
    await pg.query(
      `INSERT INTO platform.user_session_preferences (
         id, user_id, active_role, company_id, landing_page, locale, timezone,
         created_at, updated_at, version
       )
       VALUES ($1, $2, $3, $4, '/dashboard', 'en-IN', 'Asia/Kolkata', now(), now(), 1)
       ON CONFLICT (user_id) DO UPDATE
       SET company_id = COALESCE(platform.user_session_preferences.company_id, EXCLUDED.company_id),
           updated_at = CASE
             WHEN platform.user_session_preferences.company_id IS NULL THEN now()
             ELSE platform.user_session_preferences.updated_at
           END`,
      [
        uuidFromName(`session-preference-${personas[code].id}`),
        personas[code].id,
        preferredRoles[code],
        companyId,
      ],
    );
  }
}

async function seedWorkSiteAndGeofence(
  pg: Client,
  companyId: string,
  adminUserId: string,
): Promise<DemoSiteIds> {
  const workSiteResult = await pg.query<{ id: string }>(
    `INSERT INTO attendance.work_sites (
       id, company_id, site_code, name, site_type, timezone, is_active, metadata,
       created_by_user_id, updated_by_user_id, created_at, updated_at, deleted_at, version
     )
     VALUES (
       $1, $2, 'S15-DEMO-HQ', 'S15 Synthetic Demo Site', 'office', 'Asia/Kolkata', true,
       $3::jsonb, $4, $4, now(), now(), NULL, 1
     )
     ON CONFLICT (company_id, site_code) WHERE deleted_at IS NULL DO UPDATE
     SET name = EXCLUDED.name,
         site_type = EXCLUDED.site_type,
         timezone = EXCLUDED.timezone,
         is_active = true,
         metadata = EXCLUDED.metadata,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now(),
         deleted_at = NULL,
         version = attendance.work_sites.version + 1
     RETURNING id`,
    [
      ids.workSite,
      companyId,
      JSON.stringify({ demo_seed: seedTag, synthetic: true }),
      adminUserId,
    ],
  );
  const workSiteId = workSiteResult.rows[0]?.id;
  if (!workSiteId) {
    throw new Error(`${seedTag} demo seed could not resolve demo work site.`);
  }

  const geofenceResult = await pg.query<{ id: string }>(
    `INSERT INTO attendance.geofences (
       id, company_id, work_site_id, geofence_code, name, is_active,
       current_published_version_id, metadata, created_by_user_id, updated_by_user_id,
       created_at, updated_at, deleted_at, version
     )
     VALUES (
       $1, $2, $3, 'S15-DEMO-GEOFENCE', 'S15 Synthetic Demo Perimeter', true,
       NULL, $4::jsonb, $5, $5, now(), now(), NULL, 1
     )
     ON CONFLICT (company_id, work_site_id, geofence_code) WHERE deleted_at IS NULL DO UPDATE
     SET name = EXCLUDED.name,
         is_active = true,
         metadata = EXCLUDED.metadata,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now(),
         deleted_at = NULL,
         version = attendance.geofences.version + 1
     RETURNING id`,
    [
      ids.geofence,
      companyId,
      workSiteId,
      JSON.stringify({ demo_seed: seedTag, synthetic: true }),
      adminUserId,
    ],
  );
  const geofenceId = geofenceResult.rows[0]?.id;
  if (!geofenceId) {
    throw new Error(`${seedTag} demo seed could not resolve demo geofence.`);
  }

  const geofenceVersionResult = await pg.query<{ id: string }>(
    `INSERT INTO attendance.geofence_versions (
       id, company_id, geofence_id, version_number, version_status, shape_type, shape,
       circle_radius_meters, shape_metadata, created_by_user_id, created_at,
       published_by_user_id, published_at
     )
     VALUES (
       $1, $2, $3, 1, 'published', 'circle',
       ST_SetSRID(ST_MakePoint($4, $5), 4326), 250,
       $6::jsonb, $7, now(), $7, now()
     )
     ON CONFLICT (company_id, geofence_id, version_number) DO UPDATE
     SET version_status = EXCLUDED.version_status,
         shape_type = EXCLUDED.shape_type,
         shape = EXCLUDED.shape,
         circle_radius_meters = EXCLUDED.circle_radius_meters,
         shape_metadata = EXCLUDED.shape_metadata,
         published_by_user_id = EXCLUDED.published_by_user_id,
         published_at = COALESCE(attendance.geofence_versions.published_at, EXCLUDED.published_at)
     RETURNING id`,
    [
      ids.geofenceVersion,
      companyId,
      geofenceId,
      demoCoordinate.longitude,
      demoCoordinate.latitude,
      JSON.stringify({ demo_seed: seedTag, synthetic: true }),
      adminUserId,
    ],
  );
  const geofenceVersionId = geofenceVersionResult.rows[0]?.id;
  if (!geofenceVersionId) {
    throw new Error(
      `${seedTag} demo seed could not resolve demo geofence version.`,
    );
  }

  await pg.query(
    `UPDATE attendance.geofences
     SET current_published_version_id = $1,
         updated_by_user_id = $4,
         updated_at = now()
     WHERE company_id = $2
       AND id = $3
       AND deleted_at IS NULL`,
    [geofenceVersionId, companyId, geofenceId, adminUserId],
  );

  return { workSiteId, geofenceId };
}

async function seedAttendanceRecords(
  pg: Client,
  companyId: string,
  personas: Record<PersonaCode, { id: string }>,
  demoSite: DemoSiteIds,
): Promise<void> {
  await insertPunch(pg, {
    id: ids.manualInPunch,
    companyId,
    employeeUserId: personas.E1.id,
    actorUserId: personas.E1.id,
    eventType: "check_in",
    occurredAt: `${demoDates.manual}T09:03:00+05:30`,
    source: "web",
    origin: "employee_manual_now",
    scenario: "manual_attendance",
  });
  await insertPunch(pg, {
    id: ids.manualOutPunch,
    companyId,
    employeeUserId: personas.E1.id,
    actorUserId: personas.E1.id,
    eventType: "check_out",
    occurredAt: `${demoDates.manual}T17:35:00+05:30`,
    source: "web",
    origin: "employee_manual_now",
    scenario: "manual_attendance",
  });

  await insertPunch(pg, {
    id: ids.geoInPunch,
    companyId,
    employeeUserId: personas.E2.id,
    actorUserId: personas.E2.id,
    eventType: "check_in",
    occurredAt: `${demoDates.geo}T09:00:00+05:30`,
    source: "web_geo",
    origin: "employee_manual_now",
    scenario: "geo_attendance",
  });
  await insertPunch(pg, {
    id: ids.geoOutPunch,
    companyId,
    employeeUserId: personas.E2.id,
    actorUserId: personas.E2.id,
    eventType: "check_out",
    occurredAt: `${demoDates.geo}T17:31:00+05:30`,
    source: "web_geo",
    origin: "employee_manual_now",
    scenario: "geo_attendance",
  });

  await seedFallbackReview(pg, companyId, personas, demoSite);
  await seedRegularization(pg, companyId, personas);

  await insertDailyRecord(pg, {
    id: ids.manualDay,
    companyId,
    employeeUserId: personas.E1.id,
    workDate: demoDates.manual,
    status: "present",
    dayClassification: "working_day",
    presenceState: "present",
    punctualityState: "on_time",
    evidenceState: "complete",
    approvalKind: "none",
    approvalState: "not_required",
    firstCheckIn: `${demoDates.manual}T09:03:00+05:30`,
    lastCheckOut: `${demoDates.manual}T17:35:00+05:30`,
    workMinutes: 512,
    workSeconds: 30720,
    workMode: "office",
    note: "Sprint 15 demo: manual web attendance day.",
    exceptionType: null,
    regularizationStatus: null,
  });

  await insertDailyRecord(pg, {
    id: ids.geoDay,
    companyId,
    employeeUserId: personas.E2.id,
    workDate: demoDates.geo,
    status: "present",
    dayClassification: "working_day",
    presenceState: "present",
    punctualityState: "on_time",
    evidenceState: "complete",
    approvalKind: "none",
    approvalState: "not_required",
    firstCheckIn: `${demoDates.geo}T09:00:00+05:30`,
    lastCheckOut: `${demoDates.geo}T17:31:00+05:30`,
    workMinutes: 511,
    workSeconds: 30660,
    workMode: "office",
    note: "Sprint 15 demo: web geo attendance day.",
    exceptionType: null,
    regularizationStatus: null,
  });

  await insertDailyRecord(pg, {
    id: ids.fallbackDay,
    companyId,
    employeeUserId: personas.E1.id,
    workDate: demoDates.fallback,
    status: "late",
    dayClassification: "working_day",
    presenceState: "incomplete",
    punctualityState: "late",
    evidenceState: "partial",
    approvalKind: "none",
    approvalState: "not_required",
    firstCheckIn: `${demoDates.fallback}T09:26:00+05:30`,
    lastCheckOut: null,
    workMinutes: 0,
    workSeconds: 0,
    workMode: "office",
    note: "Sprint 15 demo: geo manual fallback awaiting manager review.",
    exceptionType: "missing_punch",
    regularizationStatus: null,
    lateMinutes: 26,
    lateSeconds: 1560,
  });

  await insertDailyRecord(pg, {
    id: ids.regularizationDay,
    companyId,
    employeeUserId: personas.E2.id,
    workDate: demoDates.regularization,
    status: "absent",
    dayClassification: "working_day",
    presenceState: "absent",
    punctualityState: "not_applicable",
    evidenceState: "missing",
    approvalKind: "regularization",
    approvalState: "pending",
    firstCheckIn: null,
    lastCheckOut: null,
    workMinutes: 0,
    workSeconds: 0,
    workMode: "office",
    note: "Sprint 15 demo: pending attendance regularization.",
    exceptionType: "absent",
    regularizationStatus: "pending",
  });
}

async function insertPunch(
  pg: Client,
  input: {
    id: string;
    companyId: string;
    employeeUserId: string;
    actorUserId: string;
    eventType: string;
    occurredAt: string;
    source: string;
    origin: string;
    scenario: string;
    commandExecutionId?: string | null;
    decisionId?: string | null;
  },
): Promise<void> {
  const metadata = {
    demo_seed: seedTag,
    scenario: input.scenario,
    synthetic: true,
  };
  await track(
    "punches",
    pg.query(
      `INSERT INTO attendance.punch_events (
         id, company_id, employee_user_id, actor_user_id, event_type, occurred_at,
         work_mode, source, origin, regularization_request_id, metadata,
         command_execution_id, session_id, decision_id, created_at, deleted_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, 'office', $7, $8, NULL, $9::jsonb,
         $10, NULL, $11, now(), NULL
       )
       ON CONFLICT (id) DO UPDATE
       SET company_id = EXCLUDED.company_id,
           employee_user_id = EXCLUDED.employee_user_id,
           actor_user_id = EXCLUDED.actor_user_id,
           event_type = EXCLUDED.event_type,
           occurred_at = EXCLUDED.occurred_at,
           work_mode = EXCLUDED.work_mode,
           source = EXCLUDED.source,
           origin = EXCLUDED.origin,
           metadata = EXCLUDED.metadata,
           command_execution_id = EXCLUDED.command_execution_id,
           decision_id = EXCLUDED.decision_id,
           deleted_at = NULL
       WHERE attendance.punch_events.metadata->>'demo_seed' = $12`,
      [
        input.id,
        input.companyId,
        input.employeeUserId,
        input.actorUserId,
        input.eventType,
        input.occurredAt,
        input.source,
        input.origin,
        JSON.stringify(metadata),
        input.commandExecutionId ?? null,
        input.decisionId ?? null,
        seedTag,
      ],
    ),
  );
}

async function seedFallbackReview(
  pg: Client,
  companyId: string,
  personas: Record<PersonaCode, { id: string }>,
  demoSite: DemoSiteIds,
): Promise<void> {
  const occurredAt = `${demoDates.fallback}T09:26:00+05:30`;
  const receivedAt = `${demoDates.fallback}T09:26:05+05:30`;
  const clientEventId = ids.fallbackClientEvent;
  const fallbackClientEventId = ids.fallbackSubmitClientEvent;
  const geoPolicy = {
    demo_seed: seedTag,
    factual_outcome: "outside_confident",
    selected_action: "manual_fallback",
    fallback_used: true,
    allowed: true,
    work_site_id: demoSite.workSiteId,
    work_site_name: "S15 Synthetic Demo Site",
    work_site_type: "office",
    geofence_id: demoSite.geofenceId,
  };
  const manualFallback = {
    eligible: true,
    review_required: true,
    reason_code: "geo_outside_fence",
    reference: ids.fallbackCommandDecision,
  };
  const originalRequest = {
    demo_seed: seedTag,
    event_type: "check_in",
    work_mode: "office",
    source: "web_geo",
    metadata: { demo_seed: seedTag, scenario: "geo_manual_fallback" },
    envelope: { client_event_id: clientEventId },
  };
  const originalResponse = {
    code: "ATTENDANCE_GEO_MANUAL_FALLBACK",
    message: "Synthetic demo fallback requires manager review.",
    details: {
      geo_policy: geoPolicy,
      manual_fallback: manualFallback,
    },
  };

  await insertCommandExecution(pg, {
    id: ids.fallbackOriginalCommand,
    companyId,
    actorUserId: personas.E1.id,
    employeeUserId: personas.E1.id,
    idempotencyKey: `s15-demo-fallback-original-${demoDates.fallback}`,
    clientEventId,
    requestSnapshot: originalRequest,
    responseSnapshot: originalResponse,
    commandType: "check_in",
    commandOrigin: "employee_manual_now",
    occurredAt,
    status: "denied",
    punchEventId: null,
    responseStatus: 409,
  });

  await track(
    "commands",
    pg.query(
      `INSERT INTO attendance.command_decisions (
         id, command_execution_id, company_id, employee_user_id, outcome,
         reason_code, reason_detail, previous_state, next_state,
         policy_snapshot, evidence_snapshot, created_at
       )
       VALUES (
         $1, $2, $3, $4, 'denied', 'geo_outside_fence',
         'Synthetic demo location was outside the configured perimeter.',
         'not_checked_in', 'not_checked_in', $5::jsonb, $6::jsonb, now()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.fallbackCommandDecision,
        ids.fallbackOriginalCommand,
        companyId,
        personas.E1.id,
        JSON.stringify({ demo_seed: seedTag, policy_key: "attendance.geo" }),
        JSON.stringify({
          demo_seed: seedTag,
          geo_policy: geoPolicy,
          manual_fallback: manualFallback,
        }),
      ],
    ),
  );

  await track(
    "commands",
    pg.query(
      `INSERT INTO attendance.attendance_events (
         id, company_id, employee_user_id, actor_user_id, command_execution_id,
         event_type, source, occurred_at, received_at, schema_version,
         payload, payload_hash, created_at
       )
       VALUES ($1,$2,$3,$4,$5,'check_in','web_geo',$6,$7,1,$8::jsonb,$9,now())
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.fallbackAttendanceEvent,
        companyId,
        personas.E1.id,
        personas.E1.id,
        ids.fallbackOriginalCommand,
        occurredAt,
        receivedAt,
        JSON.stringify({
          demo_seed: seedTag,
          event_type: "check_in",
          source_channel: "web_geo",
        }),
        hashJson({ seedTag, event: ids.fallbackAttendanceEvent }),
      ],
    ),
  );

  await track(
    "commands",
    pg.query(
      `INSERT INTO attendance.location_evidence (
         id, attendance_event_id, company_id, employee_user_id, captured_at,
         received_at, latitude, longitude, accuracy_meters, altitude_meters,
         provider, is_mocked, integrity_status, raw_payload, age_ms,
         permission_state, coordinates_expire_at, coordinate_retention_class,
         coordinate_retention_seconds, retention_policy_version_id, coordinates_purged_at
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,'browser',false,'ok',$10::jsonb,
         5000,'granted','2036-10-08T00:00:00Z','sprint_15_demo',315360000,NULL,NULL
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.fallbackLocationEvidence,
        ids.fallbackAttendanceEvent,
        companyId,
        personas.E1.id,
        occurredAt,
        receivedAt,
        demoCoordinate.latitude,
        demoCoordinate.longitude,
        demoCoordinate.accuracyMeters,
        JSON.stringify({ demo_seed: seedTag, synthetic: true }),
      ],
    ),
  );

  await track(
    "commands",
    pg.query(
      `INSERT INTO attendance.attendance_decisions (
         id, company_id, employee_user_id, attendance_event_id, command_execution_id,
         decision_type, outcome, policy_key, policy_version, evaluator_version,
         evaluated_at, evidence_digest, policy_snapshot, evaluation_context, created_at
       )
       VALUES (
         $1,$2,$3,$4,$5,'geo_policy','failed','attendance.geo','s15-demo-v1',
         's15-demo-evaluator',$6,$7,$8::jsonb,$9::jsonb,now()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.fallbackAuditDecision,
        companyId,
        personas.E1.id,
        ids.fallbackAttendanceEvent,
        ids.fallbackOriginalCommand,
        receivedAt,
        sha256(`${seedTag}:${ids.fallbackAuditDecision}`),
        JSON.stringify({ demo_seed: seedTag, policy_key: "attendance.geo" }),
        JSON.stringify({ demo_seed: seedTag, geo_policy: geoPolicy }),
      ],
    ),
  );

  await track(
    "commands",
    pg.query(
      `INSERT INTO attendance.decision_reasons (
         id, attendance_decision_id, company_id, reason_code, category,
         severity, ordinal, details, created_at
       )
       VALUES (
         $1,$2,$3,'geo_outside_fence','geo','warning',0,$4::jsonb,now()
       )
       ON CONFLICT (attendance_decision_id, ordinal) DO NOTHING`,
      [
        ids.fallbackDecisionReason,
        ids.fallbackAuditDecision,
        companyId,
        JSON.stringify({ demo_seed: seedTag, synthetic: true }),
      ],
    ),
  );

  await insertCommandExecution(pg, {
    id: ids.fallbackCommand,
    companyId,
    actorUserId: personas.E1.id,
    employeeUserId: personas.E1.id,
    idempotencyKey: `s15-demo-fallback-submit-${demoDates.fallback}`,
    clientEventId: fallbackClientEventId,
    requestSnapshot: {
      demo_seed: seedTag,
      event_type: "check_in",
      work_mode: "office",
      source: "web_geo",
      metadata: {
        demo_seed: seedTag,
        scenario: "geo_manual_fallback",
        geo_manual_fallback: true,
        original_geo_command_id: ids.fallbackOriginalCommand,
        original_geo_decision_id: ids.fallbackCommandDecision,
      },
      envelope: { client_event_id: fallbackClientEventId },
    },
    responseSnapshot: {
      code: "ATTENDANCE_PUNCH_RECORDED",
      message: "Synthetic demo fallback punch recorded for review.",
    },
    commandType: "check_in",
    commandOrigin: "employee_manual_now",
    occurredAt,
    status: "completed",
    punchEventId: ids.fallbackPunch,
    responseStatus: 200,
  });

  await insertPunch(pg, {
    id: ids.fallbackPunch,
    companyId,
    employeeUserId: personas.E1.id,
    actorUserId: personas.E1.id,
    eventType: "check_in",
    occurredAt,
    source: "web_geo",
    origin: "employee_manual_now",
    scenario: "geo_manual_fallback",
    commandExecutionId: ids.fallbackCommand,
    decisionId: ids.fallbackCommandDecision,
  });

  await track(
    "fallbackReviews",
    pg.query(
      `INSERT INTO attendance.geo_fallback_reviews (
         id, company_id, employee_user_id, submitted_by_user_id,
         current_approver_user_id, original_command_id, original_decision_id,
         fallback_command_id, punch_event_id, event_type, work_date, occurred_at,
         reason_code, reason_detail, geo_policy, status, decision_remarks,
         decided_by_user_id, decided_at, version, created_at, updated_at, deleted_at
       )
       VALUES (
         $1,$2,$3,$3,$4,$5,$6,$7,$8,'check_in',$9,$10,'geo_outside_fence',
         'Synthetic demo fallback awaiting manager review.',$11::jsonb,'pending',
         NULL,NULL,NULL,1,now(),now(),NULL
       )
       ON CONFLICT (company_id, original_decision_id) DO UPDATE
       SET current_approver_user_id = EXCLUDED.current_approver_user_id,
           fallback_command_id = EXCLUDED.fallback_command_id,
           punch_event_id = EXCLUDED.punch_event_id,
           event_type = EXCLUDED.event_type,
           work_date = EXCLUDED.work_date,
           occurred_at = EXCLUDED.occurred_at,
           reason_code = EXCLUDED.reason_code,
           reason_detail = EXCLUDED.reason_detail,
           geo_policy = EXCLUDED.geo_policy,
           status = 'pending',
           decision_remarks = NULL,
           decided_by_user_id = NULL,
           decided_at = NULL,
           version = 1,
           updated_at = now(),
           deleted_at = NULL
       WHERE attendance.geo_fallback_reviews.geo_policy->>'demo_seed' = $12`,
      [
        ids.fallbackReview,
        companyId,
        personas.E1.id,
        personas.D1.id,
        ids.fallbackOriginalCommand,
        ids.fallbackCommandDecision,
        ids.fallbackCommand,
        ids.fallbackPunch,
        demoDates.fallback,
        occurredAt,
        JSON.stringify(geoPolicy),
        seedTag,
      ],
    ),
  );
}

async function insertCommandExecution(
  pg: Client,
  input: {
    id: string;
    companyId: string;
    actorUserId: string;
    employeeUserId: string;
    idempotencyKey: string;
    clientEventId: string;
    requestSnapshot: Record<string, unknown>;
    responseSnapshot: Record<string, unknown>;
    commandType: string;
    commandOrigin: string;
    occurredAt: string;
    status: "denied" | "completed";
    punchEventId: string | null;
    responseStatus: number;
  },
): Promise<void> {
  await track(
    "commands",
    pg.query(
      `INSERT INTO attendance.command_executions (
         id, company_id, actor_user_id, employee_user_id, platform_idempotency_key_id,
         idempotency_key, client_event_id, request_hash, command_type, command_origin,
         occurred_at, status, session_id, punch_event_id, request_snapshot,
         response_snapshot, response_hash, response_status, completed_at, created_at
       )
       VALUES (
         $1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13::jsonb,
         $14::jsonb,$15,$16,$10,now()
       )
       ON CONFLICT (id) DO UPDATE
       SET request_snapshot = EXCLUDED.request_snapshot,
           response_snapshot = EXCLUDED.response_snapshot,
           response_hash = EXCLUDED.response_hash,
           response_status = EXCLUDED.response_status,
           status = EXCLUDED.status,
           punch_event_id = EXCLUDED.punch_event_id,
           completed_at = EXCLUDED.completed_at
       WHERE attendance.command_executions.request_snapshot->>'demo_seed' = $17`,
      [
        input.id,
        input.companyId,
        input.actorUserId,
        input.employeeUserId,
        input.idempotencyKey,
        input.clientEventId,
        hashJson(input.requestSnapshot),
        input.commandType,
        input.commandOrigin,
        input.occurredAt,
        input.status,
        input.punchEventId,
        JSON.stringify(input.requestSnapshot),
        JSON.stringify(input.responseSnapshot),
        hashJson(input.responseSnapshot),
        input.responseStatus,
        seedTag,
      ],
    ),
  );
}

async function seedRegularization(
  pg: Client,
  companyId: string,
  personas: Record<PersonaCode, { id: string }>,
): Promise<void> {
  const requestedPunches = [
    {
      event_type: "check_in",
      occurred_at: `${demoDates.regularization}T09:10:00+05:30`,
    },
    {
      event_type: "check_out",
      occurred_at: `${demoDates.regularization}T17:25:00+05:30`,
    },
  ];

  await track(
    "regularizations",
    pg.query(
      `INSERT INTO attendance.regularization_requests (
         id, company_id, employee_user_id, submitted_by_user_id, work_date, reason,
         requested_punches, status, current_approver_user_id, decision_remarks,
         decided_by_user_id, decided_at, version, created_at, updated_at, deleted_at
       )
       VALUES (
         $1,$2,$3,$3,$4,'Sprint 15 demo: employee submitted missing attendance punches.',
         $5::jsonb,'pending',$6,NULL,NULL,NULL,1,now(),now(),NULL
       )
       ON CONFLICT (id) DO UPDATE
       SET reason = EXCLUDED.reason,
           requested_punches = EXCLUDED.requested_punches,
           status = 'pending',
           current_approver_user_id = EXCLUDED.current_approver_user_id,
           decision_remarks = NULL,
           decided_by_user_id = NULL,
           decided_at = NULL,
           version = 1,
           updated_at = now(),
           deleted_at = NULL
       WHERE attendance.regularization_requests.reason LIKE 'Sprint 15 demo:%'`,
      [
        ids.regularizationRequest,
        companyId,
        personas.E2.id,
        demoDates.regularization,
        JSON.stringify(requestedPunches),
        personas.D1.id,
      ],
    ),
  );

  await track(
    "regularizations",
    pg.query(
      `INSERT INTO attendance.regularization_request_items (
         id, company_id, regularization_request_id, ordinal, operation,
         target_punch_event_id, event_type, occurred_at, created_at
       )
       VALUES
         ($1,$2,$3,0,'add',NULL,'check_in',$4,now()),
         ($5,$2,$3,1,'add',NULL,'check_out',$6,now())
       ON CONFLICT (regularization_request_id, ordinal) DO NOTHING`,
      [
        ids.regularizationItemIn,
        companyId,
        ids.regularizationRequest,
        `${demoDates.regularization}T09:10:00+05:30`,
        ids.regularizationItemOut,
        `${demoDates.regularization}T17:25:00+05:30`,
      ],
    ),
  );

  await track(
    "regularizations",
    pg.query(
      `INSERT INTO attendance.regularization_actions (
         id, company_id, regularization_request_id, actor_user_id,
         subject_employee_user_id, action_kind, previous_state, resulting_state,
         remarks, resulting_version, occurred_at, migration_reconstructed
       )
       VALUES (
         $1,$2,$3,$4,$4,'submitted',NULL,'pending',NULL,1,now(),false
       )
       ON CONFLICT (regularization_request_id, resulting_version) DO NOTHING`,
      [
        ids.regularizationSubmittedAction,
        companyId,
        ids.regularizationRequest,
        personas.E2.id,
      ],
    ),
  );
}

async function insertDailyRecord(
  pg: Client,
  input: {
    id: string;
    companyId: string;
    employeeUserId: string;
    workDate: string;
    status: string;
    dayClassification: string;
    presenceState: string;
    punctualityState: string;
    evidenceState: string;
    approvalKind: string;
    approvalState: string;
    firstCheckIn: string | null;
    lastCheckOut: string | null;
    workMinutes: number;
    workSeconds: number;
    workMode: string;
    note: string;
    exceptionType: string | null;
    regularizationStatus: string | null;
    lateMinutes?: number;
    lateSeconds?: number;
  },
): Promise<void> {
  const result = await pg.query(
    `INSERT INTO attendance.daily_records (
       id, company_id, employee_user_id, work_date, status, day_classification,
       presence_state, punctuality_state, evidence_state, approval_kind, approval_state,
       payroll_state, first_check_in, last_check_out, work_minutes, break_minutes,
       late_minutes, early_out_minutes, work_seconds, break_seconds, scheduled_seconds,
       late_seconds, early_departure_seconds, work_mode, note, exception_type,
       regularization_status, version, created_at, updated_at, deleted_at
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'unprocessed',$12,$13,$14,0,
       $15,0,$16,0,28800,$17,0,$18,$19,$20,$21,1,now(),now(),NULL
     )
     ON CONFLICT (company_id, employee_user_id, work_date) DO UPDATE
     SET status = EXCLUDED.status,
         day_classification = EXCLUDED.day_classification,
         presence_state = EXCLUDED.presence_state,
         punctuality_state = EXCLUDED.punctuality_state,
         evidence_state = EXCLUDED.evidence_state,
         approval_kind = EXCLUDED.approval_kind,
         approval_state = EXCLUDED.approval_state,
         payroll_state = EXCLUDED.payroll_state,
         first_check_in = EXCLUDED.first_check_in,
         last_check_out = EXCLUDED.last_check_out,
         work_minutes = EXCLUDED.work_minutes,
         break_minutes = EXCLUDED.break_minutes,
         late_minutes = EXCLUDED.late_minutes,
         early_out_minutes = EXCLUDED.early_out_minutes,
         work_seconds = EXCLUDED.work_seconds,
         break_seconds = EXCLUDED.break_seconds,
         scheduled_seconds = EXCLUDED.scheduled_seconds,
         late_seconds = EXCLUDED.late_seconds,
         early_departure_seconds = EXCLUDED.early_departure_seconds,
         work_mode = EXCLUDED.work_mode,
         note = EXCLUDED.note,
         exception_type = EXCLUDED.exception_type,
         regularization_status = EXCLUDED.regularization_status,
         updated_at = now(),
         deleted_at = NULL
     WHERE attendance.daily_records.note LIKE 'Sprint 15 demo:%'`,
    [
      input.id,
      input.companyId,
      input.employeeUserId,
      input.workDate,
      input.status,
      input.dayClassification,
      input.presenceState,
      input.punctualityState,
      input.evidenceState,
      input.approvalKind,
      input.approvalState,
      input.firstCheckIn,
      input.lastCheckOut,
      input.workMinutes,
      input.lateMinutes ?? 0,
      input.workSeconds,
      input.lateSeconds ?? 0,
      input.workMode,
      input.note,
      input.exceptionType,
      input.regularizationStatus,
    ],
  );

  if ((result.rowCount ?? 0) > 0) {
    stats.dailyRecords += result.rowCount ?? 0;
  } else {
    stats.skippedDailyRecords += 1;
  }
}

async function track(
  key: Exclude<
    keyof typeof stats,
    | "companyContext"
    | "workSites"
    | "geofences"
    | "dailyRecords"
    | "skippedDailyRecords"
  >,
  query: Promise<QueryResult>,
): Promise<void> {
  const result = await query;
  stats[key] += result.rowCount ?? 0;
}
