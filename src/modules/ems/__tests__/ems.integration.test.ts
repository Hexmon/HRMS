import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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

    const letters = await app.inject({
      method: "GET",
      url: "/api/v1/ems/letters?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(letters.statusCode).toBe(200);
    const letter = letters.json().items.find((item: { status: string }) => item.status === "available");
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
    await expect(app.store.objectStorage?.statObject(employeeUpload.json().document.storage_key)).resolves.toMatchObject({
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
});
