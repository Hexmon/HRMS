import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  holidayUpsertSchema,
  isoDateSchema,
  leaveRequestCreateSchema,
  leaveWfhCancelSchema,
  leaveWfhDecisionSchema,
  paginationQuerySchema,
  wfhRequestCreateSchema
} from "#shared";
import { unauthorized } from "../../platform/errors.js";
import { LeaveWfhService } from "./service.js";

const idParamSchema = z.object({ id: z.uuid() });
const userIdParamSchema = z.object({ user_id: z.uuid() });

const leaveWfhQuerySchema = paginationQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  leave_type: z.enum(["casual", "sick", "earned", "unpaid", "comp_off"]).optional(),
  status: z.enum(["pending_manager", "approved", "returned", "rejected", "cancelled"]).optional(),
  date_from: isoDateSchema.optional(),
  date_to: isoDateSchema.optional(),
  user_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  request_kind: z.enum(["leave", "wfh"]).optional()
});

export const leaveWfhRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/leave/balances/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).myLeaveBalances(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.get("/leave/balances/:user_id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = userIdParamSchema.parse(request.params);
    return new LeaveWfhService(fastify.store).leaveBalancesForUser(
      request.actor,
      params.user_id,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.post("/leave/requests", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).createLeaveRequest(
      request.actor,
      leaveRequestCreateSchema.parse(request.body)
    );
  });

  fastify.get("/leave/requests/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).listMyLeaveRequests(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.get("/leave/requests/queue/manager", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).managerLeaveQueue(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.post("/leave/requests/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new LeaveWfhService(fastify.store).decideLeaveRequest(
      request.actor,
      params.id,
      leaveWfhDecisionSchema.parse(request.body)
    );
  });

  fastify.post("/leave/requests/:id/cancel", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new LeaveWfhService(fastify.store).cancelLeaveRequest(
      request.actor,
      params.id,
      leaveWfhCancelSchema.parse(request.body)
    );
  });

  fastify.post("/wfh/requests", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).createWfhRequest(
      request.actor,
      wfhRequestCreateSchema.parse(request.body)
    );
  });

  fastify.get("/wfh/requests/my", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).listMyWfhRequests(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.get("/wfh/requests/queue/manager", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).managerWfhQueue(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.post("/wfh/requests/:id/decision", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new LeaveWfhService(fastify.store).decideWfhRequest(
      request.actor,
      params.id,
      leaveWfhDecisionSchema.parse(request.body)
    );
  });

  fastify.get("/leave-wfh/hr-monitor", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).hrMonitor(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.get("/holidays", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    return new LeaveWfhService(fastify.store).listHolidays(
      request.actor,
      leaveWfhQuerySchema.parse(request.query)
    );
  });

  fastify.put("/holidays/:id", async (request) => {
    if (!request.actor) {
      throw unauthorized();
    }
    const params = idParamSchema.parse(request.params);
    return new LeaveWfhService(fastify.store).upsertHoliday(
      request.actor,
      params.id,
      holidayUpsertSchema.parse(request.body)
    );
  });
};
