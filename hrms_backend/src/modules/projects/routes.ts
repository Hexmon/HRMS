import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  paginationQuerySchema,
  projectAllocationCreateSchema,
  projectArchiveSchema,
  projectCreateSchema,
  projectMemberCreateSchema,
  projectMemberUpdateSchema,
  projectMilestoneCreateSchema,
  projectUpdateSchema
} from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { ProjectsService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const memberParamSchema = z.object({ id: z.uuid(), member_id: z.uuid() });

const projectQuerySchema = paginationQuerySchema.extend({
  status: z.string().max(64).optional(),
  client: z.string().max(180).optional(),
  manager_user_id: z.uuid().optional(),
  search: z.string().max(160).optional(),
  include: z.string().max(200).optional(),
  active_only: z.coerce.boolean().optional(),
  role: z.string().max(120).optional(),
  user_id: z.uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  document_type: z.string().max(120).optional(),
  department_id: z.uuid().optional(),
  group_by: z.enum(["department", "manager"]).optional()
});

export const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/projects", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ProjectsService(fastify.store).createProject(
      request.actor,
      projectCreateSchema.parse(request.body)
    );
  });

  fastify.get("/projects", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ProjectsService(fastify.store).listProjects(
      request.actor,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.get("/projects/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).getProject(
      request.actor,
      params.id,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.patch("/projects/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).updateProject(
      request.actor,
      params.id,
      projectUpdateSchema.parse(request.body)
    );
  });

  fastify.post("/projects/:id/archive", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).archiveProject(
      request.actor,
      params.id,
      projectArchiveSchema.parse(request.body)
    );
  });

  fastify.get("/projects/:id/members", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).listMembers(
      request.actor,
      params.id,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.post("/projects/:id/members", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).addMember(
      request.actor,
      params.id,
      projectMemberCreateSchema.parse(request.body)
    );
  });

  fastify.patch("/projects/:id/members/:member_id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = memberParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).updateMember(
      request.actor,
      params.id,
      params.member_id,
      projectMemberUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/projects/:id/allocations", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).listAllocations(
      request.actor,
      params.id,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.post("/projects/:id/allocations", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).addAllocation(
      request.actor,
      params.id,
      projectAllocationCreateSchema.parse(request.body)
    );
  });

  fastify.get("/projects/:id/milestones", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).listMilestones(
      request.actor,
      params.id,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.post("/projects/:id/milestones", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).addMilestone(
      request.actor,
      params.id,
      projectMilestoneCreateSchema.parse(request.body)
    );
  });

  fastify.get("/projects/:id/documents", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).listDocuments(
      request.actor,
      params.id,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.get("/projects/:id/summary", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new ProjectsService(fastify.store).projectSummary(
      request.actor,
      params.id,
      projectQuerySchema.parse(request.query)
    );
  });

  fastify.get("/team-utilization/summary", async (request) => {
    if (!request.actor) throw unauthorized();
    return new ProjectsService(fastify.store).teamUtilizationSummary(
      request.actor,
      projectQuerySchema.parse(request.query)
    );
  });
};
