import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AttendanceApprovalState, AuthUser } from "#shared";
import {
  AttendanceApprovalStates,
  attendancePunchCommandEnvelopeSchema,
  attendancePunchSchema,
  attendanceAssistedCurrentPunchSchema,
  attendanceHistoricalCorrectionSchema,
  attendanceGeoFallbackDecisionSchema,
  attendanceGeoFallbackSubmitSchema,
  attendanceRegularizationCreateSchema,
  attendanceRegularizationDecisionSchema,
  isoDateTimeSchema,
  paginationQuerySchema,
} from "#shared";
import { badRequest, conflict, forbidden, unauthorized } from "../../platform/errors.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import { AttendanceService } from "./service.js";
import { AttendanceReportingEvidenceCategoryValues } from "./reporting-evidence.js";
import {
  AttendanceReportExportColumnValues,
  AttendanceReportSourceCategoryValues,
} from "./reporting-projection.js";
import { AttendancePayrollPeriodService } from "./payroll-period-service.js";
import { AttendanceOfflineSyncService } from "./offline-sync-service.js";
import { AttendanceGeoPolicySimulationService } from "./geo-policy-simulation-service.js";
import {
  ATTENDANCE_IDEMPOTENCY_REPLAY_HEADER,
  isAttendanceReplayResponse,
} from "./command-service.js";
import { attendanceOfflineBatchRequestSchema } from "./offline-sync-contract.js";
import { canManageAllAttendance } from "./policy.js";
import { PostgresAdminGeoRepository } from "./admin-geo-repository.js";

const idParamSchema = z.object({ id: z.uuid() });
const workSiteParamSchema = z.object({ workSiteId: z.uuid() });
const geofenceParamSchema = z.object({ geofenceId: z.uuid() });
const geofenceVersionParamSchema = z.object({
  geofenceId: z.uuid(),
  versionId: z.uuid(),
});
const geofencePublishParamSchema = z.object({
  geofenceId: z.uuid(),
  versionId: z.uuid(),
});
const employeeParamSchema = z.object({ employeeUserId: z.uuid() });
const isoDateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const monthQuerySchema = z.string().regex(/^\d{4}-\d{2}$/u);
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const clientEventIdHeaderSchema = z.uuid();
const attendanceApprovalStateValues = Object.values(AttendanceApprovalStates) as [
  AttendanceApprovalState,
  ...AttendanceApprovalState[],
];

const attendanceQuerySchema = paginationQuerySchema.extend({
  company_id: z.uuid().optional(),
  date: isoDateQuerySchema.optional(),
  date_from: isoDateQuerySchema.optional(),
  date_to: isoDateQuerySchema.optional(),
  month: monthQuerySchema.optional(),
  user_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  manager_user_id: z.uuid().optional(),
  status: z.string().optional(),
  evidence_category: z.enum(AttendanceReportingEvidenceCategoryValues).optional(),
  reporting_evidence_category: z
    .enum(AttendanceReportingEvidenceCategoryValues)
    .optional(),
  employee_search: z.string().trim().max(120).optional(),
  geo_outcome: z.string().trim().max(80).optional(),
  geo_action: z.string().trim().max(80).optional(),
  review_type: z.enum(["manual_fallback", "geo_decision"]).optional(),
  reason_code: z.string().trim().max(120).optional(),
  exception_type: z
    .enum(["late", "missing_punch", "absent", "early_out", "correction"])
    .optional(),
});
const attendanceExportFiltersSchema = z.object({
  user_id: z.uuid().optional(),
  employee_user_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  manager_user_id: z.uuid().optional(),
  status: z.string().optional(),
  evidence_category: z.enum(AttendanceReportingEvidenceCategoryValues).optional(),
  reporting_evidence_category: z
    .enum(AttendanceReportingEvidenceCategoryValues)
    .optional(),
  attendance_channel: z.string().trim().max(80).optional(),
  source_category: z.enum(AttendanceReportSourceCategoryValues).optional(),
  work_site_id: z.uuid().optional(),
  approval_state: z.enum(attendanceApprovalStateValues).optional(),
  geo_outcome: z.string().trim().max(80).optional(),
  geo_action: z.string().trim().max(80).optional(),
  review_type: z.enum(["manual_fallback", "geo_decision"]).optional(),
  reason_code: z.string().trim().max(120).optional(),
  report_mode: z
    .enum(["daily", "late", "early", "absent", "exceptions", "monthly_summary"])
    .optional(),
  date_from: isoDateQuerySchema.optional(),
  date_to: isoDateQuerySchema.optional(),
});

