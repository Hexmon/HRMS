import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { unauthorized } from "../../platform/errors.js";
import { AdminService } from "./service.js";
import {
  adminEmailTemplatesQuerySchema,
  adminEmailTemplateUpdateSchema,
  adminPoliciesQuerySchema,
  adminPolicyUpdateSchema,
  adminWorkflowUpdateSchema,
  adminWorkflowsQuerySchema,
  companyProfileUpdateSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  designationCreateSchema,
  designationUpdateSchema,
  emailTemplateKeyParamSchema,
  masterDataQuerySchema,
  rbacPermissionsQuerySchema,
  rbacRoleCreateSchema,
  rbacRolePermissionsReplaceSchema,
  rbacRolesQuerySchema,
  rbacRoleUpdateSchema,
  policyKeyParamSchema,
  workflowKeyParamSchema
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

  fastify.get("/rbac/roles", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listRbacRoles(
      request.actor,
      rbacRolesQuerySchema.parse(request.query)
    );
  });

  fastify.post("/rbac/roles", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).createRbacRole(
      request.actor,
      rbacRoleCreateSchema.parse(request.body)
    );
  });

  fastify.patch("/rbac/roles/:id", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new AdminService(fastify.store).updateRbacRole(
      request.actor,
      params.id,
      rbacRoleUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/rbac/permissions", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listRbacPermissions(
      request.actor,
      rbacPermissionsQuerySchema.parse(request.query)
    );
  });

  fastify.put("/rbac/roles/:id/permissions", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = idParamSchema.parse(request.params);
    return new AdminService(fastify.store).replaceRbacRolePermissions(
      request.actor,
      params.id,
      rbacRolePermissionsReplaceSchema.parse(request.body)
    );
  });

  fastify.get("/workflows", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listAdminWorkflows(
      request.actor,
      adminWorkflowsQuerySchema.parse(request.query)
    );
  });

  fastify.put("/workflows/:workflow_key", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = workflowKeyParamSchema.parse(request.params);
    return new AdminService(fastify.store).updateAdminWorkflow(
      request.actor,
      params.workflow_key,
      adminWorkflowUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/policies", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listAdminPolicies(
      request.actor,
      adminPoliciesQuerySchema.parse(request.query)
    );
  });

  fastify.put("/policies/:policy_key", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = policyKeyParamSchema.parse(request.params);
    return new AdminService(fastify.store).updateAdminPolicy(
      request.actor,
      params.policy_key,
      adminPolicyUpdateSchema.parse(request.body)
    );
  });

  fastify.get("/email-templates", async (request) => {
    if (!request.actor) throw unauthorized();
    return new AdminService(fastify.store).listAdminEmailTemplates(
      request.actor,
      adminEmailTemplatesQuerySchema.parse(request.query)
    );
  });

  fastify.put("/email-templates/:template_key", async (request) => {
    if (!request.actor) throw unauthorized();
    const params = emailTemplateKeyParamSchema.parse(request.params);
    return new AdminService(fastify.store).updateAdminEmailTemplate(
      request.actor,
      params.template_key,
      adminEmailTemplateUpdateSchema.parse(request.body)
    );
  });
};
