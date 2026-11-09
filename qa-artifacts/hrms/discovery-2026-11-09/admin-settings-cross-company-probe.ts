/**
 * Disposable synthetic current-behavior probe. Run from hrms_backend:
 * pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.ts
 * It changes only an in-memory Fastify fixture; no hosted service is contacted.
 */
import { randomUUID } from "node:crypto";
import "../../../hrms_backend/scripts/test-setup.ts";
import { buildApp } from "../../../hrms_backend/src/app.ts";
import { createMemoryDataStore, seedIds } from "../../../hrms_backend/src/platform/data-store.ts";
import { authHeader, loginAs } from "../../../hrms_backend/src/testing/index.ts";

async function main(): Promise<void> {
  const store = createMemoryDataStore();
  const companyA = store.companyProfiles[0];
  const adminPreference = store.userSessionPreferences.find((item) => item.user_id === seedIds.admin);
  if (!companyA || !adminPreference) throw new Error("Synthetic Admin/company fixture missing");
  const companyBId = randomUUID();
  store.companyProfiles.push({
    ...companyA,
    id: companyBId,
    company_name: "Synthetic Company B",
    company_slug: "synthetic-company-b",
  });
  adminPreference.company_id = companyBId;

  const app = await buildApp({ dataStore: store, rateLimit: false });
  try {
    await app.ready();
    const adminB = await loginAs(app, "ADM");
    const before = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(adminB.token),
    });
    if (before.statusCode !== 200) throw new Error(`B read failed: ${before.statusCode}`);
    const baseline = before.json() as { password_min_length: number; version: number };
    const changedMinLength = Math.min(128, baseline.password_min_length + 1);
    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(adminB.token),
      payload: { password_min_length: changedMinLength, expected_version: baseline.version },
    });
    if (update.statusCode !== 200) throw new Error(`B update failed: ${update.statusCode}`);

    // Model a later company-preference reassignment for the same synthetic Admin.
    // This is not the proposed two-HR-approved transfer workflow.
    adminPreference.company_id = companyA.id;
    const adminA = await loginAs(app, "ADM");
    const after = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security-settings",
      headers: authHeader(adminA.token),
    });
    if (after.statusCode !== 200) throw new Error(`A read failed: ${after.statusCode}`);
    const readByA = after.json() as { password_min_length: number; version: number };
    const result = {
      environment: "in-memory Fastify inject; synthetic sequential B-to-A preference; no external services",
      company_b_update_status: update.statusCode,
      company_a_read_status: after.statusCode,
      initial_password_min_length: baseline.password_min_length,
      company_b_saved_password_min_length: changedMinLength,
      company_a_observed_password_min_length: readByA.password_min_length,
      company_a_observed_b_change: readByA.password_min_length === changedMinLength,
      initial_version: baseline.version,
      company_a_observed_version: readByA.version,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.company_a_observed_b_change) throw new Error("Global settings sharing was not reproduced");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
