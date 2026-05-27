import type { FastifyPluginAsync } from "fastify";
import { timesheetRoutes } from "./routes.js";

const timesheetsModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(timesheetRoutes, { prefix: "/api/v1/timesheets" });
};

export default timesheetsModule;
