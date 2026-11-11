/**
 * Disposable, synthetic current-behavior probe. Run from hrms_backend:
 * pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.ts
 * A returned 200 is an observed source/runtime gap, not an intended assertion.
 */
import { randomUUID } from "node:crypto";
import "../../../hrms_backend/scripts/test-setup.ts";
import { buildApp } from "../../../hrms_backend/src/app.ts";
import { createMemoryDataStore, seedIds } from "../../../hrms_backend/src/platform/data-store.ts";
import { authHeader, loginAs } from "../../../hrms_backend/src/testing/index.ts";
import { runProbeCli } from "./disposable-probe-guard.ts";

export function requireTenantProbeFixture<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

export async function runTenantBoundaryProbe(): Promise<Record<string, string | number | boolean>> {
const store = createMemoryDataStore();
const companyA = requireTenantProbeFixture(store.companyProfiles[0], "Synthetic Company A fixture missing");
const seededAsset = requireTenantProbeFixture(store.assets[0], "Synthetic asset fixture missing");
seededAsset.current_assigned_user_id = seedIds.employee1;
const companyBId = randomUUID();
store.companyProfiles.push({ ...companyA, id: companyBId, company_name: "Synthetic Company B", company_slug: "synthetic-company-b" });
for (const userId of [seedIds.admin, seedIds.assetManager, seedIds.manager]) {
  const preference = store.userSessionPreferences.find((item) => item.user_id === userId);
  requireTenantProbeFixture(preference, "Synthetic role preference missing");
  preference.company_id = companyBId;
}
const companyAAsset = seededAsset;
const companyATicket = requireTenantProbeFixture(
  store.helpdeskTickets.find((ticket) => ticket.requester_user_id === seedIds.employee1),
  "Synthetic Company A object fixture missing",
);
const companyAProject = requireTenantProbeFixture(
  store.projects.find((project) => project.manager_user_id === seedIds.manager),
  "Synthetic Company A object fixture missing",
);

const app = await buildApp({ dataStore: store, rateLimit: false });
try {
  await app.ready();
  const adminB = await loginAs(app, "ADM");
  const assetManagerB = await loginAs(app, "AST");
  const [assets, ticket, project, settings] = await Promise.all([
    app.inject({ method: "GET", url: "/api/v1/assets?page=1&page_size=25", headers: authHeader(assetManagerB.token) }),
    app.inject({ method: "GET", url: `/api/v1/helpdesk/tickets/${companyATicket.id}`, headers: authHeader(adminB.token) }),
    app.inject({ method: "GET", url: `/api/v1/projects/${companyAProject.id}`, headers: authHeader(adminB.token) }),
    app.inject({ method: "GET", url: "/api/v1/admin/security-settings", headers: authHeader(adminB.token) })
  ]);
  const result = {
    environment: "in-memory Fastify inject; synthetic A/B; no external services",
    company_b_asset_list_status: assets.statusCode,
    company_b_list_contains_company_a_asset: Array.isArray(assets.json().items) && assets.json().items.some((item: { id: string }) => item.id === companyAAsset.id),
    company_b_company_a_helpdesk_detail_status: ticket.statusCode,
    company_b_company_a_project_detail_status: project.statusCode,
    company_b_shared_security_settings_status: settings.statusCode
  };
  return result;
} finally {
  await app.close();
}
}

export async function main(): Promise<void> {
  process.stdout.write(`${JSON.stringify(await runTenantBoundaryProbe(), null, 2)}\n`);
}

void runProbeCli(import.meta.url, process.argv[1], main);
