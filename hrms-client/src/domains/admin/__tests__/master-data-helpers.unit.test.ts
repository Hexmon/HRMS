import { describe, expect, it } from "vitest";
import {
  departmentParentPatch,
  designationLevelPatch,
  parseDesignationLevel,
  selectableDepartmentParents,
} from "../master-data-helpers";

describe("selectableDepartmentParents", () => {
  const rows = [
    { id: "root", name: "Root", active: true, parentId: null },
    { id: "child", name: "Child", active: true, parentId: "root" },
    { id: "grandchild", name: "Grandchild", active: true, parentId: "child" },
    { id: "inactive", name: "Inactive", active: false, parentId: null },
  ];

  it("allows active same-list records for a new department", () => {
    expect(selectableDepartmentParents(rows, null).map((row) => row.id)).toEqual([
      "root",
      "child",
      "grandchild",
    ]);
  });

  it("excludes self, descendants and inactive rows while editing", () => {
    expect(selectableDepartmentParents(rows, "root").map((row) => row.id)).toEqual([]);
    expect(selectableDepartmentParents(rows, "child").map((row) => row.id)).toEqual(["root"]);
  });

  it("fails closed for a corrupt candidate cycle", () => {
    const corrupt = [
      { id: "editing", name: "Editing", active: true, parentId: null },
      { id: "a", name: "A", active: true, parentId: "b" },
      { id: "b", name: "B", active: true, parentId: "a" },
    ];
    expect(selectableDepartmentParents(corrupt, "editing").map((row) => row.id)).toEqual([]);
  });
});

describe("master-data mutation patches", () => {
  it("omits an untouched parent and sends null only for an explicit clear", () => {
    expect(departmentParentPatch("parent", "parent", true)).toEqual({});
    expect(departmentParentPatch("", "parent", true)).toEqual({ parent_department_id: null });
    expect(departmentParentPatch("new-parent", "parent", true)).toEqual({
      parent_department_id: "new-parent",
    });
    expect(departmentParentPatch("", null, false)).toEqual({});
  });

  it("preserves, clears and changes designation levels intentionally", () => {
    expect(designationLevelPatch("3", 3, true)).toEqual({});
    expect(designationLevelPatch("", 3, true)).toEqual({ level: null });
    expect(designationLevelPatch("4", 3, true)).toEqual({ level: 4 });
    expect(designationLevelPatch("", null, false)).toEqual({});
  });

  it("rejects non-integer and out-of-range levels", () => {
    expect(() => parseDesignationLevel("1.5")).toThrow("whole number");
    expect(() => parseDesignationLevel("101")).toThrow("whole number");
    expect(() => parseDesignationLevel("-1")).toThrow("whole number");
  });
});
