import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    apiEnabled: true,
    search: {} as { tab?: string; page?: number; q?: string },
    navigate: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    addMaster: vi.fn(),
    updateMaster: vi.fn(),
    toggleMasterActive: vi.fn(),
    deleteMaster: vi.fn(),
    departmentError: null as Error | null,
    designationError: null as Error | null,
    parentError: null as Error | null,
    departmentLoading: false,
    designationLoading: false,
    parentLoading: false,
    departmentTotal: 60,
    designationTotal: 0,
    departmentMutation: mutation(),
    departmentUpdate: mutation(),
    designationMutation: mutation(),
    designationUpdate: mutation(),
    extendedMutation: mutation(),
    extendedUpdate: mutation(),
    departmentRefetch: vi.fn(),
    departmentQueryParams: vi.fn(),
    designationRefetch: vi.fn(),
    departmentItems: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        department_code: "ENG",
        code: "ENG",
        name: "Engineering",
        cost_center: null,
        parent_department_id: null as string | null,
        parent_id: null as string | null,
        parent_department_name: null as string | null,
        director_user_id: null,
        status: "active",
        active: true,
        deleted_at: null,
        version: 1,
      },
    ],
    designationItems: [] as Array<Record<string, unknown>>,
    mockMasters: {
      departments: [],
      designations: [],
      employmentTypes: [
        { id: "employment-full-time", name: "Full Time", description: "Local", active: true },
      ],
      workLocations: [],
      shifts: [],
      leaveTypes: [],
      expenseCategories: [],
      assetCategories: [],
      helpdeskCategories: [],
      projectRoles: [],
    } as Record<string, Array<Record<string, unknown>>>,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => mock.search,
  }),
  useNavigate: () => mock.navigate,
}));

vi.mock("@/lib/admin-settings-store", () => ({
  MASTER_LABELS: {
    departments: "Departments",
    designations: "Designations",
    employmentTypes: "Employment Types",
    workLocations: "Work Locations",
    shifts: "Shifts",
    leaveTypes: "Leave Types",
    expenseCategories: "Expense Categories",
    assetCategories: "Asset Categories",
    helpdeskCategories: "Helpdesk Categories",
    projectRoles: "Project Roles",
  },
  useAdminSettings: () => ({
    masters: mock.mockMasters,
    addMaster: mock.addMaster,
    updateMaster: mock.updateMaster,
    toggleMasterActive: mock.toggleMasterActive,
    deleteMaster: mock.deleteMaster,
  }),
}));

vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api")>()),
  useApiRouteEnabled: () => mock.apiEnabled,
  toastApiError: mock.toastError,
}));

vi.mock("@/domains/admin/queries", () => ({
  useDepartmentMastersPage: (
    params: { active_only?: boolean; parent_candidate_for?: string },
    enabled: boolean,
  ) => {
    mock.departmentQueryParams(params);
    return {
      data: enabled
        ? {
            items: params.active_only ? mock.departmentItems : mock.departmentItems,
            page: 1,
            page_size: 25,
            total: params.active_only ? mock.departmentItems.length : mock.departmentTotal,
          }
        : undefined,
      isLoading: params.active_only ? mock.parentLoading : mock.departmentLoading,
      error: params.active_only ? mock.parentError : mock.departmentError,
      refetch: mock.departmentRefetch,
    };
  },
  useDesignationMastersPage: (_params: unknown, enabled: boolean) => ({
    data: enabled
      ? { items: mock.designationItems, page: 1, page_size: 25, total: mock.designationTotal }
      : undefined,
    isLoading: mock.designationLoading,
    error: mock.designationError,
    refetch: mock.designationRefetch,
  }),
  useExtendedMasterData: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateDepartmentMasterMutation: () => mock.departmentMutation,
  useUpdateDepartmentMasterMutation: () => mock.departmentUpdate,
  useCreateDesignationMasterMutation: () => mock.designationMutation,
  useUpdateDesignationMasterMutation: () => mock.designationUpdate,
  useCreateExtendedMasterDataMutation: () => mock.extendedMutation,
  useUpdateExtendedMasterDataMutation: () => mock.extendedUpdate,
}));

vi.mock("sonner", () => ({ toast: { error: mock.toastError, success: mock.toastSuccess } }));

import { Route } from "@/routes/_app/admin-settings.master-data";
import { ApiError } from "@/shared/api";

