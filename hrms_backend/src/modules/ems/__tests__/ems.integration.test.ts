import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { EmploymentStatuses, Roles } from "#shared";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("employee self-service", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("loads profile data, supports direct profile edits, and routes profile changes through HR approval", async () => {
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");

    const profile = await app.inject({
      method: "GET",
      url: "/api/v1/ems/profile/me",
      headers: authHeader(employee.token)
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().profile.user).toMatchObject({
      id: employee.user.id,
      employee_code: "E1"
    });
    expect(profile.json().profile.version).toBe(1);

    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/ems/profile/me",
      headers: authHeader(employee.token),
      payload: {
        personal_email: "employee.one.personal@example.test",
        city: "Bengaluru",
        expected_version: 1
      }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().profile.profile).toMatchObject({
      personal_email: "employee.one.personal@example.test",
      city: "Bengaluru",
      version: 2
    });

    const stalePatch = await app.inject({
      method: "PATCH",
      url: "/api/v1/ems/profile/me",
      headers: authHeader(employee.token),
      payload: {
        city: "Mumbai",
        expected_version: 1
      }
    });
    expect(stalePatch.statusCode).toBe(409);

    const request = await app.inject({
      method: "POST",
      url: "/api/v1/ems/profile-change-requests",
      headers: authHeader(employee.token),
      payload: {
        field_key: "current_address",
        new_value: "221B Test Street, Bengaluru",
        reason: "Moved closer to office"
      }
    });
    expect(request.statusCode).toBe(200);
    expect(request.json().request).toMatchObject({
      employee_user_id: employee.user.id,
      field_key: "current_address",
      status: "pending",
      can_decide: false,
      version: 1
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/ems/profile-change-requests",
      headers: authHeader(employee.token),
      payload: {
        field_key: "current_address",
        new_value: "Duplicate address"
      }
    });
    expect(duplicate.statusCode).toBe(409);

    const mine = await app.inject({
      method: "GET",
      url: "/api/v1/ems/profile-change-requests/my?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items[0]).toMatchObject({ id: request.json().request_id, status: "pending" });

    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/ems/profile-change-requests/queue/hr?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().items[0]).toMatchObject({ id: request.json().request_id, can_decide: true });

    const selfDecision = await app.inject({
      method: "POST",
      url: `/api/v1/ems/profile-change-requests/${request.json().request_id}/decision`,
      headers: authHeader(employee.token),
      payload: { decision: "approved", expected_version: 1 }
    });
    expect(selfDecision.statusCode).toBe(403);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/ems/profile-change-requests/${request.json().request_id}/decision`,
      headers: authHeader(admin.token),
      payload: { decision: "approved", expected_version: 1 }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      previous_status: "pending",
      next_status: "approved",
      status: "approved",
      version: 2
    });

    const updatedProfile = await app.inject({
      method: "GET",
      url: "/api/v1/ems/profile/me",
      headers: authHeader(employee.token)
    });
    expect(updatedProfile.statusCode).toBe(200);
    expect(updatedProfile.json().profile.current_address).toBe("221B Test Street, Bengaluru");
  });

  it("supports employee service requests, letters, and policy acknowledgements", async () => {
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");

    const request = await app.inject({
      method: "POST",
      url: "/api/v1/ems/requests",
      headers: authHeader(employee.token),
      payload: {
        request_type: "letter",
        subject: "Experience letter request",
        description: "Please prepare an experience letter for my bank."
      }
    });
    expect(request.statusCode).toBe(200);
    expect(request.json().request).toMatchObject({
      requester_user_id: employee.user.id,
      request_type: "letter",
      status: "pending",
      version: 1
    });

    const mine = await app.inject({
      method: "GET",
      url: "/api/v1/ems/requests/my?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items[0]).toMatchObject({ id: request.json().request_id, subject: "Experience letter request" });

    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/ems/requests/queue/hr?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().items[0]).toMatchObject({ id: request.json().request_id, requester_user_id: employee.user.id });

    const decidedRequest = await app.inject({
      method: "POST",
      url: `/api/v1/ems/requests/${request.json().request_id}/decision`,
      headers: authHeader(admin.token),
      payload: { decision: "approved", expected_version: 1 }
    });
    expect(decidedRequest.statusCode).toBe(200);
    expect(decidedRequest.json()).toMatchObject({
      status: "approved",
      generated_letter: {
        title: "Experience letter request",
        status: "available"
      }
    });

    const letters = await app.inject({
      method: "GET",
      url: "/api/v1/ems/letters?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(letters.statusCode).toBe(200);
    const letter = letters.json().items.find((item: { title: string }) => item.title === "Offer Letter");
    expect(letter).toMatchObject({ title: "Offer Letter", version: 1 });

    const acknowledgeLetter = await app.inject({
      method: "POST",
      url: `/api/v1/ems/letters/${letter.id}/acknowledge`,
      headers: authHeader(employee.token),
      payload: { expected_version: letter.version }
    });
    expect(acknowledgeLetter.statusCode).toBe(200);
    expect(acknowledgeLetter.json()).toMatchObject({
      status: "acknowledged",
      version: 2
    });

    const staleLetter = await app.inject({
      method: "POST",
      url: `/api/v1/ems/letters/${letter.id}/acknowledge`,
      headers: authHeader(employee.token),
      payload: { expected_version: letter.version }
    });
    expect(staleLetter.statusCode).toBe(409);

    const policies = await app.inject({
      method: "GET",
      url: "/api/v1/ems/policies?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(policies.statusCode).toBe(200);
    expect(policies.json().acknowledgement_summary.pending).toBeGreaterThanOrEqual(1);
    const pendingPolicy = policies.json().items.find((item: { acknowledgement_status: string }) => item.acknowledgement_status === "pending");
    expect(pendingPolicy).toMatchObject({ title: "Leave policy", acknowledgement_version: 1 });

    const acknowledgePolicy = await app.inject({
      method: "POST",
      url: `/api/v1/ems/policies/${pendingPolicy.id}/acknowledge`,
      headers: authHeader(employee.token),
      payload: { expected_version: pendingPolicy.acknowledgement_version }
    });
    expect(acknowledgePolicy.statusCode).toBe(200);
    expect(acknowledgePolicy.json()).toMatchObject({
      status: "acknowledged",
      version: 2
    });
  });

  it("persists EMS admin onboarding, probation, exit, and policy actions", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/ems/admin/onboarding?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const onboarding = await app.inject({
      method: "GET",
      url: "/api/v1/ems/admin/onboarding?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.json().items[0]).toMatchObject({
      checklist_type: "onboarding",
      status: "in_progress",
      version: 1
    });
    const onboardingRow = onboarding.json().items[0];

    const updatedOnboarding = await app.inject({
      method: "PATCH",
      url: `/api/v1/ems/admin/onboarding/${onboardingRow.id}`,
      headers: authHeader(admin.token),
      payload: {
        checklist: { docs: true, assets: true, access: true, orientation: true },
        expected_version: onboardingRow.version
      }
    });
    expect(updatedOnboarding.statusCode).toBe(200);
    expect(updatedOnboarding.json()).toMatchObject({
      status: "completed",
      checklist: {
        status: "completed"
      }
    });

    const probation = await app.inject({
      method: "GET",
      url: "/api/v1/ems/admin/probation?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(probation.statusCode).toBe(200);
    const probationRow = probation.json().items[0];
    expect(probationRow).toMatchObject({ status: "pending", version: 1 });

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/ems/admin/probation/${probationRow.id}/decision`,
      headers: authHeader(admin.token),
      payload: { decision: "confirmed", remarks: "Probation goals met.", expected_version: probationRow.version }
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ status: "confirmed", version: 2 });

    const exits = await app.inject({
      method: "GET",
      url: "/api/v1/ems/admin/exits?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(exits.statusCode).toBe(200);
    const exitRow = exits.json().items[0];
    expect(exitRow).toMatchObject({ checklist_type: "exit", status: "in_progress" });

    const updatedExit = await app.inject({
      method: "PATCH",
      url: `/api/v1/ems/admin/exits/${exitRow.id}`,
      headers: authHeader(admin.token),
      payload: {
        checklist: { assets: true, finance: true, letter: true },
        expected_version: exitRow.version
      }
    });
    expect(updatedExit.statusCode).toBe(200);
    expect(updatedExit.json()).toMatchObject({ status: "completed" });

    const policies = await app.inject({
      method: "GET",
      url: "/api/v1/ems/policies?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(policies.statusCode).toBe(200);
    const policy = policies.json().items.find((item: { policy_code: string }) => item.policy_code === "LEAVE");
    expect(policy).toMatchObject({ version_label: "v4.0" });

    const publish = await app.inject({
      method: "PUT",
      url: `/api/v1/ems/policies/${policy.id}`,
      headers: authHeader(admin.token),
      payload: {
        version_label: "v4.1",
        effective_from: "2026-06-15",
        expected_version: policy.version
      }
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().policy).toMatchObject({ version_label: "v4.1", version: 2 });
  });

  it("scopes EMS employee documents through the backend Documents module", async () => {
    const employee = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");
    const otherEmployee = await loginAs(app, "E2");

    const employeeUpload = await app.inject({
      method: "POST",
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      headers: authHeader(employee.token),
      payload: {
        classification: "normal",
        document_type: "identity_proof",
        file_name: "passport.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024
      }
    });
    expect(employeeUpload.statusCode).toBe(200);
    expect(employeeUpload.json().document).toMatchObject({
      business_object_type: "employee",
      business_object_id: employee.user.id,
      owner_user_id: employee.user.id,
      document_type: "identity_proof"
    });
    expect(employeeUpload.json().document).not.toHaveProperty("storage_key");
    const storedEmployeeDocument = app.store.documents.find(
      (document) => document.id === employeeUpload.json().document.id,
    );
    await expect(app.store.objectStorage?.statObject(storedEmployeeDocument!.storage_key)).resolves.toMatchObject({
      size: expect.any(Number)
    });

    const restrictedUpload = await app.inject({
      method: "POST",
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      headers: authHeader(admin.token),
      payload: {
        classification: "medical",
        document_type: "medical_record",
        file_name: "medical.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048
      }
    });
    expect(restrictedUpload.statusCode).toBe(200);
    expect(restrictedUpload.json().document.owner_user_id).toBe(employee.user.id);

    const ownList = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ownList.statusCode).toBe(200);
    expect(ownList.json()).toMatchObject({
      total: 1,
      document_summary: { total: 1, pending_verification: 1, restricted: 0 }
    });
    expect(ownList.json().items[0]).toMatchObject({ id: employeeUpload.json().document.id });
    expect(JSON.stringify(ownList.json().items)).not.toMatch(/storage_key|storage_adapter|storage_etag|bucket|endpoint/iu);

    const replacementUpload = await app.inject({
      method: "POST",
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      headers: authHeader(employee.token),
      payload: {
        classification: "normal",
        document_type: "identity_proof",
        file_name: "passport-replacement.pdf",
        mime_type: "application/pdf",
        size_bytes: 1536,
        replace_document_id: employeeUpload.json().document.id
      }
    });
    expect(replacementUpload.statusCode).toBe(200);
    expect(replacementUpload.json().document).toMatchObject({
      business_object_type: "employee",
      business_object_id: employee.user.id,
      owner_user_id: employee.user.id,
      document_type: "identity_proof",
      file_name: "passport-replacement.pdf"
    });
    expect(replacementUpload.json().document.metadata).not.toHaveProperty("replaces_document_id");
    expect(app.store.documents.find((document) => document.id === replacementUpload.json().document.id)?.metadata)
      .toMatchObject({ replaces_document_id: employeeUpload.json().document.id });
    expect(app.store.documents.find((document) => document.id === employeeUpload.json().document.id)?.deleted_at).toEqual(expect.any(String));

    const replacedList = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(replacedList.statusCode).toBe(200);
    expect(replacedList.json()).toMatchObject({
      total: 1,
      document_summary: { total: 1, pending_verification: 1, restricted: 0 }
    });
    expect(replacedList.json().items[0]).toMatchObject({ id: replacementUpload.json().document.id });

    const hrList = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10&document_type=medical_record`,
      headers: authHeader(admin.token)
    });
    expect(hrList.statusCode).toBe(200);
    expect(hrList.json()).toMatchObject({
      total: 1,
      document_summary: { total: 2, restricted: 1 }
    });
    expect(hrList.json().items[0]).toMatchObject({ id: restrictedUpload.json().document.id });
    expect(JSON.stringify(hrList.json().items)).not.toMatch(/storage_key|storage_adapter|storage_etag|bucket|endpoint/iu);

    const crossEmployeeList = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${employee.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(otherEmployee.token)
    });
    expect(crossEmployeeList.statusCode).toBe(403);

    const crossEmployeeUpload = await app.inject({
      method: "POST",
      url: `/api/v1/ems/employees/${employee.user.id}/documents`,
      headers: authHeader(otherEmployee.token),
      payload: {
        classification: "normal",
        document_type: "identity_proof",
        file_name: "other.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024
      }
    });
    expect(crossEmployeeUpload.statusCode).toBe(403);
  });

  it("hides Company A EMS documents from Company B privileged roles before storage I/O", async () => {
    const target = await loginAs(app, "E1");
    const admin = await loginAs(app, "ADM");
    const auditor = await loginAs(app, "AUD");
    const hr = await loginAs(app, "E2");
    const companyA = app.store.userSessionPreferences.find(
      (preference) => preference.user_id === target.user.id,
    )!.company_id!;
    const companyB = randomUUID();
    await app.store.pgPool!.query(
      "INSERT INTO platform.company_profiles (id, company_name, company_slug, status, bootstrap_completed_at) VALUES ($1, 'EMS Company B', $2, 'active', now())",
      [companyB, `ems-company-b-${companyB}`],
    );
    app.store.companyProfiles.push({
      ...app.store.companyProfiles.find((company) => company.id === companyA)!,
      id: companyB,
      company_name: "EMS Company B",
      company_slug: `ems-company-b-${companyB}`,
    });
    await app.store.pgPool!.query(
      "INSERT INTO core.user_roles (user_id, role_key, status, effective_from) VALUES ($1, $2, 'active', CURRENT_DATE)",
      [hr.user.id, Roles.HRManager],
    );
    hr.user.roles.push(Roles.HRManager);

    for (const actor of [admin, auditor, hr]) {
      const activeRole = actor.user.id === hr.user.id
        ? Roles.HRManager
        : actor.user.roles[0]!;
      await app.store.pgPool!.query(
        "UPDATE platform.user_session_preferences SET company_id=$2, active_role=$3 WHERE user_id=$1",
        [actor.user.id, companyB, activeRole],
      );
      const preference = app.store.userSessionPreferences.find(
        (candidate) => candidate.user_id === actor.user.id,
      )!;
      preference.company_id = companyB;
      preference.active_role = activeRole;
    }

    expect(app.store.objectStorage).toBeDefined();
    const putObject = vi.spyOn(app.store.objectStorage!, "putObject");
    const targetRecord = app.store.users.find((user) => user.id === target.user.id)!;
    const before = {
      documents: app.store.documents.length,
      versions: app.store.documentVersions.length,
      outbox: app.store.outbox.length,
      targetVersion: targetRecord.version,
    };

    for (const actor of [admin, auditor, hr]) {
      const list = await app.inject({
        method: "GET",
        url: `/api/v1/ems/employees/${target.user.id}/documents?page=1&page_size=10`,
        headers: authHeader(actor.token),
      });
      expect(list.statusCode, `${actor.user.employee_code}: ${list.body}`).toBe(404);

      const upload = await app.inject({
        method: "POST",
        url: `/api/v1/ems/employees/${target.user.id}/documents`,
        headers: authHeader(actor.token),
        payload: {
          classification: "normal",
          document_type: "identity_proof",
          file_name: "foreign.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
        },
      });
      expect(upload.statusCode, `${actor.user.employee_code}: ${upload.body}`).toBe(404);
    }

    expect(putObject).not.toHaveBeenCalled();
    expect(app.store.documents).toHaveLength(before.documents);
    expect(app.store.documentVersions).toHaveLength(before.versions);
    expect(app.store.outbox).toHaveLength(before.outbox);
    expect(targetRecord.version).toBe(before.targetVersion);

    admin.user.employment_status = EmploymentStatuses.Inactive;
    await app.store.pgPool!.query(
      "UPDATE core.users SET employment_status=$2 WHERE id=$1",
      [admin.user.id, EmploymentStatuses.Inactive],
    );
    const inactiveActorList = await app.inject({
      method: "GET",
      url: `/api/v1/ems/employees/${target.user.id}/documents?page=1&page_size=10`,
      headers: authHeader(admin.token),
    });
    expect(inactiveActorList.statusCode).toBe(401);
    expect(putObject).not.toHaveBeenCalled();
  });
});
