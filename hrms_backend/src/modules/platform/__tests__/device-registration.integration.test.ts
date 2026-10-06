import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Roles } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

type TestApp = FastifyInstance;

const forbiddenPayloadKeys = new Set([
  "installation_id",
  "installation_id_hash",
  "installation_hash",
  "device_id",
  "push_token",
  "attestation",
  "provider_metadata",
  "headers",
  "ip_address",
  "user_agent",
  "metadata",
]);

const forbiddenAdminDeviceKeys = new Set([
  "installation_id_hash",
  "company_id",
  "user_id",
  "offline_sequence_cursor",
  "attestation",
  "public_key",
  "private_key",
  "secret",
  "secrets",
  "keys",
]);

describe("platform device registration API", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildRealApp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("requires authentication for register and list", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/platform/devices",
      payload: { installation_id_hash: hash("a"), platform: "android" },
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/platform/devices",
    });

    expect(register.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
  });

  it("strictly validates device registration input", async () => {
    const employee = await loginAs(app, "E1");

    const invalidPlatform = await registerDevice(employee.token, {
      installation_id_hash: hash("b"),
      platform: "web",
    });
    const invalidHash = await registerDevice(employee.token, {
      installation_id_hash: "A".repeat(64),
      platform: "ios",
    });
    const clientIdentity = await registerDevice(employee.token, {
      installation_id_hash: hash("c"),
      platform: "android",
      company_id: "10000000-0000-4000-8000-000000000001",
      user_id: employee.user.id,
      status: "registered",
      owner_user_id: employee.user.id,
    });

    expect(invalidPlatform.statusCode).toBe(400);
    expect(invalidHash.statusCode).toBe(400);
    expect(clientIdentity.statusCode).toBe(400);
  });

  it("registers a first device with server-derived owner and one outbox event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("d");

    const response = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      platform: "android",
      status: "registered",
    });
    expect(body.registered_device_id).toEqual(expect.any(String));
    expect(body.company_id).toBeUndefined();
    expect(body.user_id).toBeUndefined();
    expect(body.installation_id_hash).toBeUndefined();

    const rows = await app.store.pgPool!.query<{
      id: string;
      company_id: string;
      user_id: string;
      installation_id_hash: string;
      platform: string;
      status: string;
    }>(
      `SELECT id, company_id, user_id, installation_id_hash, platform, status
       FROM platform.registered_devices
       WHERE company_id = $1 AND installation_id_hash = $2`,
      [companyId, installationHash],
    );
    expect(rows.rows).toEqual([
      {
        id: body.registered_device_id,
        company_id: companyId,
        user_id: employee.user.id,
        installation_id_hash: installationHash,
        platform: "android",
        status: "registered",
      },
    ]);

    const events = await outboxEvents(body.registered_device_id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregate_type: "device",
      aggregate_id: body.registered_device_id,
      event_type: "platform.device.registered",
      idempotency_key: `platform.device.registered:${body.registered_device_id}`,
    });
    expect(events[0]!.payload).toEqual({
      schema_version: 1,
      company_id: companyId,
      user_id: employee.user.id,
      registered_device_id: body.registered_device_id,
      platform: "android",
      status: "registered",
      registered_at: body.created_at,
    });
    expectNoForbiddenPayloadKeys(events[0]!.payload);
  });

  it("retries same owner/company/installation without another row or event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("e");

    const first = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "ios",
    });
    const retry = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "ios",
    });

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());

    const counts = await app.store.pgPool!.query<{
      devices: string;
      events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM platform.registered_devices WHERE company_id = $1 AND installation_id_hash = $2) AS devices,
         (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $3 AND event_type = 'platform.device.registered') AS events`,
      [companyId, installationHash, first.json().registered_device_id],
    );
    expect(counts.rows[0]).toEqual({ devices: "1", events: "1" });
  });

  it("keeps concurrent duplicate registration to one row and one event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("f");

    const [left, right] = await Promise.all([
      registerDevice(employee.token, {
        installation_id_hash: installationHash,
        platform: "android",
      }),
      registerDevice(employee.token, {
        installation_id_hash: installationHash,
        platform: "android",
      }),
    ]);

    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 201]);
    expect(left.json()).toEqual(right.json());

    const counts = await app.store.pgPool!.query<{
      devices: string;
      events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM platform.registered_devices WHERE company_id = $1 AND installation_id_hash = $2) AS devices,
         (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = $3 AND event_type = 'platform.device.registered') AS events`,
      [companyId, installationHash, left.json().registered_device_id],
    );
    expect(counts.rows[0]).toEqual({ devices: "1", events: "1" });
  });

  it("rejects cross-owner claims without mutating ownership", async () => {
    const employee1 = await loginAs(app, "E1");
    const employee2 = await loginAs(app, "E2");
    const companyId = await activeCompanyId(employee1.user.id);
    const installationHash = hash("1");

    const first = await registerDevice(employee1.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });
    const second = await registerDevice(employee2.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    const owner = await app.store.pgPool!.query<{ user_id: string }>(
      `SELECT user_id
       FROM platform.registered_devices
       WHERE company_id = $1 AND installation_id_hash = $2`,
      [companyId, installationHash],
    );
    expect(owner.rows[0]?.user_id).toBe(employee1.user.id);
    expect(await outboxEvents(first.json().registered_device_id)).toHaveLength(
      1,
    );
  });

  it.each([
    ["suspended", hash("2")],
    ["revoked", hash("3")],
  ] as const)(
    "rejects re-registration for %s devices",
    async (status, installationHash) => {
      const employee = await loginAs(app, "E1");
      const companyId = await activeCompanyId(employee.user.id);
      const deviceId = await insertDevice({
        companyId,
        userId: employee.user.id,
        installationHash,
        platform: "ios",
        status,
      });

      const response = await registerDevice(employee.token, {
        installation_id_hash: installationHash,
        platform: "ios",
      });

      expect(response.statusCode).toBe(409);
      const row = await app.store.pgPool!.query<{ status: string }>(
        `SELECT status FROM platform.registered_devices WHERE id = $1`,
        [deviceId],
      );
      expect(row.rows[0]?.status).toBe(status);
      expect(await outboxEvents(deviceId)).toHaveLength(0);
    },
  );

  it("lists only the authenticated actor's devices in the active company", async () => {
    const employee1 = await loginAs(app, "E1");
    const employee2 = await loginAs(app, "E2");
    const companyId = await activeCompanyId(employee1.user.id);
    const otherCompanyId = "10000000-0000-4000-8000-0000000000aa";
    const otherUserId = "20000000-0000-4000-8000-0000000000aa";
    await insertOtherCompanyUser(otherCompanyId, otherUserId);

    const ownRegistered = await registerDevice(employee1.token, {
      installation_id_hash: hash("4"),
      platform: "android",
    });
    const ownSuspended = await insertDevice({
      companyId,
      userId: employee1.user.id,
      installationHash: hash("5"),
      platform: "ios",
      status: "suspended",
    });
    const ownRevoked = await insertDevice({
      companyId,
      userId: employee1.user.id,
      installationHash: hash("6"),
      platform: "android",
      status: "revoked",
    });
    const otherUserDevice = await insertDevice({
      companyId,
      userId: employee2.user.id,
      installationHash: hash("7"),
      platform: "ios",
      status: "registered",
    });
    const otherCompanyDevice = await insertDevice({
      companyId: otherCompanyId,
      userId: otherUserId,
      installationHash: hash("8"),
      platform: "android",
      status: "registered",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/platform/devices",
      headers: authHeader(employee1.token),
    });

    expect(response.statusCode).toBe(200);
    const ids = response
      .json()
      .items.map(
        (item: { registered_device_id: string }) => item.registered_device_id,
      );
    expect(ids).toContain(ownRegistered.json().registered_device_id);
    expect(ids).toContain(ownSuspended);
    expect(ids).toContain(ownRevoked);
    expect(ids).not.toContain(otherUserDevice);
    expect(ids).not.toContain(otherCompanyDevice);
    expect(
      response.json().items.map((item: { status: string }) => item.status),
    ).toEqual(expect.arrayContaining(["registered", "revoked", "suspended"]));
  });

  it("requires Admin role for the company device inventory", async () => {
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/v1/platform/admin/devices",
    });
    const employeeResponse = await adminDeviceList(employee.token);
    const hrManagerResponse = await withTemporaryActiveRole(
      "E2",
      Roles.HRManager,
      async (token) => adminDeviceList(token),
    );
    const adminResponse = await adminDeviceList(admin.token);

    expect(unauthenticated.statusCode).toBe(401);
    expect(employeeResponse.statusCode).toBe(403);
    expect(hrManagerResponse.statusCode).toBe(403);
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json()).toMatchObject({
      items: expect.any(Array),
      page: 1,
      page_size: 25,
      total: expect.any(Number),
    });
  });

  it("lists company devices for Admin with filters, pagination, redaction, and revoke compatibility", async () => {
    const admin = await loginAs(app, "ADM");
    const companyId = await activeCompanyId(admin.user.id);
    const suffix = randomUUID().replace(/-/gu, "").slice(0, 8).toUpperCase();
    const prefix = `MOB${suffix}`;
    const ownerA = await insertInventoryOwner({
      companyId,
      employeeCode: `${prefix}A`,
      fullName: `Mobile Inventory Alpha ${suffix}`,
    });
    const ownerB = await insertInventoryOwner({
      companyId,
      employeeCode: `${prefix}B`,
      fullName: `Mobile Inventory Beta ${suffix}`,
    });
    const otherCompanyId = "10000000-0000-4000-8000-0000000000cc";
    await insertOtherCompanyProfile(otherCompanyId);
    const otherTenantOwner = await insertInventoryOwner({
      companyId: otherCompanyId,
      employeeCode: `${prefix}Z`,
      fullName: `Mobile Inventory Other ${suffix}`,
    });

    const alphaRegistered = await insertDevice({
      companyId,
      userId: ownerA,
      installationHash: uniqueHash("admin-list-alpha-registered"),
      platform: "android",
      status: "registered",
      createdAt: "2026-08-09T00:00:00.000Z",
      statusChangedAt: "2026-08-09T01:00:00.000Z",
      updatedAt: "2026-08-09T01:00:00.000Z",
    });
    const alphaSuspended = await insertDevice({
      companyId,
      userId: ownerA,
      installationHash: uniqueHash("admin-list-alpha-suspended"),
      platform: "ios",
      status: "suspended",
      createdAt: "2026-08-10T00:00:00.000Z",
      statusChangedAt: "2026-08-10T02:00:00.000Z",
      updatedAt: "2026-08-10T02:00:00.000Z",
    });
    const alphaRevoked = await insertDevice({
      companyId,
      userId: ownerA,
      installationHash: uniqueHash("admin-list-alpha-revoked"),
      platform: "android",
      status: "revoked",
      createdAt: "2026-08-10T00:30:00.000Z",
      statusChangedAt: "2026-08-10T01:30:00.000Z",
      updatedAt: "2026-08-10T01:30:00.000Z",
    });
    const betaSuspended = await insertDevice({
      companyId,
      userId: ownerB,
      installationHash: uniqueHash("admin-list-beta-suspended"),
      platform: "android",
      status: "suspended",
      createdAt: "2026-08-11T00:00:00.000Z",
      statusChangedAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    });
    const otherTenantDevice = await insertDevice({
      companyId: otherCompanyId,
      userId: otherTenantOwner,
      installationHash: uniqueHash("admin-list-other-tenant"),
      platform: "android",
      status: "registered",
    });

    const alphaDefault = await adminDeviceList(admin.token, {
      q: `${prefix}A`,
      page: 1,
      page_size: 10,
    });
    expect(alphaDefault.statusCode).toBe(200);
    expect(alphaDefault.json()).toMatchObject({
      page: 1,
      page_size: 10,
      total: 3,
    });
    expect(adminDeviceIds(alphaDefault.json())).toEqual([
      alphaSuspended,
      alphaRevoked,
      alphaRegistered,
    ]);
    expect(alphaDefault.json().items[0]).toMatchObject({
      registered_device_id: alphaSuspended,
      platform: "ios",
      status: "suspended",
      owner: {
        employee_code: `${prefix}A`,
        full_name: `Mobile Inventory Alpha ${suffix}`,
      },
    });
    expectNoForbiddenAdminDeviceKeys(alphaDefault.json());

    const suspendedFilter = await adminDeviceList(admin.token, {
      q: `${prefix}A`,
      status: "suspended",
    });
    expect(adminDeviceIds(suspendedFilter.json())).toEqual([alphaSuspended]);

    const platformFilter = await adminDeviceList(admin.token, {
      q: `${prefix}A`,
      platform: "ios",
    });
    expect(adminDeviceIds(platformFilter.json())).toEqual([alphaSuspended]);

    const deviceIdSearch = await adminDeviceList(admin.token, {
      q: alphaRegistered,
    });
    expect(deviceIdSearch.json()).toMatchObject({ total: 0, items: [] });

    const secondPage = await adminDeviceList(admin.token, {
      q: `${prefix}A`,
      page: 2,
      page_size: 2,
    });
    expect(secondPage.json()).toMatchObject({
      page: 2,
      page_size: 2,
      total: 3,
    });
    expect(adminDeviceIds(secondPage.json())).toEqual([alphaRegistered]);

    const employeeCodeSort = await adminDeviceList(admin.token, {
      q: prefix,
      sort: "employee_code_asc",
      page_size: 10,
    });
    const sortedItems = employeeCodeSort.json().items as Array<{
      registered_device_id: string;
      owner: { employee_code: string };
    }>;
    expect(sortedItems.map((item) => item.registered_device_id)).not.toContain(
      otherTenantDevice,
    );
    expect(sortedItems.at(-1)?.registered_device_id).toBe(betaSuspended);
    expect(sortedItems.at(-1)?.owner.employee_code).toBe(`${prefix}B`);

    const revoke = await lifecycleRequest(
      admin.token,
      alphaRegistered,
      "revoke",
      { reason: "administrative" },
    );
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toMatchObject({
      registered_device_id: alphaRegistered,
      status: "revoked",
    });

    const revokedFilter = await adminDeviceList(admin.token, {
      q: `${prefix}A`,
      status: "revoked",
      sort: "status_changed_at_desc",
    });
    expect(adminDeviceIds(revokedFilter.json())).toContain(alphaRegistered);
  });

  it("rejects a retry when the installation platform conflicts with the existing registration", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const installationHash = hash("9");

    const first = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "android",
    });

    const conflictingRetry = await registerDevice(employee.token, {
      installation_id_hash: installationHash,
      platform: "ios",
    });

    expect(first.statusCode).toBe(201);
    expect(conflictingRetry.statusCode).toBe(409);

    const rows = await app.store.pgPool!.query<{
      id: string;
      platform: string;
      user_id: string;
    }>(
      `SELECT id, platform, user_id
     FROM platform.registered_devices
     WHERE company_id = $1
       AND installation_id_hash = $2`,
      [companyId, installationHash],
    );

    expect(rows.rows).toEqual([
      {
        id: first.json().registered_device_id,
        platform: "android",
        user_id: employee.user.id,
      },
    ]);

    expect(await outboxEvents(first.json().registered_device_id)).toHaveLength(
      1,
    );
  });

  it("allows the owner to revoke their own registered or suspended device", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const registeredDeviceId = await insertDevice({
      companyId,
      userId: employee.user.id,
      installationHash: uniqueHash("owner-registered"),
      platform: "android",
      status: "registered",
    });
    const suspendedDeviceId = await insertDevice({
      companyId,
      userId: employee.user.id,
      installationHash: uniqueHash("owner-suspended"),
      platform: "ios",
      status: "suspended",
    });

    const registeredRevoke = await lifecycleRequest(
      employee.token,
      registeredDeviceId,
      "revoke",
      { reason: "lost" },
    );
    const suspendedRevoke = await lifecycleRequest(
      employee.token,
      suspendedDeviceId,
      "revoke",
      { reason: "replaced" },
    );

    expect(registeredRevoke.statusCode).toBe(200);
    expect(registeredRevoke.json()).toMatchObject({ status: "revoked" });
    expect(suspendedRevoke.statusCode).toBe(200);
    expect(suspendedRevoke.json()).toMatchObject({ status: "revoked" });
    expect(
      await lifecycleEventCount(registeredDeviceId, "platform.device.revoked"),
    ).toBe("1");
    expect(
      await lifecycleEventCount(suspendedDeviceId, "platform.device.revoked"),
    ).toBe("1");
  });

  it("prevents owners and non-owners from using admin lifecycle powers", async () => {
    const owner = await loginAs(app, "E1");
    const other = await loginAs(app, "E2");
    const companyId = await activeCompanyId(owner.user.id);
    const deviceId = await insertDevice({
      companyId,
      userId: owner.user.id,
      installationHash: uniqueHash("owner-admin-denied"),
      platform: "android",
      status: "registered",
    });

    const suspend = await lifecycleRequest(owner.token, deviceId, "suspend", {
      reason: "security",
    });
    const restore = await lifecycleRequest(owner.token, deviceId, "restore", {
      reason: "administrative",
    });
    const otherRevoke = await lifecycleRequest(
      other.token,
      deviceId,
      "revoke",
      {
        reason: "user_requested",
      },
    );

    expect(suspend.statusCode).toBe(403);
    expect(restore.statusCode).toBe(403);
    expect(otherRevoke.statusCode).toBe(404);
    expect(
      await lifecycleEventCount(deviceId, "platform.device.suspended"),
    ).toBe("0");
    expect(await lifecycleEventCount(deviceId, "platform.device.revoked")).toBe(
      "0",
    );
  });

  it("allows Admin to revoke, suspend, and restore same-company devices", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(admin.user.id);
    const deviceToRevoke = await insertDevice({
      companyId,
      userId: employee.user.id,
      installationHash: uniqueHash("admin-revoke"),
      platform: "android",
      status: "registered",
    });
    const deviceToSuspendRestore = await insertDevice({
      companyId,
      userId: employee.user.id,
      installationHash: uniqueHash("admin-suspend"),
      platform: "ios",
      status: "registered",
    });

    const revoke = await lifecycleRequest(
      admin.token,
      deviceToRevoke,
      "revoke",
      {
        reason: "security",
      },
    );
    const suspend = await lifecycleRequest(
      admin.token,
      deviceToSuspendRestore,
      "suspend",
      {
        reason: "security",
      },
    );
    const restore = await lifecycleRequest(
      admin.token,
      deviceToSuspendRestore,
      "restore",
      {
        reason: "administrative",
      },
    );

    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toMatchObject({ status: "revoked" });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json()).toMatchObject({ status: "suspended" });
    expect(restore.statusCode).toBe(200);
    expect(restore.json()).toMatchObject({ status: "registered" });
    expect(
      await lifecycleEventCount(deviceToRevoke, "platform.device.revoked"),
    ).toBe("1");
    expect(
      await lifecycleEventCount(
        deviceToSuspendRestore,
        "platform.device.suspended",
      ),
    ).toBe("1");
    expect(
      await lifecycleEventCount(
        deviceToSuspendRestore,
        "platform.device.restored",
      ),
    ).toBe("1");
  });

  it("keeps admin lifecycle mutations scoped to the active company", async () => {
    const admin = await loginAs(app, "ADM");
    const otherCompanyId = "10000000-0000-4000-8000-0000000000bb";
    const otherUserId = "20000000-0000-4000-8000-0000000000bb";
    await insertOtherCompanyUser(otherCompanyId, otherUserId);
    const otherDeviceId = await insertDevice({
      companyId: otherCompanyId,
      userId: otherUserId,
      installationHash: uniqueHash("admin-cross-company"),
      platform: "android",
      status: "registered",
    });

    const response = await lifecycleRequest(
      admin.token,
      otherDeviceId,
      "revoke",
      {
        reason: "administrative",
      },
    );

    expect(response.statusCode).toBe(404);
    expect(
      await lifecycleEventCount(otherDeviceId, "platform.device.revoked"),
    ).toBe("0");
  });

  it("treats revoked as terminal and same-state retries as idempotent", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(admin.user.id);
    const deviceId = await insertDevice({
      companyId,
      userId: employee.user.id,
      installationHash: uniqueHash("terminal"),
      platform: "android",
      status: "registered",
    });

    const first = await lifecycleRequest(admin.token, deviceId, "revoke", {
      reason: "administrative",
    });
    const retry = await lifecycleRequest(admin.token, deviceId, "revoke", {
      reason: "administrative",
    });
    const restore = await lifecycleRequest(admin.token, deviceId, "restore", {
      reason: "administrative",
    });

    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(restore.statusCode).toBe(409);
    expect(await lifecycleEventCount(deviceId, "platform.device.revoked")).toBe(
      "1",
    );
    expect(
      await lifecycleEventCount(deviceId, "platform.device.restored"),
    ).toBe("0");
  });

  it("serializes concurrent duplicate lifecycle mutations to one event", async () => {
    const employee = await loginAs(app, "E1");
    const companyId = await activeCompanyId(employee.user.id);
    const deviceId = await insertDevice({
      companyId,
      userId: employee.user.id,
      installationHash: uniqueHash("concurrent-revoke"),
      platform: "ios",
      status: "registered",
    });

    const [left, right] = await Promise.all([
      lifecycleRequest(employee.token, deviceId, "revoke", { reason: "lost" }),
      lifecycleRequest(employee.token, deviceId, "revoke", { reason: "lost" }),
    ]);

    expect([left.statusCode, right.statusCode]).toEqual([200, 200]);
    expect(left.json()).toEqual(right.json());
    expect(await lifecycleEventCount(deviceId, "platform.device.revoked")).toBe(
      "1",
    );
  });

  async function registerDevice(
    token: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: "/api/v1/platform/devices",
      headers: authHeader(token),
      payload,
    });
  }

  async function lifecycleRequest(
    token: string,
    deviceId: string,
    action: "revoke" | "suspend" | "restore",
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: `/api/v1/platform/devices/${deviceId}/${action}`,
      headers: authHeader(token),
      payload,
    });
  }

  async function adminDeviceList(
    token: string,
    query: Record<string, string | number | undefined> = {},
  ) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const suffix = search.toString();
    return app.inject({
      method: "GET",
      url: `/api/v1/platform/admin/devices${suffix ? `?${suffix}` : ""}`,
      headers: authHeader(token),
    });
  }

  async function withTemporaryActiveRole<T>(
    employeeCode: string,
    role: (typeof Roles)[keyof typeof Roles],
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    const user = app.store.users.find(
      (candidate) => candidate.employee_code === employeeCode,
    );
    if (!user) throw new Error(`Missing seeded user ${employeeCode}`);
    const preference = app.store.userSessionPreferences.find(
      (candidate) => candidate.user_id === user.id,
    );
    if (!preference) {
      throw new Error(`Missing seeded session preference for ${employeeCode}`);
    }
    const originalRoles = [...user.roles];
    const originalActiveRole = preference.active_role;
    user.roles = [role];
    preference.active_role = role;
    try {
      const login = await loginAs(app, employeeCode);
      return await fn(login.token);
    } finally {
      user.roles = originalRoles;
      preference.active_role = originalActiveRole;
    }
  }

  async function activeCompanyId(userId: string): Promise<string> {
    const result = await app.store.pgPool!.query<{ company_id: string }>(
      `SELECT company_id
       FROM platform.user_session_preferences
       WHERE user_id = $1`,
      [userId],
    );
    const companyId = result.rows[0]?.company_id;
    if (!companyId) throw new Error(`Missing active company for ${userId}`);
    return companyId;
  }

  async function insertDevice(input: {
    companyId: string;
    userId: string;
    installationHash: string;
    platform: "ios" | "android";
    status: "registered" | "suspended" | "revoked";
    createdAt?: string;
    statusChangedAt?: string;
    updatedAt?: string;
  }): Promise<string> {
    const result = await app.store.pgPool!.query<{ id: string }>(
      `INSERT INTO platform.registered_devices (
         company_id, user_id, installation_id_hash, platform, status,
         status_changed_at, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         COALESCE($6::timestamptz, now()),
         COALESCE($7::timestamptz, now()),
         COALESCE($8::timestamptz, now())
       )
       RETURNING id`,
      [
        input.companyId,
        input.userId,
        input.installationHash,
        input.platform,
        input.status,
        input.statusChangedAt ?? null,
        input.createdAt ?? null,
        input.updatedAt ?? null,
      ],
    );
    return result.rows[0]!.id;
  }

  async function insertInventoryOwner(input: {
    companyId: string;
    employeeCode: string;
    fullName: string;
  }): Promise<string> {
    const userId = randomUUID();
    await app.store.pgPool!.query(
      `INSERT INTO core.users (
         id, employee_code, email, full_name, hierarchy_path, employment_status
       )
       VALUES ($1, $2, $3, $4, $5::ltree, 'active')`,
      [
        userId,
        input.employeeCode,
        `${input.employeeCode.toLowerCase()}@device-inventory.example.test`,
        input.fullName,
        `CEO.${input.employeeCode}`,
      ],
    );
    await app.store.pgPool!.query(
      `INSERT INTO platform.user_session_preferences (
         id, user_id, active_role, company_id
       )
       VALUES ($1, $2, 'Employee', $3)`,
      [randomUUID(), userId, input.companyId],
    );
    return userId;
  }

  async function insertOtherCompanyProfile(companyId: string): Promise<void> {
    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (
         id, company_name, company_slug, status
       )
       VALUES ($1, 'Device Inventory Other Company', $2, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [companyId, `device-inventory-other-company-${companyId}`],
    );
  }

  async function insertOtherCompanyUser(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const companySlug = `device-registration-other-company-${companyId}`;

    await app.store.pgPool!.query(
      `INSERT INTO platform.company_profiles (
       id,
       company_name,
       company_slug,
       status
     )
     VALUES (
       $1,
       'Device Registration Other Company',
       $2,
       'active'
     )
     ON CONFLICT (id) DO NOTHING`,
      [companyId, companySlug],
    );

    await app.store.pgPool!.query(
      `INSERT INTO platform.user_session_preferences (
       id,
       user_id,
       active_role,
       company_id
     )
     VALUES ($1, $2, 'Employee', $3)
     ON CONFLICT (user_id) DO UPDATE
     SET active_role = EXCLUDED.active_role,
         company_id = EXCLUDED.company_id,
         updated_at = now()`,
      [randomUUID(), userId, companyId],
    );
  }

  async function outboxEvents(registeredDeviceId: string): Promise<
    Array<{
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      idempotency_key: string;
    }>
  > {
    const result = await app.store.pgPool!.query<{
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      idempotency_key: string;
    }>(
      `SELECT aggregate_type, aggregate_id, event_type, payload, idempotency_key
       FROM platform.outbox_events
       WHERE aggregate_type = 'device'
         AND aggregate_id = $1
       ORDER BY id`,
      [registeredDeviceId],
    );
    return result.rows;
  }

  async function lifecycleEventCount(
    registeredDeviceId: string,
    eventType: string,
  ): Promise<string> {
    const result = await app.store.pgPool!.query<{ count: string }>(
      `SELECT count(*)
       FROM platform.outbox_events
       WHERE aggregate_type = 'device'
         AND aggregate_id = $1
         AND event_type = $2`,
      [registeredDeviceId, eventType],
    );
    return result.rows[0]?.count ?? "0";
  }

  function adminDeviceIds(body: {
    items: Array<{ registered_device_id: string }>;
  }): string[] {
    return body.items.map((item) => item.registered_device_id);
  }
});

function hash(prefix: string): string {
  return `${prefix}${"0".repeat(63)}`;
}

function uniqueHash(label: string): string {
  return createHash("sha256").update(`${label}:${randomUUID()}`).digest("hex");
}

function expectNoForbiddenPayloadKeys(
  value: unknown,
  path: string[] = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectNoForbiddenPayloadKeys(item, [...path, String(index)]),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalized = key.trim().toLowerCase().replaceAll("-", "_");
    expect(
      forbiddenPayloadKeys.has(normalized),
      `Forbidden payload key ${[...path, key].join(".")}`,
    ).toBe(false);
    expectNoForbiddenPayloadKeys(nested, [...path, key]);
  }
}

function expectNoForbiddenAdminDeviceKeys(
  value: unknown,
  path: string[] = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectNoForbiddenAdminDeviceKeys(item, [...path, String(index)]),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalized = key.trim().toLowerCase().replaceAll("-", "_");
    expect(
      forbiddenAdminDeviceKeys.has(normalized),
      `Forbidden admin device key ${[...path, key].join(".")}`,
    ).toBe(false);
    expectNoForbiddenAdminDeviceKeys(nested, [...path, key]);
  }
}
