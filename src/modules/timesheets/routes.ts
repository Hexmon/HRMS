import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  paginationQuerySchema,
  TimesheetStatuses,
  timesheetDecisionSchema,
  timesheetSubmissionSchema,
  workSegmentSchema,
  workflowDefinitionSchema
} from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { TimesheetService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });

const booleanQuerySchema = z.preprocess((value) => {
  if (value === "true" || value === true) {
    return true;
  }
  if (value === "false" || value === false) {
    return false;
  }
  return value;
}, z.boolean());

const timesheetApproverQueueQuerySchema = paginationQuerySchema.extend({
  status: z.enum([
    TimesheetStatuses.PendingApproval,
    TimesheetStatuses.Approved,
    TimesheetStatuses.Returned,
    TimesheetStatuses.Rejected
  ]).optional(),
  employee_user_id: z.uuid().optional(),
  cycle_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  cycle_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  project_code: z.string().min(1).optional(),
  billable: booleanQuerySchema.optional()
});

const timesheetAnalyticsQuerySchema = paginationQuerySchema.extend({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  cycle_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  cycle_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  project_id: z.uuid().optional(),
  project_code: z.string().min(1).optional(),
  user_id: z.uuid().optional(),
  group_by: z.enum(["employee", "project", "department", "week"]).optional()
});

const timesheetSelectorsQuerySchema = z.object({
  include: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional()
});

export const timesheetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/work-segments", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new TimesheetService(fastify.store).createSegment(request.actor, workSegmentSchema.parse(request.body));
  });

  fastify.get("/work-segments", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).listSegments(request.actor, query.page, query.page_size);
  });

  fastify.post("/submissions", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new TimesheetService(fastify.store).submit(request.actor, timesheetSubmissionSchema.parse(request.body));
  });

  fastify.get("/submissions/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = paginationQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).mySubmissions(request.actor, query.page, query.page_size);
  });

  fastify.get("/queue/approver", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = timesheetApproverQueueQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).approverQueue(request.actor, query);
  });

  fastify.get("/projects/summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = timesheetAnalyticsQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).projectSummary(request.actor, query);
  });

  fastify.get("/missing-submissions", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = timesheetAnalyticsQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).missingSubmissions(request.actor, query);
  });

  fastify.get("/productivity-summary", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = timesheetAnalyticsQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).productivitySummary(request.actor, query);
  });

  fastify.get("/selectors", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = timesheetSelectorsQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).selectors(request.actor, query);
  });

  fastify.get("/submissions/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new TimesheetService(fastify.store).submissionDetail(request.actor, params.id);
  });

  fastify.post("/submissions/:id/approve", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    const body = timesheetDecisionSchema.parse(request.body);
    return new TimesheetService(fastify.store).decide(
      request.actor,
      params.id,
      body.decision,
      body.remarks,
      body.expected_version
    );
  });

  fastify.get("/workflow-definitions", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).workflows(query.page, query.page_size);
  });

  fastify.post("/workflow-definitions", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new TimesheetService(fastify.store).upsertWorkflow(request.actor, workflowDefinitionSchema.parse(request.body));
  });
};
