import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildRealApp, buildRealAppReplica } from "../../../__tests__/real-infra.js";
import { expenseReviewerRoutingLockKey } from "../routing-locks.js";

async function expectSettledWithoutRoutingLock<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request waited on an unauthorized reviewer-routing lock")), 2_000);
    }),
  ]);
}

describe("expense cutover security remediations on PostgreSQL", () => {
  let app: FastifyInstance;
  let replica: FastifyInstance | null = null;

  beforeAll(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterAll(async () => {
    await replica?.close();
    await app.close();
  });

  it("fresh-resolves dashboard and notification authority and company scope", async () => {
    const admin = await loginAs(app, "ADM");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const preference = await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [admin.user.id],
    );
    const companyA = preference.rows[0]?.company_id;
    if (!companyA) throw new Error("Admin company fixture required");
    const notificationId = randomUUID();
    await pool.query(
      `INSERT INTO platform.notifications
        (id,target_user_id,event_type,payload,status,version)
       VALUES ($1,$2,'expense.security.fixture',$3::jsonb,'pending',1)`,
      [notificationId, admin.user.id, JSON.stringify({ company_id: companyA })],
    );
    const unownedNotificationId = randomUUID();
    await pool.query(
      `INSERT INTO platform.notifications
        (id,target_user_id,event_type,payload,status,version)
       VALUES ($1,$2,'platform.unowned.fixture','{}'::jsonb,'pending',1)`,
      [unownedNotificationId, admin.user.id],
    );
    await pool.query(
      `INSERT INTO platform.notifications
        (id,target_user_id,event_type,payload,status,version,created_at,updated_at)
       SELECT gen_random_uuid(),$1,'expense.security.page',
              jsonb_build_object('company_id',$2::text,'sequence',value),
              'pending',1,now()+(value || ' milliseconds')::interval,
              now()+(value || ' milliseconds')::interval
       FROM generate_series(1,120) value`,
      [admin.user.id, companyA],
    );

    const initialDashboard = await app.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(initialDashboard.statusCode).toBe(200);
    await pool.query(
      `INSERT INTO platform.outbox_events
        (event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,status,
         available_at,created_at)
       VALUES
        (gen_random_uuid(),'dashboard_fixture',$1,'dashboard.old',$2::jsonb,$3,'pending',
         now()-interval '100 days',now()-interval '100 days'),
        (gen_random_uuid(),'dashboard_fixture',$1,'dashboard.recent',$2::jsonb,$4,'pending',now(),now())`,
      [
        companyA,
        JSON.stringify({ company_id: companyA }),
        `dashboard-old-${randomUUID()}`,
        `dashboard-recent-${randomUUID()}`,
      ],
    );
    const exactDashboard = await app.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(exactDashboard.statusCode, exactDashboard.body).toBe(200);
    expect(exactDashboard.json().operations.outbox_pending).toBe(
      initialDashboard.json().operations.outbox_pending + 2,
    );
    expect((await app.inject({
      method: "GET", url: "/api/v1/notifications?page=1&page_size=10",
      headers: authHeader(admin.token),
    })).statusCode).toBe(200);
    const boundedPage = await app.inject({
      method: "GET", url: "/api/v1/notifications?page=2&page_size=25&type=expense.security.page",
      headers: authHeader(admin.token),
    });
    expect(boundedPage.statusCode).toBe(200);
    expect(boundedPage.json()).toMatchObject({ page: 2, page_size: 25, total: 120 });
    expect(boundedPage.json().items).toHaveLength(25);
    const allVisible = await app.inject({
      method: "GET", url: "/api/v1/notifications?page=1&page_size=100",
      headers: authHeader(admin.token),
    });
    expect(allVisible.statusCode, allVisible.body).toBe(200);
    expect(allVisible.json().items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: unownedNotificationId }),
    ]));
    expect((await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${unownedNotificationId}/read`,
      headers: authHeader(admin.token),
      payload: { expected_version: 1 },
    })).statusCode).toBe(404);

    const flushFenceId = randomUUID();
    const flushFenceCreatedAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO platform.notifications
        (id,target_user_id,event_type,payload,status,version,created_at,updated_at)
       VALUES ($1,$2,'platform.flush-fence',$3::jsonb,'pending',1,$4,$4)`,
      [flushFenceId, admin.user.id, JSON.stringify({ company_id: companyA }), flushFenceCreatedAt],
    );
    const markedBeforeUnrelatedFlush = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${flushFenceId}/read`,
      headers: authHeader(admin.token),
      payload: { expected_version: 1 },
    });
    expect(markedBeforeUnrelatedFlush.statusCode, markedBeforeUnrelatedFlush.body).toBe(200);
    app.store.notifications.push({
      id: flushFenceId,
      actor_user_id: null,
      target_user_id: admin.user.id,
      event_type: "platform.flush-fence",
      payload: { company_id: companyA },
      status: "pending",
      read_at: null,
      version: 1,
      created_at: flushFenceCreatedAt,
      updated_at: flushFenceCreatedAt,
    });
    await app.store.persistence?.flushDomain?.("platform");
    expect((await pool.query(
      "SELECT status,version,read_at FROM platform.notifications WHERE id=$1",
      [flushFenceId],
    )).rows[0]).toMatchObject({ status: "sent", version: 2, read_at: expect.any(Date) });
    app.store.notifications = app.store.notifications.filter(
      (notification) => notification.id !== flushFenceId,
    );

    const assertFreshDenial = async (expectedStatus: number) => {
      for (const request of [
        { method: "GET", url: "/api/v1/dashboard/summary" },
        { method: "GET", url: "/api/v1/notifications?page=1&page_size=10" },
        { method: "GET", url: "/api/v1/notifications/unread-count" },
        { method: "POST", url: `/api/v1/notifications/${notificationId}/read`, payload: { expected_version: 1 } },
        { method: "POST", url: "/api/v1/notifications/read-all", payload: {} },
      ]) {
        const response = await app.inject({
          method: request.method as "GET" | "POST",
          url: request.url,
          headers: authHeader(admin.token),
          ...(request.payload ? { payload: request.payload } : {}),
        });
        expect(response.statusCode, `${request.method} ${request.url}`).toBe(expectedStatus);
      }
      expect((await pool.query(
        "SELECT status,version,read_at FROM platform.notifications WHERE id=$1",
        [notificationId],
      )).rows[0]).toMatchObject({ status: "pending", version: 1, read_at: null });
    };

    await pool.query(
      "UPDATE core.users SET employment_status='inactive' WHERE id=$1",
      [admin.user.id],
    );
    await assertFreshDenial(401);
    await pool.query(
      "UPDATE core.users SET employment_status='active' WHERE id=$1",
      [admin.user.id],
    );
    await pool.query("UPDATE core.users SET deleted_at=now() WHERE id=$1", [admin.user.id]);
    await assertFreshDenial(401);
    await pool.query("UPDATE core.users SET deleted_at=NULL WHERE id=$1", [admin.user.id]);

    const adminRole = await pool.query<{ role_key: string }>(
      `UPDATE core.user_roles SET status='inactive'
       WHERE user_id=$1 AND role_key='Admin' RETURNING role_key`,
      [admin.user.id],
    );
    expect(adminRole.rowCount).toBeGreaterThan(0);
    await assertFreshDenial(403);
    await pool.query(
      "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Admin'",
      [admin.user.id],
    );

    const companyB = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles (id,company_name,company_slug,status)
       VALUES ($1,'Dashboard Transfer Company',$2,'active')`,
      [companyB, `dashboard-transfer-${companyB}`],
    );
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=$1",
      [admin.user.id, companyB],
    );
    const transferredDashboard = await app.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(transferredDashboard.statusCode).toBe(200);
    expect(transferredDashboard.json().approvals.expense_total_pending).toBe(0);
    const transferredNotifications = await app.inject({
      method: "GET", url: "/api/v1/notifications?page=1&page_size=10",
      headers: authHeader(admin.token),
    });
    expect(transferredNotifications.statusCode).toBe(200);
    expect(transferredNotifications.json()).toMatchObject({ items: [], total: 0 });
    expect((await app.inject({
      method: "POST", url: `/api/v1/notifications/${notificationId}/read`,
      headers: authHeader(admin.token), payload: { expected_version: 1 },
    })).statusCode).toBe(404);
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=$1",
      [admin.user.id, companyA],
    );

    const capPrefix = `CAP-${randomUUID()}`;
    const beforeCap = await app.inject({
      method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
    });
    expect(beforeCap.statusCode, beforeCap.body).toBe(200);
    const pendingBeforeCap = beforeCap.json().approvals.expense_manager_pending;
    const capClient = await pool.connect();
    try {
      await capClient.query("BEGIN");
      await capClient.query("SELECT set_config('app.expense_command_v1','on',true)");
      await capClient.query(
        `INSERT INTO expenses.expense_tickets
          (ticket_no,requester_user_id,requester_role_snapshot,department_id,
           expense_type,expense_sub_type,task_title,task_description,start_date,end_date,
           estimated_amount,payment_type,status,context_payload,company_id,owner_resolution_status)
         SELECT $1 || '-' || value::text,$2,'Admin',$3,'Project','Project Travel',
                'Dashboard cap','Dashboard cap',CURRENT_DATE,CURRENT_DATE,1,'Advance',
                'Pending Manager Verification',
                jsonb_build_object('company_id',$4::text),$4::uuid,'typed_creation'
         FROM generate_series(1,10001) value`,
        [capPrefix, admin.user.id, admin.user.department_id, companyA],
      );
      await capClient.query("COMMIT");
      const overCap = await app.inject({
        method: "GET", url: "/api/v1/dashboard/summary", headers: authHeader(admin.token),
      });
      expect(overCap.statusCode, overCap.body).toBe(200);
      expect(overCap.json()).toMatchObject({
        scope: { actor_user_id: admin.user.id },
        approvals: {
          expense_manager_pending: pendingBeforeCap + 10_001,
        },
        operations: expect.any(Object),
      });
    } finally {
      await capClient.query("ROLLBACK").catch(() => undefined);
      await capClient.query("BEGIN").catch(() => undefined);
      await capClient.query("SELECT set_config('app.expense_command_v1','on',true)").catch(() => undefined);
      await capClient.query(
        "DELETE FROM expenses.expense_tickets WHERE ticket_no LIKE $1",
        [`${capPrefix}-%`],
      ).catch(() => undefined);
      await capClient.query("COMMIT").catch(() => undefined);
      capClient.release();
    }
  });

  it("owns reviewer-routing list, create, replay, tenant denial, concurrency and revoke in SQL", async () => {
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const reviewer = await loginAs(app, "D1");
    const foreignEmployee = await loginAs(app, "E2");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const companyA = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [admin.user.id],
    )).rows[0]?.company_id;
    if (!companyA) throw new Error("Admin company fixture required");

    const payload = {
      employee_user_id: auditor.user.id,
      backup_manager_user_id: reviewer.user.id,
      effective_from: "2027-01-01",
      effective_to: "2027-12-31",
    };
    const createHeaders = {
      ...authHeader(admin.token),
      "idempotency-key": "reviewer-routing-create-security-001",
    };
    const created = await app.inject({
      method: "POST", url: "/api/v1/manager-backups", headers: createHeaders, payload,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      company_id: companyA,
      owner_resolution_status: "typed_creation",
      employee_user_id: auditor.user.id,
      backup_manager_user_id: reviewer.user.id,
      status: "active",
      version: 1,
    });
    const mappingId = created.json().id as string;
    const replay = await app.inject({
      method: "POST", url: "/api/v1/manager-backups", headers: createHeaders, payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(created.json());
    expect((await app.inject({
      method: "POST", url: "/api/v1/manager-backups", headers: createHeaders,
      payload: { ...payload, effective_to: "2028-01-01" },
    })).statusCode).toBe(409);
    const routingState = async () => (await pool.query(
      `SELECT
        (SELECT count(*) FROM expenses.employee_reviewer_mappings WHERE id=$1) AS mappings,
        (SELECT count(*) FROM expenses.expense_command_results WHERE resource_id=$1) AS commands,
        (SELECT count(*) FROM platform.outbox_events
          WHERE aggregate_type='employee_reviewer_mapping' AND aggregate_id=$1) AS outbox`,
      [mappingId],
    )).rows[0];
    const routingBeforeRevocationReplay = await routingState();
    await pool.query(
      "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Admin'",
      [admin.user.id],
    );
    expect((await app.inject({
      method: "POST", url: "/api/v1/manager-backups", headers: createHeaders, payload,
    })).statusCode).toBe(403);
    expect(await routingState()).toEqual(routingBeforeRevocationReplay);
    await pool.query(
      "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Admin'",
      [admin.user.id],
    );
    const list = await app.inject({
      method: "GET", url: "/api/v1/manager-backups?page=1&page_size=100",
      headers: authHeader(admin.token),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: mappingId, employee_user_id: auditor.user.id }),
    ]));

    const attackerLock = await pool.connect();
    try {
      await attackerLock.query("BEGIN");
      await attackerLock.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
        [expenseReviewerRoutingLockKey(payload.employee_user_id)],
      );
      const nonAdminCreate = await expectSettledWithoutRoutingLock(app.inject({
        method: "POST", url: "/api/v1/manager-backups",
        headers: { ...authHeader(auditor.token), "idempotency-key": "non-admin-routing-001" },
        payload,
      }));
      expect(nonAdminCreate.statusCode).toBe(403);
    } finally {
      await attackerLock.query("ROLLBACK").catch(() => undefined);
      attackerLock.release();
    }

    const companyB = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles (id,company_name,company_slug,status)
       VALUES ($1,'Routing Foreign Company',$2,'active')`,
      [companyB, `routing-foreign-${companyB}`],
    );
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=$1",
      [foreignEmployee.user.id, companyB],
    );
    expect((await app.inject({
      method: "POST", url: "/api/v1/manager-backups",
      headers: { ...authHeader(admin.token), "idempotency-key": "foreign-routing-create-001" },
      payload: { ...payload, employee_user_id: foreignEmployee.user.id },
    })).statusCode).toBe(400);

    const beforeReviewerRevocation = await pool.query<{ count: string }>(
      "SELECT count(*) FROM expenses.employee_reviewer_mappings",
    );
    await pool.query(
      "UPDATE core.user_roles SET status='inactive' WHERE user_id=$1 AND role_key='Reviewer'",
      [reviewer.user.id],
    );
    expect((await app.inject({
      method: "POST", url: "/api/v1/manager-backups", headers: createHeaders, payload,
    })).statusCode).toBe(400);
    expect(await routingState()).toEqual(routingBeforeRevocationReplay);
    expect((await app.inject({
      method: "POST", url: "/api/v1/manager-backups",
      headers: { ...authHeader(admin.token), "idempotency-key": "inactive-reviewer-create-001" },
      payload: {
        employee_user_id: admin.user.id,
        backup_manager_user_id: reviewer.user.id,
        effective_from: "2029-01-01",
        effective_to: "2029-12-31",
      },
    })).statusCode).toBe(400);
    expect((await pool.query<{ count: string }>(
      "SELECT count(*) FROM expenses.employee_reviewer_mappings",
    )).rows[0]?.count).toBe(beforeReviewerRevocation.rows[0]?.count);
    await pool.query(
      "UPDATE core.user_roles SET status='active' WHERE user_id=$1 AND role_key='Reviewer'",
      [reviewer.user.id],
    );

    replica = await buildRealAppReplica(app);
    await replica.ready();
    const concurrentPayload = {
      employee_user_id: admin.user.id,
      backup_manager_user_id: reviewer.user.id,
      effective_from: "2028-01-01",
      effective_to: "2028-12-31",
    };
    const concurrentHeaders = {
      ...authHeader(admin.token),
      "idempotency-key": "reviewer-routing-concurrent-001",
    };
    const concurrent = await Promise.all([app, replica].map((server) => server.inject({
      method: "POST", url: "/api/v1/manager-backups",
      headers: concurrentHeaders, payload: concurrentPayload,
    })));
    expect(concurrent.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(concurrent[0]!.json().id).toBe(concurrent[1]!.json().id);
    const originalCompanyActiveMappingId = concurrent[0]!.json().id as string;

    const revokeHeaders = {
      ...authHeader(admin.token),
      "idempotency-key": "reviewer-routing-revoke-security-001",
    };
    const revoked = await app.inject({
      method: "DELETE",
      url: `/api/v1/manager-backups/${mappingId}?expected_version=1`,
      headers: revokeHeaders,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ id: mappingId, status: "revoked", version: 2 });
    const revokeReplay = await app.inject({
      method: "DELETE",
      url: `/api/v1/manager-backups/${mappingId}?expected_version=1`,
      headers: revokeHeaders,
    });
    expect(revokeReplay.statusCode).toBe(200);
    expect(revokeReplay.json()).toEqual(revoked.json());
    expect(Number((await pool.query(
      "SELECT count(*) FROM expenses.employee_reviewer_mappings WHERE id=$1",
      [mappingId],
    )).rows[0]?.count)).toBe(1);
    expect(Number((await pool.query(
      `SELECT count(*) FROM expenses.expense_command_results
       WHERE resource_id=$1 AND action IN ('reviewer-routing.create','reviewer-routing.revoke')`,
      [mappingId],
    )).rows[0]?.count)).toBe(2);
    expect(Number((await pool.query(
      `SELECT count(*) FROM platform.outbox_events
       WHERE aggregate_type='employee_reviewer_mapping' AND aggregate_id=$1`,
      [mappingId],
    )).rows[0]?.count)).toBe(2);

    await pool.query(
      `UPDATE platform.company_profiles target SET
         website=source.website,industry=source.industry,address=source.address,
         timezone=source.timezone,locale=source.locale,currency=source.currency,
         fiscal_year_start_month=source.fiscal_year_start_month,
         working_week=source.working_week,work_hours_per_day=source.work_hours_per_day,
         bootstrap_completed_at=source.bootstrap_completed_at,updated_at=now(),version=target.version+1
       FROM platform.company_profiles source
       WHERE target.id=$1 AND source.id=$2`,
      [companyB, companyA],
    );
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=ANY($1::uuid[])",
      [[admin.user.id, auditor.user.id, reviewer.user.id], companyB],
    );
    try {
      const companyBList = await app.inject({
        method: "GET",
        url: "/api/v1/manager-backups?page=1&page_size=100",
        headers: authHeader(admin.token),
      });
      expect(companyBList.statusCode, companyBList.body).toBe(200);
      expect(companyBList.json().items).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: originalCompanyActiveMappingId }),
      ]));
      const mappingLock = await pool.connect();
      try {
        await mappingLock.query("BEGIN");
        await mappingLock.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
          [expenseReviewerRoutingLockKey(concurrentPayload.employee_user_id)],
        );
        const foreignRevoke = await expectSettledWithoutRoutingLock(app.inject({
          method: "DELETE",
          url: `/api/v1/manager-backups/${originalCompanyActiveMappingId}?expected_version=1`,
          headers: {
            ...authHeader(admin.token),
            "idempotency-key": "reviewer-routing-foreign-revoke-001",
          },
        }));
        expect(foreignRevoke.statusCode, foreignRevoke.body).toBe(404);
        const nonexistentRevoke = await expectSettledWithoutRoutingLock(app.inject({
          method: "DELETE",
          url: `/api/v1/manager-backups/${randomUUID()}?expected_version=1`,
          headers: {
            ...authHeader(admin.token),
            "idempotency-key": "reviewer-routing-missing-revoke-001",
          },
        }));
        expect(nonexistentRevoke.statusCode, nonexistentRevoke.body).toBe(404);
        expect(nonexistentRevoke.json()).toMatchObject({
          code: foreignRevoke.json().code,
          message: foreignRevoke.json().message,
        });
      } finally {
        await mappingLock.query("ROLLBACK").catch(() => undefined);
        mappingLock.release();
      }
      expect((await pool.query(
        `SELECT company_id,status,version FROM expenses.employee_reviewer_mappings WHERE id=$1`,
        [originalCompanyActiveMappingId],
      )).rows[0]).toMatchObject({ company_id: companyA, status: "active", version: 1 });

      const beforeTransferredRetry = (await pool.query(
        `SELECT
          (SELECT count(*) FROM expenses.employee_reviewer_mappings) AS mappings,
          (SELECT count(*) FROM expenses.expense_command_results) AS commands,
          (SELECT count(*) FROM platform.outbox_events) AS outbox`,
      )).rows[0];
      const sameKeyOtherTenant = await app.inject({
        method: "POST",
        url: "/api/v1/manager-backups",
        headers: concurrentHeaders,
        payload: {
          employee_user_id: auditor.user.id,
          backup_manager_user_id: reviewer.user.id,
          effective_from: "2030-01-01",
          effective_to: "2030-12-31",
        },
      });
      expect(sameKeyOtherTenant.statusCode, sameKeyOtherTenant.body).toBe(409);
      expect(sameKeyOtherTenant.json()).toMatchObject({
        code: "WORKFLOW_CONFLICT",
        message: expect.stringContaining("different reviewer-routing command or company"),
      });
      expect((await pool.query(
        `SELECT
          (SELECT count(*) FROM expenses.employee_reviewer_mappings) AS mappings,
          (SELECT count(*) FROM expenses.expense_command_results) AS commands,
          (SELECT count(*) FROM platform.outbox_events) AS outbox`,
      )).rows[0]).toEqual(beforeTransferredRetry);
    } finally {
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=ANY($1::uuid[])",
        [[admin.user.id, auditor.user.id, reviewer.user.id], companyA],
      );
    }
    const companyAHistory = await app.inject({
      method: "GET",
      url: "/api/v1/manager-backups?page=1&page_size=100",
      headers: authHeader(admin.token),
    });
    expect(companyAHistory.statusCode, companyAHistory.body).toBe(200);
    expect(companyAHistory.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: originalCompanyActiveMappingId,
        company_id: companyA,
        status: "active",
      }),
    ]));
  });

  it("keeps reviewer-routing governance-first against a platform flush and replays after commit", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "AUD");
    const reviewer = await loginAs(app, "D1");
    const pool = app.store.pgPool;
    const persistence = app.store.persistence;
    if (!pool || !persistence?.flushDomain) {
      throw new Error("PostgreSQL platform persistence required");
    }
    const companyId = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [admin.user.id],
    )).rows[0]?.company_id;
    if (!companyId) throw new Error("Admin company fixture required");

    const headers = {
      ...authHeader(admin.token),
      "idempotency-key": `reviewer-routing-platform-flush-${randomUUID()}`,
    };
    const payload = {
      employee_user_id: employee.user.id,
      backup_manager_user_id: reviewer.user.id,
      effective_from: "2045-01-01",
      effective_to: "2045-12-31",
    };
    const companyBlocker = await pool.connect();
    let blockerOpen = false;
    const pending: Promise<unknown>[] = [];
    try {
      await companyBlocker.query("BEGIN");
      blockerOpen = true;
      await companyBlocker.query(
        "SELECT id FROM platform.company_profiles WHERE id=$1 FOR UPDATE",
        [companyId],
      );

      const command = app.inject({
        method: "POST",
        url: "/api/v1/manager-backups",
        headers,
        payload,
      });
      pending.push(Promise.resolve(command));
      let authorityWaitObserved = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count
           FROM pg_stat_activity
           WHERE datname=current_database() AND wait_event_type='Lock'
             AND query LIKE 'SELECT id FROM platform.company_profiles WHERE id=$1 FOR SHARE%'`,
        );
        if ((waiting.rows[0]?.count ?? 0) > 0) {
          authorityWaitObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(authorityWaitObserved).toBe(true);

      const platformFlush = persistence.flushDomain("platform");
      pending.push(platformFlush);
      let governanceWaitObserved = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count
           FROM pg_stat_activity
           WHERE datname=current_database() AND wait_event_type='Lock'
             AND query LIKE 'SELECT pg_advisory_xact_lock(hashtextextended($1::text,%'`,
        );
        if ((waiting.rows[0]?.count ?? 0) > 0) {
          governanceWaitObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(governanceWaitObserved).toBe(true);

      await companyBlocker.query("COMMIT");
      blockerOpen = false;
      const [created] = await Promise.race([
        Promise.all([command, platformFlush]),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Reviewer routing and platform flush deadlocked")), 10_000);
        }),
      ]);
      expect(created.statusCode, created.body).toBe(200);

      const replay = await app.inject({
        method: "POST",
        url: "/api/v1/manager-backups",
        headers,
        payload,
      });
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.json()).toEqual(created.json());
      const durable = (await pool.query<{
        mappings: number;
        commands: number;
        outbox: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM expenses.employee_reviewer_mappings WHERE id=$1) AS mappings,
          (SELECT count(*)::int FROM expenses.expense_command_results
            WHERE actor_user_id=$2 AND action='reviewer-routing.create'
              AND idempotency_key=$3) AS commands,
          (SELECT count(*)::int FROM platform.outbox_events
            WHERE aggregate_type='employee_reviewer_mapping' AND aggregate_id=$1) AS outbox`,
        [created.json().id, admin.user.id, headers["idempotency-key"]],
      )).rows[0];
      expect(durable).toEqual({ mappings: 1, commands: 1, outbox: 1 });
    } finally {
      if (blockerOpen) {
        await companyBlocker.query("ROLLBACK").catch(() => undefined);
      }
      await Promise.allSettled(pending);
      companyBlocker.release();
    }
  });

  it("binds a lost-response create retry to the company where the command committed", async () => {
    const employee = await loginAs(app, "E1");
    const pool = app.store.pgPool;
    if (!pool) throw new Error("PostgreSQL pool required");
    const companyA = (await pool.query<{ company_id: string }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1",
      [employee.user.id],
    )).rows[0]?.company_id;
    if (!companyA) throw new Error("Employee company fixture required");
    const companyB = randomUUID();
    await pool.query(
      `INSERT INTO platform.company_profiles
        (id,company_name,company_slug,website,industry,address,timezone,locale,currency,
         fiscal_year_start_month,working_week,work_hours_per_day,logo_label,
         logo_document_id,logo_url,logo_file_name,logo_mime_type,logo_size_bytes,status,
         bootstrap_completed_at,created_at,updated_at,version)
       SELECT $2,'Retry Company',$3,website,industry,address,timezone,locale,currency,
         fiscal_year_start_month,working_week,work_hours_per_day,logo_label,
         logo_document_id,logo_url,logo_file_name,logo_mime_type,logo_size_bytes,'active',
         bootstrap_completed_at,now(),now(),1
       FROM platform.company_profiles WHERE id=$1`,
      [companyA, companyB, `retry-company-${companyB}`],
    );
    const headers = {
      ...authHeader(employee.token),
      "idempotency-key": `expense-transfer-retry-${randomUUID()}`,
    };
    const created = await app.inject({
      method: "POST", url: "/api/v1/expenses", headers, payload: projectTravelPayload,
    });
    expect(created.statusCode, created.body).toBe(200);
    const beforeTransferRetry = (await pool.query(
      `SELECT
        (SELECT count(*) FROM expenses.expense_tickets) AS tickets,
        (SELECT count(*) FROM expenses.expense_command_results) AS commands,
        (SELECT count(*) FROM platform.outbox_events) AS outbox`,
    )).rows[0];
    await pool.query(
      "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=$1",
      [employee.user.id, companyB],
    );
    try {
      const deniedReplay = await app.inject({
        method: "POST", url: "/api/v1/expenses", headers, payload: projectTravelPayload,
      });
      expect(deniedReplay.statusCode, deniedReplay.body).toBe(409);
      expect(deniedReplay.json()).toMatchObject({
        code: "WORKFLOW_CONFLICT",
        message: expect.stringContaining("different expense command or company"),
      });
      expect((await pool.query(
        `SELECT
          (SELECT count(*) FROM expenses.expense_tickets) AS tickets,
          (SELECT count(*) FROM expenses.expense_command_results) AS commands,
          (SELECT count(*) FROM platform.outbox_events) AS outbox`,
      )).rows[0]).toEqual(beforeTransferRetry);
    } finally {
      await pool.query(
        "UPDATE platform.user_session_preferences SET company_id=$2,version=version+1 WHERE user_id=$1",
        [employee.user.id, companyA],
      );
    }
  });
});