const attendanceExportSchema = z.object({
  company_id: z.uuid().optional(),
  filters: attendanceExportFiltersSchema.optional(),
  columns: z.array(z.enum(AttendanceReportExportColumnValues)).max(80).optional(),
  format: z.enum(["csv", "xlsx", "json"]).optional(),
});
const attendancePayrollPeriodCreateSchema = z.object({
  company_id: z.uuid().optional(),
  period_start: isoDateQuerySchema,
  period_end: isoDateQuerySchema,
});
const attendancePayrollPeriodActionSchema = z.object({
  company_id: z.uuid().optional(),
  reason: z.string().trim().max(1000).optional(),
});
const attendancePayrollPeriodUnlockSchema = z.object({
  company_id: z.uuid().optional(),
  reason: z.string().trim().min(1).max(1000),
});
const attendancePayrollPeriodSummaryQuerySchema = z.object({
  company_id: z.uuid().optional(),
});
const geofenceVersionPublishSchema = z
  .object({
    effectiveFrom: isoDateTimeSchema,
    effectiveUntil: isoDateTimeSchema.nullish(),
  })
  .strict();
const jsonObjectSchema = z.record(z.string(), z.unknown());
const expectedVersionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
const longitudeSchema = z
  .number()
  .refine((value) => Number.isFinite(value) && value >= -180 && value <= 180, {
    message: "Longitude must be between -180 and 180.",
  });
const latitudeSchema = z
  .number()
  .refine((value) => Number.isFinite(value) && value >= -90 && value <= 90, {
    message: "Latitude must be between -90 and 90.",
  });
const lngLatSchema = z.tuple([longitudeSchema, latitudeSchema]);
const workSiteCreateSchema = z
  .object({
    siteCode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(200),
    siteType: z.string().trim().min(1).max(80),
    timezone: z.string().trim().min(1).max(120),
    isActive: z.boolean().optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict();
const workSiteUpdateSchema = workSiteCreateSchema
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
const geofenceCreateSchema = z
  .object({
    geofenceCode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(200),
    isActive: z.boolean().optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict();
const geofenceUpdateSchema = geofenceCreateSchema
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
const circleVersionSchema = z
  .object({
    shapeType: z.literal("circle"),
    center: z.object({
      longitude: longitudeSchema,
      latitude: latitudeSchema,
    }),
    radiusMeters: z.number().positive().finite(),
    shapeMetadata: jsonObjectSchema.optional(),
  })
  .strict();
const polygonVersionSchema = z
  .object({
    shapeType: z.literal("polygon"),
    vertices: z.array(lngLatSchema).min(3).max(500),
    shapeMetadata: jsonObjectSchema.optional(),
  })
  .strict()
  .refine((value) => distinctCoordinateCount(value.vertices) >= 3, {
    message: "Polygon requires at least three distinct vertices.",
    path: ["vertices"],
  });
const geofenceVersionShapeSchema = z.discriminatedUnion("shapeType", [
  circleVersionSchema,
  polygonVersionSchema,
]);
const simulationPolicySourceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("effective_employee") }).strict(),
  z
    .object({
      mode: z.literal("persisted_policy"),
      policy_id: z.uuid(),
      version_id: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("draft_policy"),
      config: jsonObjectSchema,
    })
    .strict(),
]);
const simulationDraftCircleSchema = z
  .object({
    id: z.uuid().optional(),
    geofence_id: z.uuid().optional(),
    work_site_id: z.uuid().optional(),
    name: z.string().trim().max(200).optional(),
    work_site_name: z.string().trim().max(200).optional(),
    shape_type: z.literal("circle"),
    center: z.object({
      longitude: longitudeSchema,
      latitude: latitudeSchema,
    }),
    radius_meters: z.number().positive().finite(),
  })
  .strict();
