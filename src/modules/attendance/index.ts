import type { FastifyPluginAsync } from "fastify";
import { attendanceRoutes } from "./routes.js";

const attendanceModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(attendanceRoutes, { prefix: "/api/v1/attendance" });
};

export default attendanceModule;
