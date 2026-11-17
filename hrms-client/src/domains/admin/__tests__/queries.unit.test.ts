import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../api";
import {
  adminMasterDataListKey,
  useDepartmentMasters,
  useDepartmentMastersPage,
  useDesignationMasters,
  useDesignationMastersPage,
} from "../queries";

afterEach(() => vi.restoreAllMocks());

function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

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

  it("loads legacy and paged department queries with separate parameters", async () => {
    const list = vi.spyOn(adminApi, "listDepartments").mockResolvedValue({
      items: [],
      page: 1,
      page_size: 100,
      total: 0,
    });
    const wrapper = queryWrapper();
    const legacy = renderHook(() => useDepartmentMasters(), { wrapper });
    const paged = renderHook(
      () => useDepartmentMastersPage({ page: 2, page_size: 25, search: "Finance" }),
      { wrapper },
    );

    await waitFor(() => expect(legacy.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(paged.result.current.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 100 });
    expect(list).toHaveBeenCalledWith({ page: 2, page_size: 25, search: "Finance" });
  });

  it("loads legacy and paged designation queries and honors disabled state", async () => {
    const list = vi.spyOn(adminApi, "listDesignations").mockResolvedValue({
      items: [],
      page: 1,
      page_size: 100,
      total: 0,
    });
    const wrapper = queryWrapper();
    const legacy = renderHook(() => useDesignationMasters(), { wrapper });
    const paged = renderHook(() => useDesignationMastersPage({ page: 3, page_size: 25 }, false), {
      wrapper,
    });

    await waitFor(() => expect(legacy.result.current.isSuccess).toBe(true));
    expect(paged.result.current.fetchStatus).toBe("idle");
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 100 });
  });
});
