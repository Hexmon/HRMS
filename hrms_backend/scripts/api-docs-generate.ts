import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

process.env.HRMS_ALLOW_MEMORY_STORE ??= "true";
process.env.HRMS_DATA_STORE ??= "memory";

const { buildApp } = await import("../src/app.js");

const app = await buildApp({ dataStoreMode: "memory" });
await app.ready();

try {
  const spec = app.swagger();
  const outputDir = join(process.cwd(), "docs/api");
  const outputPath = join(outputDir, "openapi.json");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`OpenAPI contract generated: ${outputPath}`);
} finally {
  await app.close();
}
