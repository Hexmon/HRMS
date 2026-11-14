import { describe, expect, it } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { AdminService } from "../service.js";

describe("admin company-scoped master data", () => {
  it("lists and mutates departments and designations only for the actor company", () => {
    const store = createMemoryDataStore();
    const service = new AdminService(store);
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    assignCompany(store, admin.id, companyA);
    const companyAData = addCompanyMasterData(store, companyA, "A");
    const companyBData = addCompanyMasterData(store, companyB, "B");

    expect(service.listDepartments(admin, { page: 1, page_size: 25 }).items.map((department) => department.name)).toEqual([
      companyAData.department.name
    ]);
    expect(service.listDesignations(admin, { page: 1, page_size: 25 }).items.map((designation) => designation.title)).toEqual([
      companyAData.designation.title
    ]);

    expect(() =>
      service.updateDepartment(admin, companyBData.department.id, {
        expected_version: 1,
        name: "Should Not Update"
      })
    ).toThrowError("Department not found");
    expect(() =>
      service.updateDesignation(admin, companyBData.designation.id, {
        expected_version: 1,
        title: "Should Not Update"
      })
    ).toThrowError("Designation not found");
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

  it("rejects an already-corrupt department cycle without mutating master data or outbox", () => {
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

    expect(() =>
      service.createDepartment(admin, {
        name: "Blocked Child",
        code: "BLOCKED_CHILD",
        parent_department_id: first.id,
      }),
    ).toThrowError("Department hierarchy contains a cycle.");

    expect(store.departments).toEqual(departmentsBefore);
    expect(store.outbox).toEqual(outboxBefore);
  });

  it("rejects self, descendant, inactive, foreign-company, and orphaned department parents while preserving valid chains", () => {
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

    expect(() =>
      service.updateDepartment(admin, root.id, {
        expected_version: root.version,
        parent_department_id: root.id,
      }),
    ).toThrowError("Department cannot be its own parent.");
    expect(() =>
      service.updateDepartment(admin, root.id, {
        expected_version: root.version,
        parent_department_id: child.id,
      }),
    ).toThrowError("Department parent would create a hierarchy cycle.");
    expect(() =>
      service.createDepartment(admin, {
        name: "Foreign Child",
        code: "FOREIGN_CHILD",
        parent_department_id: foreign.id,
      }),
    ).toThrowError("Parent department not found");
    expect(() =>
      service.createDepartment(admin, {
        name: "Inactive Child",
        code: "INACTIVE_CHILD",
        parent_department_id: inactive.id,
      }),
    ).toThrowError("Parent department not found");
    expect(() =>
      service.createDepartment(admin, {
        name: "Orphaned Child",
        code: "ORPHANED_CHILD",
        parent_department_id: orphaned.id,
      }),
    ).toThrowError("Department hierarchy contains an invalid parent reference.");

    expect(
      service.createDepartment(admin, {
        name: "Grandchild",
        code: "GRANDCHILD",
        parent_department_id: child.id,
      }).department,
    ).toMatchObject({ parent_department_id: child.id, version: 1 });
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
