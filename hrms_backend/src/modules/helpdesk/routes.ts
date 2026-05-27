import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  helpdeskAssignSchema,
  helpdeskAttachmentSchema,
  helpdeskCloseSchema,
  helpdeskCommentSchema,
  helpdeskPrioritySchema,
  helpdeskReopenSchema,
  helpdeskResolveSchema,
  helpdeskStatusSchema,
  helpdeskTicketCreateSchema,
  helpdeskTicketUpdateSchema,
  paginationQuerySchema
} from "#shared";
import { HelpdeskTicketCategories, HelpdeskTicketPriorities, HelpdeskTicketStatuses } from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { HelpdeskService } from "./service.js";

const idParamSchema = z.object({ id: z.string().min(1).max(80) });

const helpdeskQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum([
      HelpdeskTicketStatuses.New,
      HelpdeskTicketStatuses.Assigned,
      HelpdeskTicketStatuses.InProgress,
      HelpdeskTicketStatuses.OnHold,
      HelpdeskTicketStatuses.Resolved,
      HelpdeskTicketStatuses.Closed,
      HelpdeskTicketStatuses.Reopened,
      HelpdeskTicketStatuses.Escalated
    ])
    .optional(),
  priority: z
    .enum([
      HelpdeskTicketPriorities.Low,
      HelpdeskTicketPriorities.Medium,
      HelpdeskTicketPriorities.High,
      HelpdeskTicketPriorities.Urgent
    ])
    .optional(),
  category_id: z.uuid().optional(),
  category_key: z
    .enum([
      HelpdeskTicketCategories.IT,
      HelpdeskTicketCategories.HR,
      HelpdeskTicketCategories.Finance,
      HelpdeskTicketCategories.Admin,
      HelpdeskTicketCategories.Assets,
      HelpdeskTicketCategories.ProjectSupport
    ])
    .optional(),
  assignee_id: z.uuid().optional(),
  requester_id: z.uuid().optional(),
  active_only: z.coerce.boolean().optional(),
  search: z.string().max(160).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional()
});

const helpdeskCategoryKeySchema = z.enum([
  HelpdeskTicketCategories.IT,
  HelpdeskTicketCategories.HR,
  HelpdeskTicketCategories.Finance,
  HelpdeskTicketCategories.Admin,
  HelpdeskTicketCategories.Assets,
  HelpdeskTicketCategories.ProjectSupport
]);
const helpdeskSubCategorySchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120)
});
const helpdeskCategoryCreateSchema = z.object({
  category_key: helpdeskCategoryKeySchema,
  label: z.string().trim().min(1).max(120),
  default_assignee_user_id: z.uuid().nullable().optional(),
  default_assignee_name: z.string().trim().max(160).nullable().optional(),
  default_assignee_role: z.string().trim().max(120).nullable().optional(),
  team: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  sub_categories: z.array(helpdeskSubCategorySchema).max(40).default([])
});
const helpdeskCategoryUpdateSchema = z.object({
  expected_version: z.number().int().min(1),
  label: z.string().trim().min(1).max(120).optional(),
  default_assignee_user_id: z.uuid().nullable().optional(),
  default_assignee_name: z.string().trim().max(160).nullable().optional(),
  default_assignee_role: z.string().trim().max(120).nullable().optional(),
  team: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
  sub_categories: z.array(helpdeskSubCategorySchema).max(40).optional()
});

export const helpdeskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/helpdesk/tickets", async (request) => {
    if (!request.actor) throw unauthorized();
    return new HelpdeskService(fastify.store).createTicket(
      request.actor,
      helpdeskTicketCreateSchema.parse(request.body)
    );
  });

  fastify.get("/helpdesk/tickets", async (request) => {
    if (!request.actor) throw unauthorized();
    return new HelpdeskService(fastify.store).listTickets(
      request.actor,
      helpdeskQuerySchema.parse(request.query)
    );
  });

  fastify.get("/helpdesk/tickets/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).getTicket(request.actor, params.id);
  });

  fastify.patch("/helpdesk/tickets/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).updateTicket(
      request.actor,
      params.id,
      helpdeskTicketUpdateSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/comments", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).addComment(
      request.actor,
      params.id,
      helpdeskCommentSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/internal-notes", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).addInternalNote(
      request.actor,
      params.id,
      helpdeskCommentSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/attachments", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).addAttachment(
      request.actor,
      params.id,
      helpdeskAttachmentSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/assign", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).assign(
      request.actor,
      params.id,
      helpdeskAssignSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/priority", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).changePriority(
      request.actor,
      params.id,
      helpdeskPrioritySchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/status", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).setStatus(
      request.actor,
      params.id,
      helpdeskStatusSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/resolve", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).resolve(
      request.actor,
      params.id,
      helpdeskResolveSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/close", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).close(
      request.actor,
      params.id,
      helpdeskCloseSchema.parse(request.body)
    );
  });

  fastify.post("/helpdesk/tickets/:id/reopen", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).reopen(
      request.actor,
      params.id,
      helpdeskReopenSchema.parse(request.body)
    );
  });

  fastify.get("/helpdesk/categories", async (request) => {
    if (!request.actor) throw unauthorized();
    return new HelpdeskService(fastify.store).categories(
      request.actor,
      helpdeskQuerySchema.parse(request.query)
    );
  });

  fastify.post("/helpdesk/categories", async (request) => {
    if (!request.actor) throw unauthorized();
    return new HelpdeskService(fastify.store).createCategory(
      request.actor,
      helpdeskCategoryCreateSchema.parse(request.body)
    );
  });

  fastify.patch("/helpdesk/categories/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new HelpdeskService(fastify.store).updateCategory(
      request.actor,
      params.id,
      helpdeskCategoryUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/helpdesk/sla-report", async (request) => {
    if (!request.actor) throw unauthorized();
    return new HelpdeskService(fastify.store).slaReport(
      request.actor,
      helpdeskQuerySchema.parse(request.query)
    );
  });
};
