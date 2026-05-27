import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

const apiConfigPath = join(root, "src/shared/api/config.ts");
const apiConfig = readFileSync(apiConfigPath, "utf8");

if (!apiConfig.includes('import.meta.env.PROD || import.meta.env.MODE === "production"')) {
  failures.push(
    "src/shared/api/config.ts must detect production mode from import.meta.env.PROD or MODE.",
  );
}

if (!apiConfig.includes("mockFallback: isProductionMode ? false : requestedMockFallback")) {
  failures.push("src/shared/api/config.ts must force mockFallback=false in production builds.");
}

if (!apiConfig.includes('enabled: parseBoolean(envValue("VITE_API_ENABLED"), true)')) {
  failures.push("src/shared/api/config.ts must default VITE_API_ENABLED to true.");
}

const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
for (const envFile of envFiles) {
  const path = join(root, envFile);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, "utf8");
  if (/^\s*VITE_API_MOCK_FALLBACK\s*=\s*["']?(?:1|true|yes|on)["']?\s*$/imu.test(content)) {
    failures.push(`${envFile} must not enable VITE_API_MOCK_FALLBACK.`);
  }
  if (/^\s*VITE_API_ENABLED\s*=\s*["']?(?:0|false|no|off)["']?\s*$/imu.test(content)) {
    failures.push(`${envFile} must not disable VITE_API_ENABLED.`);
  }
}

if (failures.length > 0) {
  console.error(
    ["Production config guard failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"),
  );
  process.exit(1);
}

console.log(
  "Production config guard OK: production mock fallback is disabled and API mode is required.",
);
