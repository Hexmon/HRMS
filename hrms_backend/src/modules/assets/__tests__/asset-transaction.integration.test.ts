import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { seedIds } from "../../../platform/data-store.js";
import { Roles } from "#shared";
import { buildRealApp } from "../../../__tests__/real-infra.js";
import { assertDisposableResetTarget } from "../../../platform/postgres-data-store.js";

async function recordDurableTermination(app: FastifyInstance, employeeUserId: string): Promise<string> {
  const eventId = randomUUID();
  await app.store.pgPool!.query(
    "UPDATE core.users SET employment_status = 'terminated', terminated_on = current_date WHERE id = $1",
    [employeeUserId],
  );
  await app.store.pgPool!.query(
    `INSERT INTO platform.outbox_events (
       event_id, aggregate_type, aggregate_id, event_type, payload,
       idempotency_key, status, retry_count, available_at, created_at
     ) VALUES ($1, 'core.user', $2, 'core.user.terminated', $3::jsonb,
       $4, 'pending', 0, now(), now())`,
    [
      eventId,
      employeeUserId,
      JSON.stringify({ user_id: employeeUserId, status: "terminated" }),
      `core.user.deactivated:${employeeUserId}:${eventId}`,
    ],
  );
  return eventId;
}

describe("asset transaction boundary", () => {
  let first: FastifyInstance;
  let second: FastifyInstance | undefined;
  let tenantBoundaryCleanup: { companyAId: string; companyBId: string } | undefined;

  beforeEach(async () => {
    first = await buildRealApp();
    await first.ready();
  });

  afterEach(async () => {
    if (tenantBoundaryCleanup && first?.store.pgPool) {
      const { companyAId, companyBId } = tenantBoundaryCleanup;
      const client = await first.store.pgPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL session_replication_role = 'replica'");
        for (const table of [
          "assets.asset_command_results",
          "assets.asset_recovery_tickets",
          "assets.asset_maintenance_records",
          "assets.asset_acknowledgements",
          "assets.asset_state_events",
          "assets.asset_assignments",
          "assets.asset_requests",
          "assets.software_vendors",
          "assets.assets",
        ]) {
          await client.query(`DELETE FROM ${table} WHERE company_id = $1`, [companyBId]);
        }
        await client.query(
          "UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id IN ($2, $3)",
          [companyAId, seedIds.assetManager, seedIds.employee2],
        );
        await client.query("DELETE FROM platform.company_profiles WHERE id = $1", [companyBId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      tenantBoundaryCleanup = undefined;
    }
    await second?.close();
    await first?.close();
  });

  it("does not let an unrelated second instance overwrite a committed assignment", async () => {
    second = await buildRealApp({ reset: false });
    await second.ready();
    const firstManager = await loginAs(first, "AST");
    const secondManager = await loginAs(second, "AST");
    const inventory = await first.inject({
      method: "GET",
      url: "/api/v1/assets?page=1&page_size=10",
      headers: authHeader(firstManager.token),
    });
    expect(inventory.statusCode).toBe(200);
    const original = inventory.json().items[0] as { id: string; version: number };
    expect(original).toBeDefined();

    const assignment = await first.inject({
      method: "POST",
      url: `/api/v1/assets/${original.id}/assign`,
      headers: { ...authHeader(firstManager.token), "Idempotency-Key": randomUUID() },
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: original.version },
    });
    expect(assignment.statusCode).toBe(200);

    const unrelated = await second.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(secondManager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: "ASSET-S25-B", asset_type: "Laptop", name: "Unrelated test laptop" },
    });
    expect(unrelated.statusCode).toBe(200);

    const row = await first.store.pgPool!.query<{
      status: string;
      current_assigned_user_id: string | null;
      version: number;
    }>("SELECT status, current_assigned_user_id, version FROM assets.assets WHERE id = $1", [original.id]);
    expect(row.rows).toEqual([{
      status: "Assigned",
      current_assigned_user_id: seedIds.employee1,
      version: original.version + 1,
    }]);
    const active = await first.store.pgPool!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.asset_assignments WHERE asset_id = $1 AND status = 'active'",
      [original.id],
    );
    expect(active.rows[0]?.count).toBe("1");
  });

  it("replays a committed assignment after a lost response without another assignment", async () => {
    const manager = await loginAs(first, "AST");
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    const key = randomUUID();
    const options = {
      method: "POST" as const,
      url: `/api/v1/assets/${asset.id}/assign`,
      headers: { ...authHeader(manager.token), "Idempotency-Key": key },
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version },
    };
    const firstResult = await first.inject(options);
    expect(firstResult.statusCode).toBe(200);
    const replay = await first.inject(options);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(firstResult.json());
    const assignments = await first.store.pgPool!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.asset_assignments WHERE asset_id = $1",
      [asset.id],
    );
    expect(assignments.rows[0]?.count).toBe("1");
    const changed = await first.inject({ ...options, payload: { ...options.payload, assigned_to_user_id: seedIds.employee2 } });
    expect(changed.statusCode).toBe(409);
    await first.store.pgPool!.query("UPDATE core.users SET employment_status = 'inactive' WHERE id = $1", [seedIds.employee1]);
    const afterDeparture = await first.inject(options);
    expect(afterDeparture.statusCode).toBe(200);
    expect(afterDeparture.json()).toEqual(firstResult.json());
  });

  it("denies replay after the actor's durable role is revoked", async () => {
    const manager = await loginAs(first, "AST");
    const key = randomUUID();
    const command = {
      method: "POST" as const,
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": key },
      payload: { asset_code: "ROLE-S25", asset_type: "Laptop", name: "Role replay test" },
    };
    expect((await first.inject(command)).statusCode).toBe(200);
    await first.store.pgPool!.query("UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2", [seedIds.assetManager, Roles.AssetManager]);
    const deniedReplay = await first.inject(command);
    expect(deniedReplay.statusCode, deniedReplay.body).toBe(403);
    expect((await first.inject({ method: "GET", url: "/api/v1/assets/assignees", headers: authHeader(manager.token) })).statusCode).toBe(403);
  });

  it("revokes privileged reads when a non-selected Asset Manager role is removed on another instance", async () => {
    second = await buildRealApp({ reset: false });
    await second.ready();
    const staleManager = await loginAs(second, "AST");
    await first.store.pgPool!.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', current_date, now(), now())`,
      [randomUUID(), seedIds.assetManager, Roles.Employee],
    );
    await first.store.pgPool!.query(
      "UPDATE platform.user_session_preferences SET active_role = $1 WHERE user_id = $2",
      [Roles.Employee, seedIds.assetManager],
    );
    await first.store.pgPool!.query(
      "UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2",
      [seedIds.assetManager, Roles.AssetManager],
    );

    const denied = await second.inject({
      method: "GET",
      url: "/api/v1/assets?page=1&page_size=10",
      headers: authHeader(staleManager.token),
    });
    expect(denied.statusCode, denied.body).toBe(403);
  });

  it("uses current SQL roles for core, report, and dashboard reads after a non-selected Admin role is revoked", async () => {
    await first.store.pgPool!.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', current_date, now(), now())`,
      [randomUUID(), seedIds.employee1, Roles.Admin],
    );
    second = await buildRealApp({ reset: false });
    await second.ready();
    const staleAdmin = await loginAs(second, "E1");
    await first.store.pgPool!.query(
      "UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2",
      [seedIds.employee1, Roles.Admin],
    );

    const profile = await second.inject({
      method: "GET",
      url: `/api/v1/core/users/${seedIds.employee2}`,
      headers: authHeader(staleAdmin.token),
    });
    expect(profile.statusCode, profile.body).toBe(403);

    const report = await second.inject({
      method: "GET",
      url: "/api/v1/reports/assets/summary?page=1&page_size=10",
      headers: authHeader(staleAdmin.token),
    });
    expect(report.statusCode, report.body).toBe(403);

    const dashboard = await second.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: authHeader(staleAdmin.token),
    });
    expect(dashboard.statusCode, dashboard.body).toBe(200);
    expect(dashboard.json().scope).toMatchObject({
      actor_user_id: seedIds.employee1,
      roles: [Roles.Employee],
      visibility: "self_and_descendants",
    });
  });

  it("isolates inventory, request, vendor, and mutation APIs by active company", async () => {
    const companyA = first.store.companyProfiles[0]!;
    const companyBId = randomUUID();
    const now = new Date().toISOString();
    const companyB = {
      ...companyA,
      id: companyBId,
      company_name: "Tenant Boundary Company B",
      company_slug: `tenant-b-${companyBId}`,
      created_at: now,
      updated_at: now,
      version: 1,
    };
    tenantBoundaryCleanup = { companyAId: companyA.id, companyBId };
    first.store.companyProfiles.push(companyB);
    const managerPreference = first.store.userSessionPreferences.find(
      (preference) => preference.user_id === seedIds.assetManager,
    )!;
    managerPreference.company_id = companyBId;
    managerPreference.updated_at = now;
    managerPreference.version += 1;
    const employeePreference = first.store.userSessionPreferences.find(
      (preference) => preference.user_id === seedIds.employee2,
    )!;
    employeePreference.company_id = companyBId;
    employeePreference.updated_at = now;
    employeePreference.version += 1;

    await first.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (
         id, company_name, company_slug, timezone, locale,
         fiscal_year_start_month, status, bootstrap_completed_at,
         website, industry, address, currency, working_week, work_hours_per_day
       ) VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), $7, $8, $9, $10, $11, $12)`,
      [
        companyB.id,
        companyB.company_name,
        companyB.company_slug,
        companyB.timezone,
        companyB.locale,
        companyB.fiscal_year_start_month,
        companyB.website,
        companyB.industry,
        companyB.address,
        companyB.currency,
        companyB.working_week,
        companyB.work_hours_per_day,
      ],
    );
    await first.store.pgPool!.query(
      `UPDATE platform.user_session_preferences
          SET company_id = $1, updated_at = NOW(), version = version + 1
       WHERE user_id IN ($2, $3)`,
      [companyBId, seedIds.assetManager, seedIds.employee2],
    );

    const adminA = await loginAs(first, "ADM");
    const managerB = await loginAs(first, "AST");
    const code = `SHARED-${companyBId.slice(0, 8)}`;
    const createAsset = (token: string, name: string) => first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: code, asset_type: "Laptop", name },
    });
    const createdA = await createAsset(adminA.token, "Company A laptop");
    const createdB = await createAsset(managerB.token, "Company B laptop");
    expect(createdA.statusCode, createdA.body).toBe(200);
    expect(createdB.statusCode, createdB.body).toBe(200);
    expect(createdA.json().company_id).toBe(companyA.id);
    expect(createdB.json().company_id).toBe(companyBId);

    const [listA, listB] = await Promise.all([
      first.inject({ method: "GET", url: "/api/v1/assets?page=1&page_size=100", headers: authHeader(adminA.token) }),
      first.inject({ method: "GET", url: "/api/v1/assets?page=1&page_size=100", headers: authHeader(managerB.token) }),
    ]);
    expect(listA.statusCode).toBe(200);
    expect(listB.statusCode).toBe(200);
    expect(listA.json().items.some((asset: { id: string }) => asset.id === createdB.json().id)).toBe(false);
    expect(listB.json().items).toEqual([expect.objectContaining({ id: createdB.json().id, company_id: companyBId })]);

    const foreignDetail = await first.inject({
      method: "GET",
      url: `/api/v1/assets/${createdA.json().id}`,
      headers: authHeader(managerB.token),
    });
    expect(foreignDetail.statusCode).toBe(404);
    const foreignMutation = await first.inject({
      method: "POST",
      url: `/api/v1/assets/${createdA.json().id}/return`,
      headers: { ...authHeader(managerB.token), "Idempotency-Key": randomUUID() },
      payload: { expected_version: createdA.json().version },
    });
    expect(foreignMutation.statusCode).toBe(404);

    const createVendor = (token: string) => first.inject({
      method: "POST",
      url: "/api/v1/assets/vendors",
      headers: { ...authHeader(token), "Idempotency-Key": randomUUID() },
      payload: { name: "Shared Vendor" },
    });
    const vendorA = await createVendor(adminA.token);
    const vendorB = await createVendor(managerB.token);
    expect(vendorA.statusCode, vendorA.body).toBe(200);
    expect(vendorB.statusCode, vendorB.body).toBe(200);
    expect(vendorA.json().vendor.company_id).toBe(companyA.id);
    expect(vendorB.json().vendor.company_id).toBe(companyBId);

    const maintenanceB = await first.inject({
      method: "POST",
      url: `/api/v1/assets/${createdB.json().id}/maintenance`,
      headers: { ...authHeader(managerB.token), "Idempotency-Key": randomUUID() },
      payload: {
        maintenance_type: "inspection",
        vendor_id: vendorB.json().vendor.id,
        started_on: "2026-11-14",
        status: "completed",
        expected_version: createdB.json().version,
      },
    });
    expect(maintenanceB.statusCode, maintenanceB.body).toBe(200);
    expect(maintenanceB.json().maintenance.company_id).toBe(companyBId);
    expect((await first.inject({
      method: "GET",
      url: `/api/v1/assets/${createdB.json().id}/maintenance`,
      headers: authHeader(adminA.token),
    })).statusCode).toBe(404);

    const createRequest = (token: string) => first.inject({
      method: "POST",
      url: "/api/v1/assets/requests",
      headers: { ...authHeader(token), "Idempotency-Key": randomUUID() },
      payload: { request_type: "new", asset_type: "Laptop", reason: "Tenant boundary test device" },
    });
    const requestA = await createRequest(adminA.token);
    const requestB = await createRequest(managerB.token);
    expect(requestA.statusCode, requestA.body).toBe(200);
    expect(requestB.statusCode, requestB.body).toBe(200);
    expect(requestA.json().request.request_code).toBe(requestB.json().request.request_code);

    const queueB = await first.inject({
      method: "GET",
      url: "/api/v1/assets/requests/queue?page=1&page_size=100",
      headers: authHeader(managerB.token),
    });
    expect(queueB.statusCode).toBe(200);
    expect(queueB.json().items).toEqual([
      expect.objectContaining({ id: requestB.json().request.id, company_id: companyBId }),
    ]);
    const foreignDecision = await first.inject({
      method: "POST",
      url: `/api/v1/assets/requests/${requestA.json().request.id}/decision`,
      headers: { ...authHeader(managerB.token), "Idempotency-Key": randomUUID() },
      payload: { decision: "approved", expected_version: requestA.json().request.version },
    });
    expect(foreignDecision.statusCode).toBe(404);

    const assignedB = await first.inject({
      method: "POST",
      url: `/api/v1/assets/${createdB.json().id}/assign`,
      headers: { ...authHeader(managerB.token), "Idempotency-Key": randomUUID() },
      payload: {
        assigned_to_user_id: seedIds.employee2,
        expected_version: maintenanceB.json().asset.version,
      },
    });
    expect(assignedB.statusCode, assignedB.body).toBe(200);
    await first.store.pgPool!.query(
      `INSERT INTO core.user_roles (id, user_id, role_key, status, effective_from, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', current_date, now(), now())`,
      [randomUUID(), seedIds.assetManager, Roles.Admin],
    );
    first.store.users.find((user) => user.id === seedIds.assetManager)!.roles.push(Roles.Admin);
    const managerBAdmin = await loginAs(first, "AST");
    const lifecycleEventId = await recordDurableTermination(first, seedIds.employee2);
    const terminatedB = await first.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: { ...authHeader(managerBAdmin.token), "Idempotency-Key": randomUUID() },
      payload: { employee_user_id: seedIds.employee2, lifecycle_event_id: lifecycleEventId },
    });
    expect(terminatedB.statusCode, terminatedB.body).toBe(200);
    const recoveryB = await first.inject({
      method: "GET",
      url: "/api/v1/assets/recovery-queue?page=1&page_size=100",
      headers: authHeader(managerB.token),
    });
    expect(recoveryB.statusCode).toBe(200);
    expect(recoveryB.json().items).toEqual([
      expect.objectContaining({ company_id: companyBId, asset_id: createdB.json().id }),
    ]);
    const recoveryA = await first.inject({
      method: "GET",
      url: "/api/v1/assets/recovery-queue?page=1&page_size=100",
      headers: authHeader(adminA.token),
    });
    expect(recoveryA.statusCode).toBe(200);
    expect(recoveryA.json().items.some((ticket: { id: string }) => ticket.id === recoveryB.json().items[0].id)).toBe(false);
    const foreignSettlement = await first.inject({
      method: "POST",
      url: `/api/v1/assets/recovery-queue/${recoveryB.json().items[0].id}/settlement`,
      headers: { ...authHeader(adminA.token), "Idempotency-Key": randomUUID() },
      payload: { settlement_status: "recovered", expected_version: recoveryB.json().items[0].version },
    });
    expect(foreignSettlement.statusCode).toBe(404);

    const scopedSnapshot = await first.store.persistence!.assetReadStore!(undefined, companyBId);
    expect(scopedSnapshot.assets).toEqual([expect.objectContaining({ id: createdB.json().id })]);
    expect(scopedSnapshot.assetVendors).toEqual([expect.objectContaining({ id: vendorB.json().vendor.id })]);
    expect(scopedSnapshot.assetRequests).toEqual([expect.objectContaining({ id: requestB.json().request.id })]);
    expect(scopedSnapshot.assetMaintenanceRecords).toEqual([
      expect.objectContaining({ id: maintenanceB.json().maintenance.id, company_id: companyBId }),
    ]);
    expect(scopedSnapshot.assetRecoveryTickets).toEqual([
      expect.objectContaining({ id: recoveryB.json().items[0].id, company_id: companyBId }),
    ]);
  });

  it("fences an old writer and leaves no in-memory ghost after a failed SQL insert", async () => {
    const manager = await loginAs(first, "AST");
    const before = await first.store.pgPool!.query<{ id: string; asset_code: string }>("SELECT id, asset_code FROM assets.assets ORDER BY id LIMIT 1");
    const original = before.rows[0]!;
    await expect(first.store.pgPool!.query("UPDATE assets.assets SET name = 'legacy overwrite' WHERE id = $1", [original.id]))
      .rejects.toMatchObject({ code: "55000" });
    const fence = await first.store.pgPool!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_trigger WHERE tgname = 'require_transactional_writer_trg' AND tgrelid::regclass::text LIKE 'assets.%'",
    );
    expect(fence.rows[0]?.count).toBe("13");
    const failed = await first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: original.asset_code, asset_type: "Laptop", name: "Should never appear" },
    });
    expect(failed.statusCode).toBe(409);
    expect(failed.json()).toMatchObject({
      code: "WORKFLOW_CONFLICT",
      details: { reason: "duplicate_asset_identity" },
    });
    const duplicates = await first.store.pgPool!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.assets WHERE asset_code = $1",
      [original.asset_code],
    );
    expect(duplicates.rows[0]?.count).toBe("1");
    const read = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    expect(read.json().items.some((item: { name: string }) => item.name === "Should never appear")).toBe(false);
  });

  it("maps a database asset identity race to a stable conflict without a ghost", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const originalConnect = pool.connect.bind(pool);
    let wrapped = false;
    let injected = false;
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      if (wrapped) return client;
      wrapped = true;
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO assets.assets") && !injected) {
          injected = true;
          const racer = await originalConnect();
          try {
            await racer.query("BEGIN");
            await racer.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
            await racer.query(
              "UPDATE assets.assets SET asset_code = 'SQL-RACE-S25' WHERE id = (SELECT id FROM assets.assets ORDER BY id LIMIT 1)",
            );
            await racer.query("COMMIT");
          } catch (error) {
            await racer.query("ROLLBACK").catch(() => undefined);
            throw error;
          } finally {
            racer.release();
          }
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);

    try {
      const failed = await first.inject({
        method: "POST",
        url: "/api/v1/assets/",
        headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
        payload: { asset_code: "SQL-RACE-S25", asset_type: "Laptop", name: "Losing concurrent insert" },
      });
      expect(failed.statusCode).toBe(409);
      expect(failed.json()).toMatchObject({
        code: "WORKFLOW_CONFLICT",
        details: { reason: "duplicate_asset_identity" },
      });
    } finally {
      spy.mockRestore();
    }

    expect(injected).toBe(true);
    const durable = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.assets WHERE asset_code = 'SQL-RACE-S25'",
    );
    expect(durable.rows[0]?.count).toBe("1");
    const read = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    expect(read.json().items.some((item: { name: string }) => item.name === "Losing concurrent insert")).toBe(false);
  });

  it("holds current actor authority locks until the asset command commits", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const originalConnect = pool.connect.bind(pool);
    let wrapped = false;
    let actorChecked!: () => void;
    let continueCommand!: () => void;
    const actorCheckedPromise = new Promise<void>((resolve) => { actorChecked = resolve; });
    const continueCommandPromise = new Promise<void>((resolve) => { continueCommand = resolve; });
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      if (wrapped) return client;
      wrapped = true;
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (typeof sql === "string" && sql.includes("SELECT request_hash, response_body")) {
          actorChecked();
          await continueCommandPromise;
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);

    const command = first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: "AUTH-LOCK-S25", asset_type: "Laptop", name: "Authority lock" },
    });
    await actorCheckedPromise;
    const updater = await originalConnect();
    try {
      await updater.query("SET lock_timeout = '150ms'");
      await expect(updater.query(
        "UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2",
        [seedIds.assetManager, Roles.AssetManager],
      )).rejects.toMatchObject({ code: "55P03" });
    } finally {
      updater.release();
      continueCommand();
    }
    try {
      expect((await command).statusCode).toBe(200);
    } finally {
      spy.mockRestore();
    }

    await pool.query(
      "UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2",
      [seedIds.assetManager, Roles.AssetManager],
    );
    const denied = await first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: "AUTH-LOCK-DENIED", asset_type: "Laptop", name: "Denied" },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("orders authority locks behind a concurrent platform flush without deadlock", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const persistence = first.store.persistence;
    if (!persistence?.flushDomain) throw new Error("Expected PostgreSQL domain persistence");
    const originalConnect = pool.connect.bind(pool);
    let connectionNumber = 0;
    let platformAtPreference!: () => void;
    let continuePlatform!: () => void;
    let assetAtCompany!: () => void;
    const platformAtPreferencePromise = new Promise<void>((resolve) => { platformAtPreference = resolve; });
    const continuePlatformPromise = new Promise<void>((resolve) => { continuePlatform = resolve; });
    const assetAtCompanyPromise = new Promise<void>((resolve) => { assetAtCompany = resolve; });
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      connectionNumber += 1;
      const connection = connectionNumber;
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (connection === 1 && typeof sql === "string" && sql.includes("INSERT INTO platform.user_session_preferences")) {
          platformAtPreference();
          await continuePlatformPromise;
        }
        if (connection === 2 && typeof sql === "string" && sql.includes("FROM platform.company_profiles")) {
          assetAtCompany();
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);

    const platformFlush = persistence.flushDomain("platform");
    await platformAtPreferencePromise;
    const command = first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: "LOCK-ORDER-S25", asset_type: "Laptop", name: "Canonical lock order" },
    });
    await assetAtCompanyPromise;
    continuePlatform();
    try {
      await expect(platformFlush).resolves.toBeUndefined();
      const result = await command;
      expect(result.statusCode, result.body).toBe(200);
    } finally {
      spy.mockRestore();
    }

    const durable = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.assets WHERE asset_code = 'LOCK-ORDER-S25'",
    );
    expect(durable.rows[0]?.count).toBe("1");
  });

  it("orders authority locks behind a concurrent full flush without a user-role deadlock", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const persistence = first.store.persistence;
    if (!persistence) throw new Error("Expected PostgreSQL persistence");
    const originalConnect = pool.connect.bind(pool);
    let connectionNumber = 0;
    let assetBackendPid: number | undefined;
    let fullFlushAtRole!: () => void;
    let continueFullFlush!: () => void;
    let assetAtUser!: () => void;
    const fullFlushAtRolePromise = new Promise<void>((resolve) => { fullFlushAtRole = resolve; });
    const continueFullFlushPromise = new Promise<void>((resolve) => { continueFullFlush = resolve; });
    const assetAtUserPromise = new Promise<void>((resolve) => { assetAtUser = resolve; });
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      connectionNumber += 1;
      const connection = connectionNumber;
      if (connection === 2) {
        const pid = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        assetBackendPid = pid.rows[0]?.pid;
      }
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (connection === 1 && typeof sql === "string" && sql.includes("INSERT INTO core.roles")) {
          fullFlushAtRole();
          await continueFullFlushPromise;
        }
        if (connection === 2 && typeof sql === "string" && sql.includes("FROM core.users u")) {
          assetAtUser();
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);

    const fullFlush = persistence.flush();
    await fullFlushAtRolePromise;
    const command = first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: "FULL-LOCK-ORDER-S25", asset_type: "Laptop", name: "Full flush lock order" },
    });
    await assetAtUserPromise;
    const observer = await originalConnect();
    let waitAssertionError: unknown;
    try {
      await vi.waitFor(async () => {
        const activity = await observer.query<{ wait_event_type: string | null; query: string }>(
          "SELECT wait_event_type, query FROM pg_stat_activity WHERE pid = $1",
          [assetBackendPid],
        );
        expect(activity.rows[0]?.wait_event_type).toBe("Lock");
        expect(activity.rows[0]?.query).toContain("FROM core.users u");
      }, { timeout: 2_000, interval: 25 });
    } catch (error) {
      waitAssertionError = error;
    } finally {
      observer.release();
      continueFullFlush();
    }
    try {
      await expect(fullFlush).resolves.toBeUndefined();
      const result = await command;
      expect(result.statusCode, result.body).toBe(200);
      if (waitAssertionError) throw waitAssertionError;
    } finally {
      spy.mockRestore();
    }

    const durable = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.assets WHERE asset_code = 'FULL-LOCK-ORDER-S25'",
    );
    expect(durable.rows[0]?.count).toBe("1");
  });

  it("allows only one same-version assignment across two API instances", async () => {
    second = await buildRealApp({ reset: false });
    await second.ready();
    const firstManager = await loginAs(first, "AST");
    const secondManager = await loginAs(second, "AST");
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(firstManager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    const [a, b] = await Promise.all([
      first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: { ...authHeader(firstManager.token), "Idempotency-Key": randomUUID() }, payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version } }),
      second.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: { ...authHeader(secondManager.token), "Idempotency-Key": randomUUID() }, payload: { assigned_to_user_id: seedIds.employee2, expected_version: asset.version } }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const durable = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.asset_assignments WHERE asset_id = $1 AND status = 'active'", [asset.id]);
    expect(durable.rows[0]?.count).toBe("1");
  });

  it("keeps read-only POST routes out of command persistence and reads fresh state on a stale replica", async () => {
    second = await buildRealApp({ reset: false });
    await second.ready();
    const manager = await loginAs(first, "AST");
    const staleManager = await loginAs(second, "AST");
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number; qr_hash: string };
    const assignees = await second.inject({ method: "GET", url: "/api/v1/assets/assignees", headers: authHeader(staleManager.token) });
    expect(assignees.statusCode).toBe(200);
    expect(assignees.json().items.map((item: { id: string }) => item.id)).toContain(seedIds.employee1);
    const before = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.asset_command_results");
    expect((await first.inject({ method: "POST", url: `/api/v1/assets/scan/${asset.qr_hash}` })).statusCode).toBe(200);
    await first.inject({ method: "POST", url: "/api/v1/assets/licenses/validate", headers: authHeader(manager.token), payload: { product_id: seedIds.licenseProduct, hardware_fingerprint: "test-fingerprint" } });
    const after = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.asset_command_results");
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect((await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() }, payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version } })).statusCode).toBe(200);
    const staleDetail = await second.inject({ method: "GET", url: `/api/v1/assets/${asset.id}`, headers: authHeader(staleManager.token) });
    expect(staleDetail.json().current_assigned_user_id).toBe(seedIds.employee1);
    const qr = await second.inject({ method: "POST", url: `/api/v1/assets/scan/${asset.qr_hash}` });
    expect(qr.json().status).toBe("Assigned");
    const employee = await loginAs(second, "E1");
    const mine = await second.inject({ method: "GET", url: "/api/v1/assets/my", headers: authHeader(employee.token) });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items.map((item: { id: string }) => item.id)).toContain(asset.id);
    const admin = await loginAs(second, "ADM");
    const coreDetail = await second.inject({ method: "GET", url: `/api/v1/core/users/${seedIds.employee1}`, headers: authHeader(admin.token) });
    expect(coreDetail.statusCode).toBe(200);
    expect(coreDetail.json().assets_summary.assigned).toBeGreaterThanOrEqual(1);
    const dashboard = await second.inject({ method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token) });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().operations.assets_assigned).toBeGreaterThanOrEqual(1);
    const report = await second.inject({ method: "GET", url: "/api/v1/reports/assets/summary?page=1&page_size=10", headers: authHeader(admin.token) });
    expect(report.statusCode).toBe(200);
    expect(report.json().items.find((item: { id: string }) => item.id === asset.id)?.assigned_to_user_id).toBe(seedIds.employee1);
  });

  it("uses the bounded indexed public QR lookup for valid and invalid tokens", async () => {
    const manager = await loginAs(first, "AST");
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { qr_hash: string };
    const persistence = first.store.persistence;
    if (!persistence?.assetReadStore || !persistence.assetPublicScan) throw new Error("Expected PostgreSQL asset persistence");
    const originalAssetReadStore = persistence.assetReadStore.bind(persistence);
    persistence.assetReadStore = async () => {
      throw new Error("public QR scan must not hydrate the asset snapshot");
    };
    try {
      const valid = await first.inject({ method: "POST", url: `/api/v1/assets/scan/${asset.qr_hash}` });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toMatchObject({ qr_hash: asset.qr_hash });

      const invalid = await Promise.all(Array.from({ length: 32 }, (_, index) => first.inject({
        method: "POST",
        url: `/api/v1/assets/scan/${index.toString(16).padStart(32, "0")}`,
      })));
      expect(invalid.every((response) => response.statusCode === 404)).toBe(true);
    } finally {
      persistence.assetReadStore = originalAssetReadStore;
    }
  });

  it("allocates a request code beyond imported gaps", async () => {
    const employee = await loginAs(first, "E1");
    const create = (assetType: string) => first.inject({ method: "POST", url: "/api/v1/assets/requests", headers: { ...authHeader(employee.token), "Idempotency-Key": randomUUID() }, payload: { request_type: "new", asset_type: assetType, reason: "Work device needed" } });
    const firstRequest = await create("Laptop");
    expect(firstRequest.statusCode).toBe(200);
    const client = await first.store.pgPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
      await client.query("UPDATE assets.asset_requests SET request_code = 'REQ-999' WHERE id = $1", [firstRequest.json().request.id]);
      await client.query("COMMIT");
    } finally { client.release(); }
    const next = await create("Monitor");
    expect(next.statusCode).toBe(200);
    expect(next.json().request.request_code).toBe("REQ-1000");
  });

  it("does not duplicate termination recovery or its business outbox event across request keys", async () => {
    second = await buildRealApp({ reset: false });
    await second.ready();
    const manager = await loginAs(first, "AST");
    const admin = await loginAs(first, "ADM");
    const otherAdmin = await loginAs(second, "ADM");
    const companyId = first.store.userSessionPreferences.find(
      (item) => item.user_id === seedIds.assetManager,
    )!.company_id!;
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    expect((await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() }, payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version } })).statusCode).toBe(200);
    const forgedByManager = await first.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: randomUUID() },
    });
    expect(forgedByManager.statusCode, forgedByManager.body).toBe(403);
    const forgedByAdmin = await first.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() },
      payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: randomUUID() },
    });
    expect(forgedByAdmin.statusCode, forgedByAdmin.body).toBe(409);
    const mismatchedLifecycleEventId = await recordDurableTermination(first, seedIds.employee2);
    const mismatched = await first.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() },
      payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: mismatchedLifecycleEventId },
    });
    expect(mismatched.statusCode, mismatched.body).toBe(409);
    const lifecycleEventId = await recordDurableTermination(first, seedIds.employee1);
    const event = (app: FastifyInstance, token: string) => app.inject({ method: "POST", url: "/api/v1/assets/events/employee-terminated", headers: { ...authHeader(token), "Idempotency-Key": randomUUID() }, payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: lifecycleEventId } });
    const firstEvent = await event(first, admin.token);
    const secondEvent = await event(second, otherAdmin.token);
    expect(firstEvent.statusCode).toBe(200);
    expect(firstEvent.json().recovery_tickets_created).toBe(1);
    expect(secondEvent.statusCode).toBe(200);
    expect(secondEvent.json().recovery_tickets_created).toBe(0);
    const tickets = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.asset_recovery_tickets WHERE employee_user_id = $1 AND asset_id = $2", [seedIds.employee1, asset.id]);
    expect(tickets.rows[0]?.count).toBe("1");
    const outbox = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM platform.outbox_events WHERE idempotency_key = $1", [`employee.terminated:${companyId}:${seedIds.employee1}:${lifecycleEventId}`]);
    expect(outbox.rows[0]?.count).toBe("1");
  });

  it("recovers an uncertain COMMIT with the same key and no repeated insert", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const originalConnect = pool.connect.bind(pool);
    let simulated = false;
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      const originalQuery = client.query.bind(client);
      let wroteResult = false;
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO assets.asset_command_results")) wroteResult = true;
        if (sql === "COMMIT" && wroteResult && !simulated) {
          const result = await (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
          simulated = true;
          throw new Error("simulated response loss after durable COMMIT");
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);
    const key = randomUUID();
    const command = { method: "POST" as const, url: "/api/v1/assets/", headers: { ...authHeader(manager.token), "Idempotency-Key": key }, payload: { asset_code: "UNCERTAIN-S25", asset_type: "Laptop", name: "Commit replay" } };
    try {
      const lost = await first.inject(command);
      expect(lost.statusCode).toBeGreaterThanOrEqual(500);
      expect(simulated).toBe(true);
    } finally {
      spy.mockRestore();
    }
    const replay = await first.inject(command);
    expect(replay.statusCode).toBe(200);
    const durable = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.assets WHERE asset_code = 'UNCERTAIN-S25'");
    expect(durable.rows[0]?.count).toBe("1");
  });

  it("does not suggest or assign an employee transferred to another company on a stale API instance", async () => {
    second = await buildRealApp({ reset: false });
    await second.ready();
    const manager = await loginAs(first, "AST");
    const staleManager = await loginAs(second, "AST");
    const otherCompanyId = randomUUID();
    await first.store.pgPool!.query(
      "INSERT INTO platform.company_profiles (id, company_name, company_slug, status) VALUES ($1, 'Other test company', $2, 'active')",
      [otherCompanyId, `other-${otherCompanyId}`],
    );
    await first.store.pgPool!.query("UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2", [otherCompanyId, seedIds.employee2]);
    const assignees = await second.inject({ method: "GET", url: "/api/v1/assets/assignees", headers: authHeader(staleManager.token) });
    expect(assignees.statusCode).toBe(200);
    expect(assignees.json().items.map((item: { id: string }) => item.id)).not.toContain(seedIds.employee2);
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    const denied = await second.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: { ...authHeader(staleManager.token), "Idempotency-Key": randomUUID() }, payload: { assigned_to_user_id: seedIds.employee2, expected_version: asset.version } });
    expect(denied.statusCode).toBe(403);
    const durable = await first.store.pgPool!.query<{ current_assigned_user_id: string | null }>("SELECT current_assigned_user_id FROM assets.assets WHERE id = $1", [asset.id]);
    expect(durable.rows[0]?.current_assigned_user_id).toBeNull();
  });

  it("does not settle an old recovery ticket against a later employee assignment", async () => {
    const manager = await loginAs(first, "AST");
    const admin = await loginAs(first, "ADM");
    const headers = () => ({ ...authHeader(manager.token), "Idempotency-Key": randomUUID() });
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const original = inventory.json().items[0] as { id: string; version: number };
    const assignFirst = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/assign`, headers: headers(), payload: { assigned_to_user_id: seedIds.employee1, expected_version: original.version } });
    expect(assignFirst.statusCode).toBe(200);
    const lifecycleEventId = await recordDurableTermination(first, seedIds.employee1);
    const termination = await first.inject({ method: "POST", url: "/api/v1/assets/events/employee-terminated", headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() }, payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: lifecycleEventId } });
    expect(termination.statusCode).toBe(200);
    const queue = await first.inject({ method: "GET", url: "/api/v1/assets/recovery-queue", headers: authHeader(manager.token) });
    const oldTicket = queue.json().items.find((item: { asset_id: string }) => item.asset_id === original.id) as { id: string; version: number; assignment_id: string; assignment_assigned_at: string; review_required: boolean; created_at: string };
    expect(oldTicket).toBeDefined();
    expect(oldTicket.review_required).toBe(false);
    expect(oldTicket.assignment_id).toBeTruthy();
    expect(oldTicket.assignment_assigned_at).toBeTruthy();
    expect(oldTicket.assignment_assigned_at <= oldTicket.created_at).toBe(true);
    const originalAssignment = await first.store.pgPool!.query<{ assigned_at: Date }>(
      "SELECT assigned_at FROM assets.asset_assignments WHERE id = $1",
      [oldTicket.assignment_id],
    );
    expect(oldTicket.assignment_assigned_at).toBe(originalAssignment.rows[0]?.assigned_at.toISOString());
    const returnPending = await first.inject({ method: "GET", url: `/api/v1/assets/${original.id}`, headers: authHeader(manager.token) });
    const returned = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/return`, headers: headers(), payload: { expected_version: returnPending.json().version } });
    expect(returned.statusCode).toBe(200);
    const afterReturnSettlement = await first.inject({ method: "POST", url: `/api/v1/assets/recovery-queue/${oldTicket.id}/settlement`, headers: headers(), payload: { settlement_status: "recovered", expected_version: oldTicket.version } });
    expect(afterReturnSettlement.statusCode).toBe(409);
    const afterReturnQueue = await first.inject({ method: "GET", url: "/api/v1/assets/recovery-queue", headers: authHeader(manager.token) });
    expect(afterReturnQueue.json().items.find((item: { id: string }) => item.id === oldTicket.id)).toMatchObject({ review_required: true, assignment_assigned_at: oldTicket.assignment_assigned_at });
    const maintenance = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/maintenance`, headers: headers(), payload: { maintenance_type: "inspection", started_on: "2026-11-11", status: "completed", expected_version: returned.json().version } });
    expect(maintenance.statusCode).toBe(200);
    const assignSecond = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/assign`, headers: headers(), payload: { assigned_to_user_id: seedIds.employee2, expected_version: maintenance.json().asset.version } });
    expect(assignSecond.statusCode).toBe(200);
    const staleSettlement = await first.inject({ method: "POST", url: `/api/v1/assets/recovery-queue/${oldTicket.id}/settlement`, headers: headers(), payload: { settlement_status: "recovered", expected_version: oldTicket.version } });
    expect(staleSettlement.statusCode).toBe(409);
    const durable = await first.store.pgPool!.query<{ status: string; current_assigned_user_id: string }>("SELECT status, current_assigned_user_id FROM assets.assets WHERE id = $1", [original.id]);
    expect(durable.rows[0]).toMatchObject({ status: "Assigned", current_assigned_user_id: seedIds.employee2 });
    const active = await first.store.pgPool!.query<{ assigned_to_user_id: string; status: string }>("SELECT assigned_to_user_id, status FROM assets.asset_assignments WHERE asset_id = $1 AND status = 'active'", [original.id]);
    expect(active.rows).toEqual([{ assigned_to_user_id: seedIds.employee2, status: "active" }]);
  });

  it("binds recovery to the original assignment even when the same employee is assigned again", async () => {
    const manager = await loginAs(first, "AST");
    const admin = await loginAs(first, "ADM");
    const headers = () => ({ ...authHeader(manager.token), "Idempotency-Key": randomUUID() });
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const original = inventory.json().items[0] as { id: string; version: number };
    const firstAssignment = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/assign`, headers: headers(), payload: { assigned_to_user_id: seedIds.employee1, expected_version: original.version } });
    expect(firstAssignment.statusCode).toBe(200);
    const originalAssignment = await first.store.pgPool!.query<{ id: string }>("SELECT id FROM assets.asset_assignments WHERE asset_id = $1 AND status = 'active'", [original.id]);
    const lifecycleEventId = await recordDurableTermination(first, seedIds.employee1);
    expect((await first.inject({ method: "POST", url: "/api/v1/assets/events/employee-terminated", headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() }, payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: lifecycleEventId } })).statusCode).toBe(200);
    const ticketResult = await first.store.pgPool!.query<{ id: string; assignment_id: string; version: number }>("SELECT id, assignment_id, version FROM assets.asset_recovery_tickets WHERE asset_id = $1 AND status = 'open'", [original.id]);
    const ticket = ticketResult.rows[0]!;
    expect(ticket.assignment_id).toBe(originalAssignment.rows[0]!.id);
    const pending = await first.inject({ method: "GET", url: `/api/v1/assets/${original.id}`, headers: authHeader(manager.token) });
    const returned = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/return`, headers: headers(), payload: { expected_version: pending.json().version } });
    expect(returned.statusCode).toBe(200);
    const maintenance = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/maintenance`, headers: headers(), payload: { maintenance_type: "inspection", started_on: "2026-11-11", status: "completed", expected_version: returned.json().version } });
    expect(maintenance.statusCode).toBe(200);
    await first.store.pgPool!.query(
      "UPDATE core.users SET employment_status = 'active', terminated_on = NULL WHERE id = $1",
      [seedIds.employee1],
    );
    const secondAssignment = await first.inject({ method: "POST", url: `/api/v1/assets/${original.id}/assign`, headers: headers(), payload: { assigned_to_user_id: seedIds.employee1, expected_version: maintenance.json().asset.version } });
    expect(secondAssignment.statusCode).toBe(200);
    const currentAssignment = await first.store.pgPool!.query<{ id: string }>("SELECT id FROM assets.asset_assignments WHERE asset_id = $1 AND status = 'active'", [original.id]);
    expect(currentAssignment.rows[0]!.id).not.toBe(ticket.assignment_id);
    const staleQueue = await first.inject({ method: "GET", url: "/api/v1/assets/recovery-queue", headers: authHeader(manager.token) });
    expect(staleQueue.json().items.find((item: { id: string }) => item.id === ticket.id)).toMatchObject({ review_required: true, assignment_id: ticket.assignment_id });
    const stale = await first.inject({ method: "POST", url: `/api/v1/assets/recovery-queue/${ticket.id}/settlement`, headers: headers(), payload: { settlement_status: "recovered", expected_version: ticket.version } });
    expect(stale.statusCode).toBe(409);
    const durable = await first.store.pgPool!.query<{ status: string; current_assigned_user_id: string; version: number }>("SELECT status, current_assigned_user_id, version FROM assets.assets WHERE id = $1", [original.id]);
    expect(durable.rows[0]).toMatchObject({ status: "Assigned", current_assigned_user_id: seedIds.employee1, version: secondAssignment.json().version });
    const ticketAfter = await first.store.pgPool!.query<{ status: string; version: number }>("SELECT status, version FROM assets.asset_recovery_tickets WHERE id = $1", [ticket.id]);
    expect(ticketAfter.rows[0]).toEqual({ status: "open", version: ticket.version });
  });

  it("fails closed when a legacy recovery ticket cannot be bound to an assignment", async () => {
    const manager = await loginAs(first, "AST");
    const admin = await loginAs(first, "ADM");
    const headers = () => ({ ...authHeader(manager.token), "Idempotency-Key": randomUUID() });
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    expect((await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: headers(), payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version } })).statusCode).toBe(200);
    const lifecycleEventId = await recordDurableTermination(first, seedIds.employee1);
    expect((await first.inject({ method: "POST", url: "/api/v1/assets/events/employee-terminated", headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() }, payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: lifecycleEventId } })).statusCode).toBe(200);
    const ticket = await first.store.pgPool!.query<{ id: string; version: number }>("SELECT id, version FROM assets.asset_recovery_tickets WHERE asset_id = $1 AND status = 'open'", [asset.id]);
    const client = await first.store.pgPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL hrms.asset_writer_v2 = 'on'");
      await client.query("UPDATE assets.asset_recovery_tickets SET assignment_id = NULL WHERE id = $1", [ticket.rows[0]!.id]);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const rejected = await first.inject({ method: "POST", url: `/api/v1/assets/recovery-queue/${ticket.rows[0]!.id}/settlement`, headers: headers(), payload: { settlement_status: "recovered", expected_version: ticket.rows[0]!.version } });
    expect(rejected.statusCode).toBe(409);
    const queue = await first.inject({ method: "GET", url: "/api/v1/assets/recovery-queue", headers: authHeader(manager.token) });
    expect(queue.json().items.find((item: { id: string }) => item.id === ticket.rows[0]!.id)).toMatchObject({ assignment_id: null, assignment_assigned_at: null, review_required: true });
    const durable = await first.store.pgPool!.query<{ status: string; current_assigned_user_id: string }>("SELECT status, current_assigned_user_id FROM assets.assets WHERE id = $1", [asset.id]);
    expect(durable.rows[0]).toEqual({ status: "Return Pending", current_assigned_user_id: seedIds.employee1 });
    const openTicket = await first.store.pgPool!.query<{ status: string; assignment_id: string | null }>("SELECT status, assignment_id FROM assets.asset_recovery_tickets WHERE id = $1", [ticket.rows[0]!.id]);
    expect(openTicket.rows[0]).toEqual({ status: "open", assignment_id: null });
  });

  it("denies historical Admin acknowledgement replay after durable Admin role removal", async () => {
    const manager = await loginAs(first, "AST");
    const admin = await loginAs(first, "ADM");
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    const assigned = await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() }, payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version } });
    expect(assigned.statusCode).toBe(200);
    const acknowledgement = { method: "POST" as const, url: `/api/v1/assets/${asset.id}/acknowledgements`, headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() }, payload: { acknowledgement_type: "received", expected_version: assigned.json().version } };
    const original = await first.inject(acknowledgement);
    expect(original.statusCode).toBe(200);
    expect((await first.inject(acknowledgement)).statusCode).toBe(200);
    await first.store.pgPool!.query("UPDATE core.user_roles SET status = 'inactive' WHERE user_id = $1 AND role_key = $2", [seedIds.admin, Roles.Admin]);
    expect((await first.inject(acknowledgement)).statusCode).toBe(403);
    const durable = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.asset_acknowledgements WHERE asset_id = $1", [asset.id]);
    expect(durable.rows[0]?.count).toBe("1");
  });

  it("replays a historical employee acknowledgement after reassignment without allowing a new one", async () => {
    const manager = await loginAs(first, "AST");
    const employee = await loginAs(first, "E1");
    const managerHeaders = () => ({ ...authHeader(manager.token), "Idempotency-Key": randomUUID() });
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    const assigned = await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: managerHeaders(), payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version } });
    expect(assigned.statusCode).toBe(200);
    const key = randomUUID();
    const acknowledgement = { method: "POST" as const, url: `/api/v1/assets/${asset.id}/acknowledgements`, headers: { ...authHeader(employee.token), "Idempotency-Key": key }, payload: { acknowledgement_type: "received", expected_version: assigned.json().version } };
    const firstAck = await first.inject(acknowledgement);
    expect(firstAck.statusCode).toBe(200);
    const returned = await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/return`, headers: managerHeaders(), payload: { expected_version: firstAck.json().version } });
    expect(returned.statusCode).toBe(200);
    const maintenance = await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/maintenance`, headers: managerHeaders(), payload: { maintenance_type: "inspection", started_on: "2026-11-11", status: "completed", expected_version: returned.json().version } });
    expect(maintenance.statusCode).toBe(200);
    expect((await first.inject({ method: "POST", url: `/api/v1/assets/${asset.id}/assign`, headers: managerHeaders(), payload: { assigned_to_user_id: seedIds.employee2, expected_version: maintenance.json().asset.version } })).statusCode).toBe(200);
    const replay = await first.inject(acknowledgement);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(firstAck.json());
    const fresh = await first.inject({ ...acknowledgement, headers: { ...authHeader(employee.token), "Idempotency-Key": randomUUID() } });
    expect(fresh.statusCode).toBe(403);
    const durable = await first.store.pgPool!.query<{ count: string }>("SELECT count(*)::text AS count FROM assets.asset_acknowledgements WHERE asset_id = $1", [asset.id]);
    expect(durable.rows[0]?.count).toBe("1");
  });

  it("fails closed when command-only asset persistence is missing or removes a durable row", async () => {
    const persistence = first.store.persistence;
    if (!persistence?.assetCommand || !persistence.flushDomain) {
      throw new Error("Expected PostgreSQL asset persistence");
    }
    const originalAssetCommand = persistence.assetCommand;
    persistence.assetCommand = undefined;
    try {
      await expect(persistence.flush()).rejects.toThrow(/Asset command persistence is required/u);
    } finally {
      persistence.assetCommand = originalAssetCommand;
    }

    await expect(persistence.flushDomain("assets"))
      .rejects.toThrow(/Asset writes require an assetCommand transaction/u);

    const manager = first.store.users.find((user) => user.id === seedIds.assetManager)!;
    const companyId = first.store.userSessionPreferences.find((item) => item.user_id === manager.id)!.company_id!;
    const durableBefore = await first.store.pgPool!.query<{ id: string }>(
      "SELECT id FROM assets.assets ORDER BY id",
    );
    await expect(persistence.assetCommand(
      {
        companyId,
        actorUserId: manager.id,
        actionKey: "assets.test.remove-row",
        idempotencyKey: randomUUID(),
        requestHash: "a".repeat(64),
      },
      () => undefined,
      (store) => {
        store.assets.pop();
        return { removed: true };
      },
    )).rejects.toThrow(/removed a row from assets/u);
    const durableAfter = await first.store.pgPool!.query<{ id: string }>(
      "SELECT id FROM assets.assets ORDER BY id",
    );
    expect(durableAfter.rows).toEqual(durableBefore.rows);
  });

  it("rolls back failed snapshot reads and refuses a second initial asset seed", async () => {
    const persistence = first.store.persistence as typeof first.store.persistence & {
      flushInitialAssetSeed(): Promise<void>;
    };
    if (!persistence?.assetReadStore || !persistence.flushInitialAssetSeed) {
      throw new Error("Expected PostgreSQL asset persistence");
    }
    await expect(persistence.flushInitialAssetSeed())
      .rejects.toThrow(/requires empty asset tables/u);

    const pool = first.store.pgPool!;
    const originalConnect = pool.connect.bind(pool);
    let wrapped = false;
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      if (wrapped) return client;
      wrapped = true;
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (typeof sql === "string" && sql.includes("FROM assets.assets")) {
          throw new Error("simulated snapshot read failure");
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);
    try {
      await expect(persistence.assetReadStore()).rejects.toThrow(/simulated snapshot read failure/u);
    } finally {
      spy.mockRestore();
    }
    expect((await pool.query<{ value: number }>("SELECT 1 AS value")).rows[0]?.value).toBe(1);
  });

  it("preserves primary asset failures when rollback reporting also fails", async () => {
    const manager = await loginAs(first, "AST");
    const employee = await loginAs(first, "E1");
    const persistence = first.store.persistence as typeof first.store.persistence & {
      flushInitialAssetSeed(): Promise<void>;
    };
    if (!persistence?.assetReadStore || !persistence.flushInitialAssetSeed) {
      throw new Error("Expected PostgreSQL asset persistence");
    }
    const pool = first.store.pgPool!;
    const originalConnect = pool.connect.bind(pool);
    let destroyedClients = 0;

    const interceptNextClient = (primaryFailure?: (sql: string) => Error | undefined) => {
      const spy = vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
        const client = await originalConnect();
        const originalQuery = client.query.bind(client);
        const originalRelease = client.release.bind(client);
        client.release = ((destroy?: Error | boolean) => {
          if (destroy === true) destroyedClients += 1;
          originalRelease(destroy);
        }) as typeof client.release;
        client.query = (async (sql: unknown, ...args: unknown[]) => {
          if (typeof sql === "string") {
            const failure = primaryFailure?.(sql);
            if (failure) throw failure;
            if (sql === "ROLLBACK") {
              throw new Error("simulated rollback transport failure");
            }
          }
          return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
        }) as typeof client.query;
        return client;
      });
      return spy;
    };

    let spy = interceptNextClient();
    await expect(persistence.flushInitialAssetSeed()).rejects.toThrow(/requires empty asset tables/u);
    spy.mockRestore();

    spy = interceptNextClient((sql) => sql.includes("FROM assets.assets")
      ? new Error("simulated snapshot read failure")
      : undefined);
    await expect(persistence.assetReadStore()).rejects.toThrow(/simulated snapshot read failure/u);
    spy.mockRestore();

    spy = interceptNextClient();
    const deniedAssignees = await first.inject({
      method: "GET",
      url: "/api/v1/assets/assignees",
      headers: authHeader(employee.token),
    });
    expect(deniedAssignees.statusCode).toBe(403);
    expect(deniedAssignees.json().message).toMatch(/Asset Manager role required/u);
    spy.mockRestore();

    spy = interceptNextClient((sql) => sql.includes("pg_advisory_xact_lock")
      ? Object.assign(new Error("simulated lock timeout"), { code: "55P03" })
      : undefined);
    const busy = await first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: "BUSY-S25", asset_type: "Laptop", name: "Busy command" },
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().message).toMatch(/busy; retry with the same Idempotency-Key/u);
    spy.mockRestore();

    const originalAssetCommand = persistence.assetCommand;
    persistence.assetCommand = undefined;
    spy = interceptNextClient();
    try {
      await expect(persistence.flush()).rejects.toThrow(/Asset command persistence is required/u);
    } finally {
      persistence.assetCommand = originalAssetCommand;
      spy.mockRestore();
    }

    expect(destroyedClients).toBe(5);
    expect((await pool.query<{ value: number }>("SELECT 1 AS value")).rows[0]?.value).toBe(1);
  });

  it("rechecks inactive actor, company, preference, and in-memory identity for every command", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const create = (code: string) => first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { asset_code: code, asset_type: "Laptop", name: code },
    });

    await pool.query("UPDATE core.users SET employment_status = 'inactive' WHERE id = $1", [seedIds.assetManager]);
    expect((await create("AUTH-INACTIVE-S25")).statusCode).toBe(401);
    expect((await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) })).statusCode).toBe(401);
    await pool.query("UPDATE core.users SET employment_status = 'active' WHERE id = $1", [seedIds.assetManager]);

    const companyId = first.store.userSessionPreferences.find((item) => item.user_id === seedIds.assetManager)!.company_id!;
    await pool.query("UPDATE platform.company_profiles SET status = 'inactive' WHERE id = $1", [companyId]);
    expect((await create("AUTH-COMPANY-S25")).statusCode).toBe(400);
    expect((await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) })).statusCode).toBe(400);
    await pool.query("UPDATE platform.company_profiles SET status = 'active' WHERE id = $1", [companyId]);

    const otherCompanyId = randomUUID();
    await pool.query(
      "INSERT INTO platform.company_profiles (id, company_name, company_slug, status) VALUES ($1, 'Preference test company', $2, 'active')",
      [otherCompanyId, `preference-${otherCompanyId}`],
    );
    await pool.query("UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2", [otherCompanyId, seedIds.assetManager]);
    expect((await create("AUTH-PREFERENCE-S25")).statusCode).toBe(400);
    expect((await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) })).statusCode).toBe(400);
    await pool.query("UPDATE platform.user_session_preferences SET company_id = $1 WHERE user_id = $2", [companyId, seedIds.assetManager]);

    const persistence = first.store.persistence!;
    const cachedIndex = first.store.users.findIndex((user) => user.id === seedIds.assetManager);
    const [cached] = first.store.users.splice(cachedIndex, 1);
    try {
      await expect(persistence.assetCommand!(
        {
          companyId,
          actorUserId: seedIds.assetManager,
          actionKey: "assets.test.missing-cache",
          idempotencyKey: randomUUID(),
          requestHash: "b".repeat(64),
        },
        () => undefined,
        () => ({ ok: true }),
      )).rejects.toThrow(/User no longer exists/u);
    } finally {
      first.store.users.splice(cachedIndex, 0, cached!);
    }
  });

  it("rejects an outbox idempotency collision without committing recovery state", async () => {
    const manager = await loginAs(first, "AST");
    const admin = await loginAs(first, "ADM");
    const companyId = first.store.userSessionPreferences.find(
      (item) => item.user_id === seedIds.assetManager,
    )!.company_id!;
    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    expect((await first.inject({
      method: "POST",
      url: `/api/v1/assets/${asset.id}/assign`,
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version },
    })).statusCode).toBe(200);
    const lifecycleEventId = await recordDurableTermination(first, seedIds.employee1);

    await first.store.pgPool!.query(
      `INSERT INTO platform.outbox_events
       (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, retry_count, available_at, created_at)
       VALUES ($1, 'employee', $2, 'employee.wrong', '{}'::jsonb, $3, 'pending', 0, now(), now())`,
      [randomUUID(), seedIds.employee1, `employee.terminated:${companyId}:${seedIds.employee1}:${lifecycleEventId}`],
    );
    const response = await first.inject({
      method: "POST",
      url: "/api/v1/assets/events/employee-terminated",
      headers: { ...authHeader(admin.token), "Idempotency-Key": randomUUID() },
      payload: { employee_user_id: seedIds.employee1, lifecycle_event_id: lifecycleEventId },
    });
    expect(response.statusCode).toBe(409);
    const tickets = await first.store.pgPool!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets.asset_recovery_tickets WHERE employee_user_id = $1",
      [seedIds.employee1],
    );
    expect(tickets.rows[0]?.count).toBe("0");
  });

  it("validates command keys, escapes assignee search, and rejects malformed acknowledgement replay", async () => {
    const manager = await loginAs(first, "AST");
    const employee = await loginAs(first, "E1");
    const payload = { asset_code: "KEY-VALIDATION-S25", asset_type: "Laptop", name: "Command key validation" };
    expect((await first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: authHeader(manager.token),
      payload,
    })).statusCode).toBe(400);

    const missingAssetAcknowledgement = await first.inject({
      method: "POST",
      url: `/api/v1/assets/${randomUUID()}/acknowledgements`,
      headers: { ...authHeader(employee.token), "Idempotency-Key": randomUUID() },
      payload: { acknowledgement_type: "received", expected_version: 1 },
    });
    expect(missingAssetAcknowledgement.statusCode).toBe(403);
    expect((await first.inject({
      method: "POST",
      url: "/api/v1/assets/",
      headers: { ...authHeader(manager.token), "Idempotency-Key": "short" },
      payload,
    })).statusCode).toBe(400);

    const escapedSearch = await first.inject({
      method: "GET",
      url: "/api/v1/assets/assignees?q=%25%5F",
      headers: authHeader(manager.token),
    });
    expect(escapedSearch.statusCode).toBe(200);
    expect(escapedSearch.json().items).toEqual([]);

    const inventory = await first.inject({ method: "GET", url: "/api/v1/assets", headers: authHeader(manager.token) });
    const asset = inventory.json().items[0] as { id: string; version: number };
    const assigned = await first.inject({
      method: "POST",
      url: `/api/v1/assets/${asset.id}/assign`,
      headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
      payload: { assigned_to_user_id: seedIds.employee1, expected_version: asset.version },
    });
    expect(assigned.statusCode).toBe(200);
    const replayKey = randomUUID();
    const acknowledgement = {
      method: "POST" as const,
      url: `/api/v1/assets/${asset.id}/acknowledgements`,
      headers: { ...authHeader(employee.token), "Idempotency-Key": replayKey },
      payload: { acknowledgement_type: "received", expected_version: assigned.json().version },
    };
    expect((await first.inject(acknowledgement)).statusCode).toBe(200);
    const tamper = await first.store.pgPool!.connect();
    try {
      await tamper.query("BEGIN");
      await tamper.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
      await tamper.query(
        "UPDATE assets.asset_command_results SET response_body = '{}'::jsonb WHERE actor_user_id = $1 AND idempotency_key = $2",
        [seedIds.employee1, replayKey],
      );
      await tamper.query("COMMIT");
    } catch (error) {
      await tamper.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      tamper.release();
    }
    expect((await first.inject(acknowledgement)).statusCode).toBe(403);

    const nullTamper = await first.store.pgPool!.connect();
    try {
      await nullTamper.query("BEGIN");
      await nullTamper.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
      await nullTamper.query(
        "UPDATE assets.asset_command_results SET response_body = 'null'::jsonb WHERE actor_user_id = $1 AND idempotency_key = $2",
        [seedIds.employee1, replayKey],
      );
      await nullTamper.query("COMMIT");
    } finally {
      nullTamper.release();
    }
    expect((await first.inject(acknowledgement)).statusCode).toBe(403);
  });

  it("does not misclassify an unknown unique violation as an asset identity conflict", async () => {
    const manager = await loginAs(first, "AST");
    const pool = first.store.pgPool!;
    const originalConnect = pool.connect.bind(pool);
    let wrapped = false;
    const spy = vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = await originalConnect();
      if (wrapped) return client;
      wrapped = true;
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: unknown, ...args: unknown[]) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO assets.assets")) {
          throw Object.assign(new Error("unknown unique violation"), { code: "23505" });
        }
        return (originalQuery as (...items: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect);
    try {
      const response = await first.inject({
        method: "POST",
        url: "/api/v1/assets/",
        headers: { ...authHeader(manager.token), "Idempotency-Key": randomUUID() },
        payload: { asset_code: "UNKNOWN-UQ-S25", asset_type: "Laptop", name: "Unknown constraint" },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().details?.reason).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("disposable reset guard", () => {
  it("rejects nonlocal and non-test targets before connecting", () => {
    expect(() => assertDisposableResetTarget("not a database url"))
      .toThrow(/Refusing database reset/u);
    expect(() => assertDisposableResetTarget("postgresql://user:pass@db.example/hrms_test"))
      .toThrow(/Refusing database reset/u);
    expect(() => assertDisposableResetTarget("postgresql://user:pass@127.0.0.1/hrms_prod"))
      .toThrow(/Refusing database reset/u);
    expect(() => assertDisposableResetTarget("postgresql://user:pass@127.0.0.1/hrms_test?host=db.example"))
      .toThrow(/Refusing database reset/u);
    expect(() => assertDisposableResetTarget("postgresql://user:pass@127.0.0.1/hrms_ci_test"))
      .not.toThrow();
  });
});
