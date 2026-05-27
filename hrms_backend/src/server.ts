import { loadEnvFile } from "../scripts/env.js";
import { buildApp } from "./app.js";

loadEnvFile(process.env.HRMS_ENV_FILE ?? ".env.local");

const app = await buildApp({ logger: true });

try {
  await app.listen({ port: app.config.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
