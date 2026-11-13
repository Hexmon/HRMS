import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  holidays: [] as Array<Record<string, unknown>>,
  activeRole: "main_admin",
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ activeRole: mock.activeRole }) }));
vi.mock("@/domains/leave-wfh", () => ({
  useHolidayMutation: () => ({ mutateAsync: mock.mutateAsync, isPending: false }),
  useHolidays: () => ({
    data: { holidays: mock.holidays },
    isLoading: false,
    isError: false,
    refetch: mock.refetch,
  }),
  holidaysFromResponse: (value: { holidays?: Array<Record<string, unknown>> }) =>
    value.holidays ?? [],
}));
vi.mock("sonner", () => ({ toast: { error: mock.toastError, success: mock.toastSuccess } }));

import { formatHolidayDate, isHolidayInMonth } from "@/domains/leave-wfh/calendar-date";
import { HolidaysPage } from "@/routes/_app/leave-wfh.holidays";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn().mockReturnValueOnce(firstId).mockReturnValueOnce(secondId),
  });
  mock.refetch.mockResolvedValue({ data: { holidays: [] } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  mock.holidays = [];
  mock.activeRole = "main_admin";
});

function fillHoliday(name = "Founders Day") {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-26" } });
  fireEvent.change(screen.getByLabelText("Region"), { target: { value: "All" } });
}

describe("holiday create form retry", () => {
  it("keeps mutation controls hidden for an employee-only view", () => {
    mock.activeRole = "employee";
    mock.holidays = [
      {
        id: firstId,
        name: "Regional Day",
        date: "2026-12-01",
        region: "IN",
        optional: false,
        expectedVersion: 1,
      },
    ];
    render(<HolidaysPage />);
    expect(screen.queryByRole("button", { name: "Add holiday" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Regional Day" })).not.toBeInTheDocument();
  });

  it("rejects whitespace-only names before calling the API", () => {
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    fillHoliday("   ");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    expect(mock.mutateAsync).not.toHaveBeenCalled();
    expect(mock.toastError).toHaveBeenCalledWith(
      "Enter a holiday name of at least 2 characters and a date",
    );
  });

  it("keeps date-only holidays in their calendar month across local time zones", () => {
    const date = "2026-12-01";
    // Parsing the old value as an instant yields the previous local date in LA.
    expect(new Date(date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })).toBe(
      "11/30/2026",
    );
    expect(isHolidayInMonth(date, 2026, 11)).toBe(true);
    expect(isHolidayInMonth(date, 2026, 10)).toBe(false);
    expect(formatHolidayDate(date, "en-US")).toBe("Tue, Dec 01, 2026");
  });

  it("renders a December 1 holiday in the December list and calendar", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T12:00:00.000Z"));
    mock.holidays = [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "December Founding",
        date: "2026-12-01",
        region: "All",
        optional: false,
        expectedVersion: 1,
      },
    ];
    render(<HolidaysPage />);
    expect(screen.getByText("December Founding")).toBeInTheDocument();
    expect(screen.getByText(/Dec 01, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Calendar" }));
    expect(screen.getByText("December Founding")).toBeInTheDocument();
  });

  it("renders every holiday that falls on the same calendar day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T12:00:00.000Z"));
    mock.holidays = [
      {
        id: firstId,
        name: "Regional Day",
        date: "2026-12-01",
        region: "IN",
        optional: false,
        expectedVersion: 1,
      },
      {
        id: secondId,
        name: "Optional Day",
        date: "2026-12-01",
        region: "US",
        optional: true,
        expectedVersion: 2,
      },
    ];
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Calendar" }));
    expect(screen.getByText("Regional Day")).toBeInTheDocument();
    expect(screen.getByText("Optional Day")).toBeInTheDocument();
  });

  it("edits with the displayed version and keeps the draft after a stale conflict", async () => {
    mock.holidays = [
      {
        id: firstId,
        name: "Regional Day",
        date: "2026-12-01",
        region: "IN",
        optional: false,
        expectedVersion: 4,
      },
    ];
    const conflict = Object.assign(new Error("Conflict"), { status: 409 });
    Object.setPrototypeOf(conflict, (await import("@/shared/api")).ApiError.prototype);
    mock.mutateAsync.mockRejectedValueOnce(conflict).mockResolvedValueOnce({});
    mock.refetch.mockResolvedValueOnce({
      data: {
        holidays: [
          {
            id: firstId,
            name: "Concurrent Server Value",
            date: "2026-12-01",
            region: "IN",
            optional: false,
            expectedVersion: 5,
          },
        ],
      },
    });
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Regional Day" }));
    expect(screen.getByRole("heading", { name: "Edit holiday" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Regional Day Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mock.toastError).toHaveBeenCalledTimes(1));
    expect(mock.toastError.mock.calls[0]?.[0]).toContain("changed after you opened it");
    expect(mock.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Name")).toHaveValue("Regional Day Updated");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("A newer version is available")).toBeInTheDocument();
    expect(mock.mutateAsync).toHaveBeenLastCalledWith({
      id: firstId,
      input: {
        name: "Regional Day Updated",
        date: "2026-12-01",
        region: "IN",
        optional: false,
        expected_version: 4,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Load latest version" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Concurrent Server Value");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Regional Day Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mock.toastSuccess).toHaveBeenCalledWith("Regional Day Updated updated"),
    );
    expect(mock.mutateAsync.mock.calls[1]?.[0].input.expected_version).toBe(5);
  });

  it("keeps the same ID and draft after a network error, refetches, and resets only after confirmed success", async () => {
    mock.mutateAsync
      .mockRejectedValueOnce(new Error("Network disconnected"))
      .mockResolvedValueOnce({});
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    fillHoliday();
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(mock.toastError).toHaveBeenCalledTimes(1));
    expect(mock.toastError.mock.calls[0]?.[0]).toContain("retry with the same details");
    expect(mock.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Name")).toHaveValue("Founders Day");

    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(mock.toastSuccess).toHaveBeenCalledTimes(1));
    expect(mock.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mock.mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      id: firstId,
      input: { name: "Founders Day", date: "2026-12-26" },
    });
    expect(mock.mutateAsync.mock.calls[1]?.[0].id).toBe(firstId);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    fillHoliday("New Day");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(mock.mutateAsync).toHaveBeenCalledTimes(3));
    expect(mock.mutateAsync.mock.calls[2]?.[0].id).toBe(secondId);
  });

  it("blocks a second click while the first request is pending", async () => {
    let finish!: (value: unknown) => void;
    mock.mutateAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    fillHoliday();
    const add = screen.getByRole("button", { name: /^Add$/ });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(mock.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({});
    });
    expect(mock.toastSuccess).toHaveBeenCalledTimes(1);
  });
});