const MasterDataScreen = (Route as unknown as { component: ComponentType }).component;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  mock.apiEnabled = true;
  mock.search = {};
  mock.departmentError = null;
  mock.designationError = null;
  mock.parentError = null;
  mock.departmentLoading = false;
  mock.designationLoading = false;
  mock.parentLoading = false;
  mock.departmentTotal = 60;
  mock.designationTotal = 0;
  mock.designationItems = [];
  mock.departmentItems.splice(0, mock.departmentItems.length, {
    id: "11111111-1111-4111-8111-111111111111",
    department_code: "ENG",
    code: "ENG",
    name: "Engineering",
    cost_center: null,
    parent_department_id: null,
    parent_id: null,
    parent_department_name: null,
    director_user_id: null,
    status: "active",
    active: true,
    deleted_at: null,
    version: 1,
  });
  mock.navigate.mockResolvedValue(undefined);
  mock.addMaster.mockReset();
  mock.updateMaster.mockReset();
  mock.toggleMasterActive.mockReset();
  mock.deleteMaster.mockReset();
  mock.departmentMutation.mutateAsync.mockReset();
  mock.departmentUpdate.mutateAsync.mockReset();
  mock.designationMutation.mutateAsync.mockReset();
  mock.designationUpdate.mutateAsync.mockReset();
  mock.extendedMutation.mutateAsync.mockReset();
  mock.extendedUpdate.mutateAsync.mockReset();
  mock.departmentMutation.isPending = false;
  mock.departmentUpdate.isPending = false;
  mock.designationMutation.isPending = false;
  mock.designationUpdate.isPending = false;
  mock.extendedMutation.isPending = false;
  mock.extendedUpdate.isPending = false;
  mock.departmentMutation.mutateAsync.mockResolvedValue({});
  mock.departmentUpdate.mutateAsync.mockResolvedValue({});
  mock.departmentRefetch.mockResolvedValue({
    data: { items: mock.departmentItems, page: 1, page_size: 25, total: 1 },
  });
  mock.departmentQueryParams.mockClear();
  mock.designationRefetch.mockResolvedValue({
    data: { items: [], page: 1, page_size: 25, total: 0 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Admin master-data API journey", () => {
  it("validates bounded URL state and rejects malformed values", () => {
    const validateSearch = (
      Route as unknown as {
        validateSearch: (input: Record<string, unknown>) => Record<string, unknown>;
      }
    ).validateSearch;

    expect(validateSearch({ tab: "designations", page: 2, q: "  Lead  " })).toEqual({
      tab: "designations",
      page: 2,
      q: "  Lead  ",
    });
    expect(validateSearch({ tab: "unknown", page: 1, q: "   " })).toEqual({
      tab: undefined,
      page: undefined,
      q: undefined,
    });
    expect(validateSearch({ tab: 1, page: 2.5, q: 9 })).toEqual({
      tab: undefined,
      page: undefined,
      q: undefined,
    });
    expect(validateSearch({ q: "x".repeat(200) }).q).toHaveLength(160);
  });

  it("normalizes an API-mode deep link to a globally shared extended master", async () => {
    mock.search = { tab: "employmentTypes" };
    render(<MasterDataScreen />);

    expect(screen.getByRole("tab", { name: "Departments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Designations" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Employment Types" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mock.navigate).toHaveBeenCalledWith({
        to: "/admin-settings/master-data",
        search: { tab: "departments", page: undefined, q: undefined },
        replace: true,
      }),
    );
  });

  it("keeps server page and search in URL state with a debounced search", async () => {
    vi.useFakeTimers();
    render(<MasterDataScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/admin-settings/master-data",
      search: { tab: "departments", page: 2, q: undefined },
    });

    mock.navigate.mockClear();
    fireEvent.change(screen.getByLabelText("Search departments"), {
      target: { value: "Finance" },
    });
    expect(mock.navigate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/admin-settings/master-data",
      search: { tab: "departments", page: undefined, q: "Finance" },
      replace: true,
    });
  });

  it("clears a server search from URL state", async () => {
    vi.useFakeTimers();
    mock.search = { tab: "departments", q: "Finance" };
    render(<MasterDataScreen />);

    fireEvent.change(screen.getByLabelText("Search departments"), { target: { value: "" } });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/admin-settings/master-data",
      search: { tab: "departments", page: undefined, q: undefined },
      replace: true,
    });
  });

  it("resets URL state when changing tabs and navigates to the previous page", () => {
    mock.search = { tab: "departments", page: 3, q: "Engineering" };
    mock.departmentTotal = 100;
    render(<MasterDataScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/admin-settings/master-data",
      search: { tab: "departments", page: 2, q: "Engineering" },
    });

    const designationsTab = screen.getByRole("tab", { name: "Designations" });
    fireEvent.mouseDown(designationsTab, { button: 0, ctrlKey: false });
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/admin-settings/master-data",
      search: { tab: "designations", page: undefined, q: undefined },
      replace: true,
    });
  });

  it("clamps an out-of-range URL page after the server total changes", async () => {
    mock.search = { tab: "departments", page: 5, q: "Finance" };
    render(<MasterDataScreen />);

    await waitFor(() =>
      expect(mock.navigate).toHaveBeenCalledWith({
        to: "/admin-settings/master-data",
        search: { tab: "departments", page: 3, q: "Finance" },
        replace: true,
      }),
    );
  });

  it("returns from page two to the first page without retaining an empty query", () => {
    mock.search = { tab: "departments", page: 2 };
    mock.departmentTotal = 50;
    render(<MasterDataScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/admin-settings/master-data",
      search: { tab: "departments", page: undefined, q: undefined },
    });
  });

  it("clamps an empty result to page one", async () => {
    mock.search = { tab: "departments", page: 3 };
    mock.departmentTotal = 0;
    mock.departmentItems.splice(0);
    render(<MasterDataScreen />);

    await waitFor(() =>
      expect(mock.navigate).toHaveBeenCalledWith({
        to: "/admin-settings/master-data",
        search: { tab: "departments", page: undefined, q: undefined },
        replace: true,
      }),
    );
  });

  it("rejects a blank name without sending a mutation", () => {
    render(<MasterDataScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));

    expect(mock.toastError).toHaveBeenCalledWith("Name is required");
    expect(mock.departmentMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("blocks duplicate create submissions and closes only after confirmed success", async () => {
    let finish!: (value: unknown) => void;
    mock.departmentMutation.mutateAsync.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<MasterDataScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Finance" },
    });
    fireEvent.change(within(dialog).getByLabelText("Code (optional)"), {
      target: { value: "FIN" },
    });
    const submit = within(dialog).getByRole("button", { name: "Add" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(mock.departmentMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => finish({}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps a create draft after a network failure so the Admin can retry", async () => {
    mock.departmentMutation.mutateAsync.mockRejectedValueOnce(new Error("Network disconnected"));
    render(<MasterDataScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Finance" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(mock.toastError).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Name")).toHaveValue("Finance");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mock.departmentRefetch).toHaveBeenCalledTimes(1);
  });

  it("keeps an invalid-code draft and refreshes after validation fails", async () => {
    render(<MasterDataScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "-" } });
    fireEvent.change(screen.getByLabelText("Code (optional)"), { target: { value: "-" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(mock.departmentRefetch).toHaveBeenCalledTimes(1));
    expect(mock.departmentMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mock.toastError).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Name")).toHaveValue("-");
  });

  it("uses the conflict version when a concurrent rename moves the record off the search page", async () => {
    mock.departmentUpdate.mutateAsync
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: "CONFLICT",
          message: "Department was modified by another actor.",
          details: { aggregate: "department", current_version: 2 },
        }),
      )
      .mockResolvedValueOnce({});
    mock.departmentRefetch.mockResolvedValueOnce({
      data: { items: [], page: 1, page_size: 25, total: 0 },
    });
    render(<MasterDataScreen />);

    fireEvent.pointerDown(
      screen.getAllByRole("button", { name: "Actions for Engineering" }).at(-1)!,
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry against latest version" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mock.departmentUpdate.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mock.departmentUpdate.mutateAsync.mock.calls[1]?.[0].input.expected_version).toBe(2);
  });

  it("recovers a stale department from the refreshed row", async () => {
    const current = mock.departmentItems[0]!;
    mock.departmentUpdate.mutateAsync.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "CONFLICT",
        message: "stale",
        details: { aggregate: "department" },
      }),
    );
    mock.departmentRefetch.mockResolvedValueOnce({
      data: {
        items: [
          { ...current, parent_department_id: null, parent_department_name: null, version: 4 },
        ],
        page: 1,
        page_size: 25,
        total: 1,
      },
    });
    render(<MasterDataScreen />);
    fireEvent.pointerDown(
      screen.getAllByRole("button", { name: "Actions for Engineering" }).at(-1)!,
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry against latest version" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mock.departmentUpdate.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mock.departmentUpdate.mutateAsync.mock.calls[1]?.[0].input.expected_version).toBe(4);
  });

  it("blocks a rapid duplicate status toggle before pending state renders", async () => {
    let finish!: (value: unknown) => void;
    mock.departmentUpdate.mutateAsync.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<MasterDataScreen />);

    const status = screen.getAllByRole("switch", { name: "Deactivate Engineering" })[0]!;
    fireEvent.click(status);
    fireEvent.click(status);

    expect(mock.departmentUpdate.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => finish({}));
  });

  it("keeps the row state and refreshes when a status mutation fails", async () => {
    mock.departmentUpdate.mutateAsync.mockRejectedValueOnce(new Error("Network disconnected"));
    render(<MasterDataScreen />);

    fireEvent.click(screen.getAllByRole("switch", { name: "Deactivate Engineering" })[0]!);

    await waitFor(() => expect(mock.departmentRefetch).toHaveBeenCalledTimes(1));
    expect(mock.toastError).toHaveBeenCalledWith(expect.any(Error), "Master data update failed");
  });

  it("shows the pending save state without accepting another action", () => {
    const view = render(<MasterDataScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    mock.departmentMutation.isPending = true;
    view.rerender(<MasterDataScreen />);

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("searches parent departments and clears an unavailable parent", async () => {
    mock.departmentItems.splice(0, mock.departmentItems.length, {
      ...mock.departmentItems[0]!,
      parent_department_id: "99999999-9999-4999-8999-999999999999",
      parent_id: "99999999-9999-4999-8999-999999999999",
      parent_department_name: null,
    });
    render(<MasterDataScreen />);
    fireEvent.pointerDown(
      screen.getAllByRole("button", { name: "Actions for Engineering" }).at(-1)!,
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(mock.departmentQueryParams).toHaveBeenCalledWith(
      expect.objectContaining({
        active_only: true,
        parent_candidate_for: "11111111-1111-4111-8111-111111111111",
      }),
    );
    fireEvent.change(screen.getByLabelText("Search parent departments"), {
      target: { value: "Finance" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Parent department" }));
    expect(await screen.findAllByText("Unavailable parent (unavailable)")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("option", { name: "Top level (no parent)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mock.departmentUpdate.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mock.departmentUpdate.mutateAsync.mock.calls[0]?.[0].input).toMatchObject({
      parent_department_id: null,
    });
  });

  it("keeps mock-only extended masters functional without exposing their API", async () => {
    mock.apiEnabled = false;
    mock.search = { tab: "employmentTypes" };
    render(<MasterDataScreen />);

    expect(screen.getByRole("tab", { name: "Employment Types" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Contractor" } });
    fireEvent.change(screen.getByLabelText("Description (optional)"), {
      target: { value: "Fixed term" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(mock.addMaster).toHaveBeenCalledWith("employmentTypes", "Contractor", "Fixed term");

    fireEvent.pointerDown(
      screen.getAllByRole("button", { name: "Actions for Full Time" }).at(-1)!,
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Permanent" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mock.updateMaster).toHaveBeenCalledWith("employmentTypes", "employment-full-time", {
      name: "Permanent",
      description: "Local",
    });

    fireEvent.click(screen.getAllByRole("switch", { name: "Deactivate Full Time" })[0]!);
    expect(mock.toggleMasterActive).toHaveBeenCalledWith("employmentTypes", "employment-full-time");

    fireEvent.pointerDown(
      screen.getAllByRole("button", { name: "Actions for Full Time" }).at(-1)!,
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete this record" }));
    expect(mock.deleteMaster).toHaveBeenCalledWith("employmentTypes", "employment-full-time");
  });

  it("creates, edits, activates and validates designation levels", async () => {
    mock.search = { tab: "designations" };
    mock.designationTotal = 1;
    mock.designationItems = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        designation_code: "LEAD",
        code: "LEAD",
        title: "Lead",
        name: "Lead",
        level: 7,
        status: "inactive",
        active: false,
        deleted_at: null,
        version: 3,
      },
    ];
    mock.designationMutation.mutateAsync.mockResolvedValue({});
    mock.designationUpdate.mutateAsync.mockResolvedValue({});
    render(<MasterDataScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Platform Lead" } });
    fireEvent.change(screen.getByLabelText("Code (optional)"), { target: { value: "PL" } });
    fireEvent.change(screen.getByLabelText("Level (optional)"), { target: { value: "7" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(mock.designationMutation.mutateAsync).toHaveBeenCalledWith({
        title: "Platform Lead",
        code: "PL",
        level: 7,
      }),
    );

    fireEvent.click(screen.getAllByRole("switch", { name: "Activate Lead" })[0]!);
    await waitFor(() =>
      expect(mock.designationUpdate.mutateAsync).toHaveBeenCalledWith({
        id: "22222222-2222-4222-8222-222222222222",
        input: { status: "active", expected_version: 3 },
      }),
    );

    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Actions for Lead" }).at(-1)!, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Level (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mock.designationUpdate.mutateAsync).toHaveBeenLastCalledWith({
        id: "22222222-2222-4222-8222-222222222222",
        input: { title: "Lead", code: "LEAD", expected_version: 3, level: null },
      }),
    );
  });

  it("recovers a stale designation using the refreshed row", async () => {
    mock.search = { tab: "designations" };
    mock.designationTotal = 1;
    const current = {
      id: "22222222-2222-4222-8222-222222222222",
      designation_code: "LEAD",
      code: "LEAD",
      title: "Lead",
      name: "Lead",
      level: null,
      status: "active",
      active: true,
      deleted_at: null,
      version: 1,
    };
    mock.designationItems = [current];
    mock.designationUpdate.mutateAsync.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "CONFLICT",
        message: "stale",
        details: { aggregate: "designation" },
      }),
    );
    mock.designationRefetch.mockResolvedValueOnce({
      data: { items: [{ ...current, level: 8, version: 2 }], page: 1, page_size: 25, total: 1 },
    });
    render(<MasterDataScreen />);

    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Actions for Lead" }).at(-1)!, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry against latest version" }));
    expect(screen.getByLabelText("Level (optional)")).toHaveValue(null);
  });

  it("refreshes designations after a failed status update", async () => {
    mock.search = { tab: "designations" };
    mock.designationTotal = 1;
    mock.designationItems = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        designation_code: "LEAD",
        code: "LEAD",
        title: "Lead",
        name: "Lead",
        level: 7,
        status: "active",
        active: true,
        deleted_at: null,
        version: 3,
      },
    ];
    mock.designationUpdate.mutateAsync.mockRejectedValueOnce(new Error("Network disconnected"));
    render(<MasterDataScreen />);

    fireEvent.click(screen.getAllByRole("switch", { name: "Deactivate Lead" })[0]!);

    await waitFor(() => expect(mock.designationRefetch).toHaveBeenCalledTimes(1));
    expect(mock.toastError).toHaveBeenCalledWith(expect.any(Error), "Master data update failed");
  });

  it("deactivates an active designation from its edit dialog", async () => {
    mock.search = { tab: "designations" };
    mock.designationTotal = 1;
    mock.designationItems = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        designation_code: "LEAD",
        code: "LEAD",
        title: "Lead",
        name: "Lead",
        level: 7,
        status: "active",
        active: true,
        deleted_at: null,
        version: 3,
      },
    ];
    render(<MasterDataScreen />);
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Actions for Lead" }).at(-1)!, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate this record" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mock.designationUpdate.mutateAsync).toHaveBeenCalledWith({
      id: "22222222-2222-4222-8222-222222222222",
      input: { status: "inactive", expected_version: 3 },
    });
  });

  it("closes an already inactive designation without issuing another update", async () => {
    mock.search = { tab: "designations" };
    mock.designationTotal = 1;
    mock.designationItems = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        designation_code: "LEAD",
        code: "LEAD",
        title: "Lead",
        name: "Lead",
        level: 7,
        status: "inactive",
        active: false,
        deleted_at: null,
        version: 3,
      },
    ];
    render(<MasterDataScreen />);
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Actions for Lead" }).at(-1)!, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate this record" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mock.designationUpdate.mutateAsync).not.toHaveBeenCalled();
  });

  it("renders honest loading and error states for list and parent searches", async () => {
    mock.departmentLoading = true;
    mock.departmentError = new Error("Department list unavailable");
    mock.parentLoading = true;
    mock.parentError = new Error("Parent search unavailable");
    render(<MasterDataScreen />);

    expect(screen.getByText("Department list unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Loading parent matches...")).toBeInTheDocument();
    expect(screen.getByText("Parent search unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
