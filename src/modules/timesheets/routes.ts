import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  paginationQuerySchema,
  timesheetDecisionSchema,
  timesheetSubmissionSchema,
  workSegmentSchema,
  workflowDefinitionSchema
} from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { TimesheetService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });

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
    const query = paginationQuerySchema.parse(request.query);
    return new TimesheetService(fastify.store).approverQueue(request.actor, query.page, query.page_size);
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