const simulationDraftPolygonSchema = z
  .object({
    id: z.uuid().optional(),
    geofence_id: z.uuid().optional(),
    work_site_id: z.uuid().optional(),
    name: z.string().trim().max(200).optional(),
    work_site_name: z.string().trim().max(200).optional(),
    shape_type: z.literal("polygon"),
    vertices: z.array(lngLatSchema).min(3).max(500),
  })
  .strict()
  .refine((value) => distinctCoordinateCount(value.vertices) >= 3, {
    message: "Polygon requires at least three distinct vertices.",
    path: ["vertices"],
  });
const simulationGeofenceSourceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("policy_effective") }).strict(),
  z
    .object({
      mode: z.literal("persisted"),
      geofence_ids: z.array(z.uuid()).min(1).max(20),
    })
    .strict(),
  z
    .object({
      mode: z.literal("draft"),
      geofences: z
        .array(z.discriminatedUnion("shape_type", [
          simulationDraftCircleSchema,
          simulationDraftPolygonSchema,
        ]))
        .min(1)
        .max(20),
    })
    .strict(),
]);
const simulationScenarioSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("coordinates"),
      latitude: latitudeSchema,
      longitude: longitudeSchema,
      accuracy_meters: z.number().positive().finite(),
      evidence_age_ms: z.number().int().min(0).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("permission_denied"),
      evidence_age_ms: z.number().int().min(0).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("location_unavailable"),
      evidence_age_ms: z.number().int().min(0).optional(),
    })
    .strict(),
  z.object({ type: z.literal("missing") }).strict(),
]);
const geoPolicySimulationSchema = z
  .object({
    employee_user_id: z.uuid(),
    event_at: isoDateTimeSchema,
    policy_source: simulationPolicySourceSchema,
    geofence_source: simulationGeofenceSourceSchema,
    scenario: simulationScenarioSchema,
  })
  .strict();

function distinctCoordinateCount(vertices: Array<readonly [number, number]>): number {
  return new Set(
    vertices.map(
      ([longitude, latitude]) => `${longitude.toFixed(7)},${latitude.toFixed(7)}`,
    ),
  ).size;
}

function adminGeoRepository(
  fastify: Parameters<FastifyPluginAsync>[0],
): PostgresAdminGeoRepository {
  if (!fastify.store.pgPool) {
    throw conflict("Admin geo service is unavailable.");
  }
  return new PostgresAdminGeoRepository(fastify.store.pgPool);
}

function requireAdminGeoContext(
  store: Parameters<FastifyPluginAsync>[0]["store"],
  actor: AuthUser,
) {
  if (!canManageAllAttendance(actor)) {
    throw forbidden("Only HR or Admin can manage attendance geo configuration.");
  }
  return resolveActiveCompanyMembershipContext(store, {
    userId: actor.id,
    operation: "attendance.geo_admin",
    requireActiveEmployment: true,
  });
}

