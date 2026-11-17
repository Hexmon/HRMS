import { describe, expect, it } from "vitest";
import { adminMasterDataListKey } from "../queries";

describe("adminMasterDataListKey", () => {
  it("separates page, search and resource results", () => {
    const first = adminMasterDataListKey("departments", { page: 1, page_size: 25 });
    const second = adminMasterDataListKey("departments", { page: 2, page_size: 25 });
    const searched = adminMasterDataListKey("departments", {
      page: 1,
      page_size: 25,
      search: "Finance",
    });
    const designation = adminMasterDataListKey("designations", { page: 1, page_size: 25 });

    expect(first).not.toEqual(second);
    expect(first).not.toEqual(searched);
    expect(first).not.toEqual(designation);
    expect(second.at(-1)).toEqual({ key: "departments", page: 2, page_size: 25 });
  });
});
