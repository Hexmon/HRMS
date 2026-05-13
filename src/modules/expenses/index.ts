import type { FastifyPluginAsync } from "fastify";
import { expenseRoutes } from "./routes.js";

const expensesModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(expenseRoutes, { prefix: "/api/v1" });
};

export default expensesModule;
