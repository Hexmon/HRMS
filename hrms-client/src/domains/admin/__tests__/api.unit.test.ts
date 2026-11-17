import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/shared/api", () => ({ apiRequest: mock.apiRequest }));

import { adminApi } from "../api";

afterEach(() => vi.clearAllMocks());

describe("adminApi master-data lists", () => {
  it("requests the default and filtered department collections", async () => {
    mock.apiRequest.mockResolvedValue({ items: [], page: 1, page_size: 25, total: 0 });

    await adminApi.listDepartments();
    await adminApi.listDepartments({
      page: 2,
      page_size: 25,
      active_only: true,
      search: "Finance",
      parent_candidate_for: "11111111-1111-4111-8111-111111111111",
    });

    expect(mock.apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/admin/master-data/departments");
    expect(mock.apiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/master-data/departments?page=2&page_size=25&active_only=true&search=Finance&parent_candidate_for=11111111-1111-4111-8111-111111111111",
    );
  });
});
