import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { EmploymentStatuses, Roles } from "#shared";
import { paginationQuerySchema } from "#shared";
import { badRequest, unauthorized } from "../../platform/errors.js";
import { CoreService, type ProfilePhotoPolicy, type ProfilePhotoUploadInput } from "./service.js";

const roleValues = [
  Roles.Employee,
  Roles.Reviewer,
  Roles.Director,
  Roles.FinanceManager,
  Roles.Admin,
  Roles.Auditor,
  Roles.AssetManager,
  Roles.HRManager
] as const;
const roleSchema = z.enum(roleValues);
const employmentStatusSchema = z.enum([
  EmploymentStatuses.Active,
  EmploymentStatuses.Inactive,
  EmploymentStatuses.Terminated,
  EmploymentStatuses.Suspended
]);

const userListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  department_id: z.uuid().optional(),
  designation_id: z.uuid().optional(),
  role: z.string().optional(),
  employment_status: employmentStatusSchema.optional(),
  manager_user_id: z.uuid().optional(),
  login_state: z.enum(["enabled", "disabled", "setup_pending"]).optional()
});

const dateSchema = z.iso.date();
const auditQuerySchema = paginationQuerySchema.extend({
  event_type: z.string().min(1).max(120).optional(),
  date_from: dateSchema.optional(),
  date_to: dateSchema.optional()
});
const expectedVersionSchema = z.object({
  expected_version: z.number().int().positive()
});

const createUserSchema = z.object({
  employee_code: z.string().min(2).max(32),
  email: z.email(),
  full_name: z.string().min(2).max(160),
  department_id: z.uuid(),
  designation_id: z.uuid(),
  manager_user_id: z.uuid().nullable().optional(),
  roles: z.array(roleSchema).min(1).optional(),
  employment_status: employmentStatusSchema.optional(),
  timezone: z.string().min(1).max(80).nullable().optional(),
  joined_on: dateSchema.nullable().optional(),
  login_enabled: z.boolean().optional()
});

const updateUserSchema = expectedVersionSchema.extend({
  email: z.email().optional(),
  full_name: z.string().min(2).max(160).optional(),
  department_id: z.uuid().optional(),
  designation_id: z.uuid().optional(),
  manager_user_id: z.uuid().nullable().optional(),
  employment_status: employmentStatusSchema.optional(),
  timezone: z.string().min(1).max(80).nullable().optional(),
  joined_on: dateSchema.nullable().optional(),
  terminated_on: dateSchema.nullable().optional()
});

const statusBodySchema = expectedVersionSchema.extend({
  effective_date: dateSchema.optional(),
  reason: z.string().max(500).optional(),
  remarks: z.string().max(1000).optional(),
  status: z.enum([
    EmploymentStatuses.Inactive,
    EmploymentStatuses.Terminated,
    EmploymentStatuses.Suspended
  ]).optional()
});

const loginBodySchema = expectedVersionSchema.extend({
  invite_email: z.boolean().optional(),
  reason: z.string().max(500).optional()
});

const rolesBodySchema = expectedVersionSchema.extend({
  roles: z.array(roleSchema).min(1),
  remarks: z.string().max(1000).optional()
});

const importBodySchema = z.object({
  document_id: z.uuid().optional(),
  file_name: z.string().min(1).max(240).optional(),
  dry_run: z.boolean().optional(),
  mapping: z.record(z.string(), z.string()).optional()
}).refine((value) => Boolean(value.document_id || value.file_name), {
  message: "document_id or file_name is required.",
  path: ["document_id"]
});

const exportBodySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  filters: z.record(z.string(), z.unknown()).default({}),
  columns: z.array(z.string().min(1).max(80)).max(80).optional()
});

export const coreRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/master-data/org-selectors", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const service = new CoreService(fastify.store);
    return service.orgSelectors(request.actor);
  });

  fastify.get("/users", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const query = userListQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    return service.listUsers(request.actor, query);
  });

  fastify.post("/users", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = createUserSchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.createUser(request.actor, body);
  });

  fastify.get("/users/profile-photo-policy", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return profilePhotoPolicyFromConfig(fastify.config);
  });

  fastify.post("/users/:id/profile-photo", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const upload = await parseProfilePhotoUpload(request);
    const service = new CoreService(fastify.store);
    return service.uploadProfilePhoto(
      request.actor,
      params.id,
      upload,
      profilePhotoPolicyFromConfig(fastify.config)
    );
  });

  fastify.get("/users/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const service = new CoreService(fastify.store);
    return service.getUser(request.actor, params.id);
  });

  fastify.patch("/users/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.updateUser(request.actor, params.id, body);
  });

  fastify.post("/users/:id/activate", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = statusBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.activateUser(request.actor, params.id, body);
  });

  fastify.post("/users/:id/deactivate", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = statusBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.deactivateUser(request.actor, params.id, body);
  });

  fastify.post("/users/:id/login/enable", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = loginBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.enableLogin(request.actor, params.id, body);
  });

  fastify.post("/users/:id/login/disable", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = loginBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.disableLogin(request.actor, params.id, body);
  });

  fastify.put("/users/:id/roles", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = rolesBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.replaceRoles(request.actor, params.id, body);
  });

  fastify.get("/users/:id/roles/history", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    return service.roleHistory(request.actor, params.id, query);
  });

  fastify.get("/users/:id/audit", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const query = auditQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    return service.auditTrail(request.actor, params.id, query);
  });

  fastify.post("/users/imports", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = importBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.createImportJob(request.actor, body);
  });

  fastify.get("/users/imports/:job_id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ job_id: z.uuid() }).parse(request.params);
    const service = new CoreService(fastify.store);
    return service.getImportJob(request.actor, params.job_id);
  });

  fastify.post("/users/exports", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const body = exportBodySchema.parse(request.body);
    const service = new CoreService(fastify.store);
    return service.createExportJob(request.actor, body);
  });

  fastify.get("/users/:id/subtree", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const service = new CoreService(fastify.store);
    return service.resolveSubtreeView(request.actor, params.id, query.page, query.page_size);
  });
};

function profilePhotoPolicyFromConfig(config: FastifyInstance["config"]): ProfilePhotoPolicy {
  return {
    max_bytes: config.PROFILE_PHOTO_MAX_BYTES,
    max_width: config.PROFILE_PHOTO_MAX_WIDTH,
    max_height: config.PROFILE_PHOTO_MAX_HEIGHT,
    jpeg_quality: config.PROFILE_PHOTO_JPEG_QUALITY,
    allowed_mime_types: config.PROFILE_PHOTO_ALLOWED_MIME_TYPES
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    output_mime_type: "image/jpeg",
    cloudinary_transformation: config.PROFILE_PHOTO_CLOUDINARY_TRANSFORMATION
  };
}

async function parseProfilePhotoUpload(request: FastifyRequest): Promise<ProfilePhotoUploadInput> {
  if (!request.isMultipart()) {
    throw badRequest("Profile photo upload must be multipart/form-data.");
  }

  for await (const part of request.parts()) {
    if (part.type !== "file") continue;
    const fileBuffer = await part.toBuffer();
    return {
      file_buffer: fileBuffer,
      file_name: part.filename || "profile-photo.jpg",
      mime_type: part.mimetype || "application/octet-stream",
      size_bytes: fileBuffer.length
    };
  }

  throw badRequest("Profile photo file is required.");
}
