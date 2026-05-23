import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { unauthorized } from "../../platform/errors.js";
import { AdminService } from "./service.js";
import {
  companyProfileUpdateSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  designationCreateSchema,
  designationUpdateSchema,
  masterDataQuerySchema
} from "./schemas.js";

const idParamSchema = z.object({ id: z.uuid() });

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/company-profile", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).getCompanyProfile(request.actor);
  });

  fastify.put("/company-profile", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).updateCompanyProfile(
      request.actor,
      companyProfileUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/master-data/departments", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listDepartments(
      request.actor,
      masterDataQuerySchema.parse(request.query)
    );
  });

  fastify.post("/master-data/departments", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).createDepartment(
      request.actor,
      departmentCreateSchema.parse(request.body)
    );
  });

  fastify.patch("/master-data/departments/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new AdminService(fastify.store).updateDepartment(
      request.actor,
      params.id,
      departmentUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/master-data/designations", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listDesignations(
      request.actor,
      masterDataQuerySchema.parse(request.query)
    );
  });

  fastify.post("/master-data/designations", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).createDesignation(
      request.actor,
      designationCreateSchema.parse(request.body)
    );
  });

  fastify.patch("/master-data/designations/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new AdminService(fastify.store).updateDesignation(
      request.actor,
      params.id,
      designationUpdateSchema.parse(request.body)
    );
  });
};
