import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { AdminService } from "../service.js";

describe("admin company-scoped master data", () => {
  it("lists and mutates departments and designations only for the actor company", async () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);
    const companyAData = addCompanyMasterData(store, companyA, "A");
    const companyBData = addCompanyMasterData(store, companyB, "B");

    expect((await service.listDepartments(admin, { page: 1, page_size: 25 })).items.map((department) => department.name)).toEqual([
      companyAData.department.name
    ]);
    expect((await service.listDesignations(admin, { page: 1, page_size: 25 })).items.map((designation) => designation.title)).toEqual([
      companyAData.designation.title
    ]);

    await expect(
      service.updateDepartment(admin, companyBData.department.id, {
        expected_version: 1,
        name: "Should Not Update"
      })
    ).rejects.toThrowError("Department not found");
    await expect(
      service.updateDesignation(admin, companyBData.designation.id, {
        expected_version: 1,
        title: "Should Not Update"
      })
    ).rejects.toThrowError("Designation not found");
  });

  it("creates company-scoped policy defaults instead of sharing global defaults", () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);

    const policies = service.listAdminPolicies(admin, {}).policies;

    expect(policies.map((policy) => policy.policy_key).sort()).toEqual(["asset", "attendance", "expense", "leave", "sla", "timesheet"]);
    expect(store.adminPolicies.filter((policy) => policy.company_id === companyA)).toHaveLength(6);
    expect(store.adminPolicies.filter((policy) => policy.company_id === null)).toHaveLength(6);
  });

  it("rejects an already-corrupt department cycle without mutating master data or outbox", async () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);
    const first = addCompanyMasterData(store, companyA, "CYCLE_A").department;
    const second = addCompanyMasterData(store, companyA, "CYCLE_B").department;
    first.parent_department_id = second.id;
    second.parent_department_id = first.id;
    const departmentsBefore = structuredClone(store.departments);
    const outboxBefore = structuredClone(store.outbox);

    await expect(
      service.createDepartment(admin, {
        name: "Blocked Child",
        code: "BLOCKED_CHILD",
        parent_department_id: first.id,
      }),
    ).rejects.toThrowError("Department hierarchy contains a cycle.");

    expect(store.departments).toEqual(departmentsBefore);
    expect(store.outbox).toEqual(outboxBefore);
  });

  it("rejects self, descendant, inactive, foreign-company, and orphaned department parents while preserving valid chains", async () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);
    const root = addCompanyMasterData(store, companyA, "ROOT").department;
    const child = addCompanyMasterData(store, companyA, "CHILD").department;
    child.parent_department_id = root.id;
    const foreign = addCompanyMasterData(store, companyB, "FOREIGN").department;
    const inactive = addCompanyMasterData(store, companyA, "INACTIVE").department;
    inactive.status = "inactive";
    const orphaned = addCompanyMasterData(store, companyA, "ORPHANED").department;
    orphaned.parent_department_id = "missing-department";

    await expectRejectedWithoutEffects(store, () =>
      service.updateDepartment(admin, root.id, {
        expected_version: root.version,
        parent_department_id: root.id,
      }),
    "Department cannot be its own parent.");
    await expectRejectedWithoutEffects(store, () =>
      service.updateDepartment(admin, root.id, {
        expected_version: root.version,
        parent_department_id: child.id,
      }),
    "Department parent would create a hierarchy cycle.");
    await expectRejectedWithoutEffects(store, () =>
      service.createDepartment(admin, {
        name: "Foreign Child",
        code: "FOREIGN_CHILD",
        parent_department_id: foreign.id,
      }),
    "Parent department not found");
    await expectRejectedWithoutEffects(store, () =>
      service.createDepartment(admin, {
        name: "Inactive Child",
        code: "INACTIVE_CHILD",
        parent_department_id: inactive.id,
      }),
    "Parent department not found");
    await expectRejectedWithoutEffects(store, () =>
      service.createDepartment(admin, {
        name: "Orphaned Child",
        code: "ORPHANED_CHILD",
        parent_department_id: orphaned.id,
      }),
    "Department hierarchy contains an invalid parent reference.");

    const outboxBefore = store.outbox.length;
    const created = await service.createDepartment(admin, {
        name: "Grandchild",
        code: "GRANDCHILD",
        parent_department_id: child.id,
      });
    const createdDepartment = created.department!;
    expect(createdDepartment).toMatchObject({ parent_department_id: child.id, version: 1 });
    expect(store.departments.filter((department) => department.id === createdDepartment.id)).toHaveLength(1);
    expect(store.outbox.slice(outboxBefore)).toEqual([
      expect.objectContaining({
        aggregate_id: createdDepartment.id,
        event_type: "admin.master_data.department.created",
      }),
    ]);
  });

  it("fails closed when master-data company context is missing or inactive", async () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const preference = store.userSessionPreferences.find((candidate) => candidate.user_id === admin.id)!;
    preference.company_id = null;

    await expect(service.listDepartments(admin, { page: 1, page_size: 25 })).rejects.toThrow();
    await expect(service.createDesignation(admin, { title: "Blocked", code: "BLOCKED" })).rejects.toThrow();
    expect(store.designations.some((designation) => designation.designation_code === "BLOCKED")).toBe(false);

    assignCompany(store, admin.id, companyA);
    store.companyProfiles.find((company) => company.id === companyA)!.status = "inactive";
    await expect(service.createDepartment(admin, { name: "Blocked", code: "BLOCKED" })).rejects.toThrow();
    expect(store.departments.some((department) => department.department_code === "BLOCKED")).toBe(false);
  });
});

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";

function assignCompany(store: ReturnType<typeof createMemoryDataStore>, userId: string, companyId: string) {
  if (!store.companyProfiles.some((company) => company.id === companyId)) {
    store.companyProfiles.push({
      ...store.companyProfiles[0]!,
      id: companyId,
      company_name: `Company ${companyId}`,
      company_slug: `company-${companyId.slice(0, 8)}`,
      status: "active",
      version: 1
    });
  }
  const preference = store.userSessionPreferences.find((candidate) => candidate.user_id === userId);
  if (!preference) throw new Error("Session preference fixture is unavailable.");
  preference.active_role = Roles.Admin;
  preference.company_id = companyId;
  preference.version += 1;
}

function addCompanyMasterData(store: ReturnType<typeof createMemoryDataStore>, companyId: string, suffix: string) {
  const department: ReturnType<typeof createMemoryDataStore>["departments"][number] = {
    id: `dept-${suffix}`,
    company_id: companyId,
    department_code: `D-${suffix}`,
    name: `Department ${suffix}`,
    cost_center: null,
    parent_department_id: null,
    director_user_id: null,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  const designation: ReturnType<typeof createMemoryDataStore>["designations"][number] = {
    id: `desg-${suffix}`,
    company_id: companyId,
    designation_code: `G-${suffix}`,
    title: `Designation ${suffix}`,
    level: 1,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  store.departments.push(department);
  store.designations.push(designation);
  return { department, designation };
}

async function expectRejectedWithoutEffects(
  store: ReturnType<typeof createMemoryDataStore>,
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  const departmentsBefore = structuredClone(store.departments);
  const outboxBefore = structuredClone(store.outbox);
  await expect(action()).rejects.toThrowError(message);
  expect(store.departments).toEqual(departmentsBefore);
  expect(store.outbox).toEqual(outboxBefore);
}