export const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  const withReplayHeader = (
    reply: { header: (name: string, value: string) => unknown },
    response: Record<string, unknown>,
  ) => {
    if (isAttendanceReplayResponse(response)) {
      reply.header(ATTENDANCE_IDEMPOTENCY_REPLAY_HEADER, "true");
    }
    return response;
  };

  fastify.post("/punches", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }

    const rawIdempotencyKey = idempotencyKeySchema.parse(
      request.headers["idempotency-key"],
    );

    const service = new AttendanceService(fastify.store);
    const isEnvelopeRequest = isPunchCommandEnvelope(request.body);

    if (!isEnvelopeRequest) {
      const input = attendancePunchSchema.parse(request.body);

      const response =
        fastify.store.kind === "postgres"
          ? await service.recordEmployeeManualNowPostgres(
              request.actor,
              input,
              rawIdempotencyKey,
            )
          : service.recordEmployeeManualNow(request.actor, input);

      return withReplayHeader(reply, response);
    }

    const clientEventId = clientEventIdHeaderSchema.parse(rawIdempotencyKey);
    const input = attendancePunchCommandEnvelopeSchema.parse(request.body);

    if (input.client_event_id !== clientEventId) {
      throw badRequest(
        "Idempotency-Key header must match body client_event_id.",
        {
          header: "Idempotency-Key",
          field: "client_event_id",
        },
      );
    }

    const response =
      fastify.store.kind === "postgres"
        ? await service.recordEmployeeManualNowPostgres(
            request.actor,
            input.command,
            clientEventId,
            {
              clientEventId: input.client_event_id,
              capturedAt: input.captured_at,
              device: input.device,
            },
          )
        : service.recordEmployeeManualNow(request.actor, input.command);

    return withReplayHeader(reply, response);
  });

  fastify.post("/offline-sync", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }

    const input = attendanceOfflineBatchRequestSchema.parse(request.body);
    return new AttendanceOfflineSyncService(fastify.store).syncBatch(
      request.actor,
      input,
    );
  });

  function isPunchCommandEnvelope(
    value: unknown,
  ): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const body = value as Record<string, unknown>;

    return (
      Object.hasOwn(body, "client_event_id") ||
      Object.hasOwn(body, "command") ||
      Object.hasOwn(body, "captured_at") ||
      Object.hasOwn(body, "device")
    );
  }

  fastify.post(
    "/employees/:employeeUserId/assisted-current-punches",
    async (request, reply) => {
      if (!request.actor) throw unauthorized();
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      const params = employeeParamSchema.parse(request.params);
      const input = attendanceAssistedCurrentPunchSchema.parse(request.body);
      const service = new AttendanceService(fastify.store);
      const response =
        fastify.store.kind === "postgres"
          ? await service.recordManagerAssistedCurrentPunchPostgres(
              request.actor,
              params.employeeUserId,
              input,
              idempotencyKey,
            )
          : service.recordManagerAssistedCurrentPunch(
              request.actor,
              params.employeeUserId,
              input,
            );
      return withReplayHeader(reply, response);
    },
  );

  fastify.post(
    "/employees/:employeeUserId/historical-corrections",
    async (request, reply) => {
      if (!request.actor) throw unauthorized();
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      const params = employeeParamSchema.parse(request.params);
      const input = attendanceHistoricalCorrectionSchema.parse(request.body);
      const response = await new AttendanceService(
        fastify.store,
      ).recordHistoricalCorrection(
        request.actor,
        params.employeeUserId,
        input,
        idempotencyKey,
      );
      return withReplayHeader(reply, response);
    },
  );

  fastify.get("/punches/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).listMyPunches(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/summary/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const service = new AttendanceService(fastify.store);
    const query = attendanceQuerySchema.parse(request.query);
    return fastify.store.kind === "postgres"
      ? service.mySummaryPostgres(request.actor, query)
      : service.mySummary(request.actor, query);
  });

  fastify.get("/privacy", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).attendancePrivacy(request.actor);
  });

  fastify.get("/summary/team", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).teamSummary(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/calendar/monthly", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).monthlyCalendar(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/calendar/daily", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).dailyCalendarWithSelfEvidence(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/regularizations", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).createRegularization(
      request.actor,
      attendanceRegularizationCreateSchema.parse(request.body),
    );
  });

  fastify.get("/regularizations/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).myRegularizations(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.get("/regularizations/queue/manager", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).managerRegularizationQueue(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/regularizations/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const input = attendanceRegularizationDecisionSchema.parse(request.body);
    const service = new AttendanceService(fastify.store);
    if (fastify.store.kind === "postgres") {
      return service.decideRegularizationPostgres(
        request.actor,
        params.id,
        input,
      );
    }
    return service.decideRegularization(request.actor, params.id, input);
  });

  fastify.post("/geo-fallbacks/:id/submit", async (request, reply) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const idempotencyKey = idempotencyKeySchema.parse(
      request.headers["idempotency-key"],
    );
    const params = idParamSchema.parse(request.params);
    attendanceGeoFallbackSubmitSchema.parse(request.body ?? {});
    const response = await new AttendanceService(fastify.store).submitGeoFallback(
      request.actor,
      params.id,
      idempotencyKey,
    );
    return withReplayHeader(reply, response);
  });

  fastify.get("/geo-fallbacks/queue/manager", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).managerGeoFallbackQueue(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/geo-fallbacks/:id/exact-location", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AttendanceService(fastify.store).revealManagerGeoFallbackExactLocation(
      request.actor,
      params.id,
    );
  });

  fastify.post("/geo-fallbacks/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const input = attendanceGeoFallbackDecisionSchema.parse(request.body);
    return new AttendanceService(fastify.store).decideGeoFallback(
      request.actor,
      params.id,
      input,
    );
  });

  fastify.post("/payroll-periods", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendancePayrollPeriodService(fastify.store).createPeriod(
      request.actor,
      attendancePayrollPeriodCreateSchema.parse(request.body),
    );
  });

  fastify.post("/payroll-periods/:id/lock", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AttendancePayrollPeriodService(fastify.store).lockPeriod(
      request.actor,
      params.id,
      attendancePayrollPeriodActionSchema.parse(request.body ?? {}),
    );
  });

  fastify.post("/payroll-periods/:id/unlock", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AttendancePayrollPeriodService(fastify.store).unlockPeriod(
      request.actor,
      params.id,
      attendancePayrollPeriodUnlockSchema.parse(request.body ?? {}),
    );
  });

  fastify.get("/payroll-periods/:id/summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new AttendancePayrollPeriodService(fastify.store).summary(
      request.actor,
      params.id,
      attendancePayrollPeriodSummaryQuerySchema.parse(request.query),
    );
  });

  fastify.get("/work-sites", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    return {
      items: await adminGeoRepository(fastify).listWorkSites(context.companyId),
    };
  });

  fastify.post("/geo/simulate", async (request) => {
    if (!request.actor) throw unauthorized();
    const input = geoPolicySimulationSchema.parse(request.body);
    return new AttendanceGeoPolicySimulationService(fastify.store).simulate(
      request.actor,
      input,
    );
  });

  fastify.get("/work-sites/:workSiteId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = workSiteParamSchema.parse(request.params);
    return {
      workSite: await adminGeoRepository(fastify).getWorkSite(
        context.companyId,
        params.workSiteId,
      ),
    };
  });

  fastify.post("/work-sites", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const input = workSiteCreateSchema.parse(request.body);
    return {
      workSite: await adminGeoRepository(fastify).createWorkSite({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        values: input,
      }),
    };
  });

  fastify.patch("/work-sites/:workSiteId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = workSiteParamSchema.parse(request.params);
    const input = workSiteUpdateSchema.parse(request.body);
    return {
      workSite: await adminGeoRepository(fastify).updateWorkSite({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        workSiteId: params.workSiteId,
        values: input,
      }),
    };
  });

  fastify.delete("/work-sites/:workSiteId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = workSiteParamSchema.parse(request.params);
    const input = expectedVersionSchema.parse(request.body);
    return {
      workSite: await adminGeoRepository(fastify).deleteWorkSite({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        workSiteId: params.workSiteId,
        expectedVersion: input.expectedVersion,
      }),
    };
  });

  fastify.get("/work-sites/:workSiteId/geofences", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = workSiteParamSchema.parse(request.params);
    return {
      items: await adminGeoRepository(fastify).listGeofences(
        context.companyId,
        params.workSiteId,
      ),
    };
  });

  fastify.post("/work-sites/:workSiteId/geofences", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = workSiteParamSchema.parse(request.params);
    const input = geofenceCreateSchema.parse(request.body);
    return {
      geofence: await adminGeoRepository(fastify).createGeofence({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        workSiteId: params.workSiteId,
        values: input,
      }),
    };
  });

  fastify.get("/geofences/:geofenceId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceParamSchema.parse(request.params);
    return {
      geofence: await adminGeoRepository(fastify).getGeofence(
        context.companyId,
        params.geofenceId,
      ),
    };
  });

  fastify.patch("/geofences/:geofenceId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceParamSchema.parse(request.params);
    const input = geofenceUpdateSchema.parse(request.body);
    return {
      geofence: await adminGeoRepository(fastify).updateGeofence({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        geofenceId: params.geofenceId,
        values: input,
      }),
    };
  });

  fastify.delete("/geofences/:geofenceId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceParamSchema.parse(request.params);
    const input = expectedVersionSchema.parse(request.body);
    return {
      geofence: await adminGeoRepository(fastify).deleteGeofence({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        geofenceId: params.geofenceId,
        expectedVersion: input.expectedVersion,
      }),
    };
  });

  fastify.get("/geofences/:geofenceId/versions", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceParamSchema.parse(request.params);
    return {
      items: await adminGeoRepository(fastify).listVersions(
        context.companyId,
        params.geofenceId,
      ),
    };
  });

  fastify.get("/geofences/:geofenceId/versions/:versionId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceVersionParamSchema.parse(request.params);
    return {
      version: await adminGeoRepository(fastify).getVersion(
        context.companyId,
        params.geofenceId,
        params.versionId,
      ),
    };
  });

  fastify.post("/geofences/:geofenceId/versions", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceParamSchema.parse(request.params);
    const input = geofenceVersionShapeSchema.parse(request.body);
    return {
      version: await adminGeoRepository(fastify).createVersion({
        companyId: context.companyId,
        actorUserId: request.actor.id,
        geofenceId: params.geofenceId,
        values: input,
      }),
    };
  });

  fastify.patch("/geofences/:geofenceId/versions/:versionId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceVersionParamSchema.parse(request.params);
    const input = geofenceVersionShapeSchema.parse(request.body);
    return {
      version: await adminGeoRepository(fastify).updateVersion({
        companyId: context.companyId,
        geofenceId: params.geofenceId,
        versionId: params.versionId,
        values: input,
      }),
    };
  });

  fastify.delete("/geofences/:geofenceId/versions/:versionId", async (request) => {
    if (!request.actor) throw unauthorized();
    const context = requireAdminGeoContext(fastify.store, request.actor);
    const params = geofenceVersionParamSchema.parse(request.params);
    return adminGeoRepository(fastify).deleteVersion({
      companyId: context.companyId,
      geofenceId: params.geofenceId,
      versionId: params.versionId,
    });
  });

  fastify.post(
    "/geofences/:geofenceId/versions/:versionId/publish",
    async (request) => {
      if (!request.actor) {
        throw unauthorized();
      }
      const params = geofencePublishParamSchema.parse(request.params);
      const input = geofenceVersionPublishSchema.parse(request.body);
      return new AttendanceService(fastify.store).publishGeofenceVersion(
        request.actor,
        params.geofenceId,
        params.versionId,
        {
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil ?? null,
        },
      );
    },
  );

  fastify.get("/exceptions", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).exceptions(
      request.actor,
      attendanceQuerySchema.parse(request.query),
    );
  });

  fastify.post("/exports", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new AttendanceService(fastify.store).createExportJob(
      request.actor,
      attendanceExportSchema.parse(request.body ?? {}),
    );
  });
};
