import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  holidays: [] as Array<Record<string, unknown>>,
  activeRole: "main_admin",
  isLoading: false,
  isError: false,
  queryError: null as unknown,
  holidayYears: [] as number[],
  navigate: vi.fn(),
  routeMonth: undefined as string | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (configuration: Record<string, unknown>) => ({
    ...configuration,
    useSearch: () => ({ month: mock.routeMonth }),
  }),
  useNavigate: () => mock.navigate,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ activeRole: mock.activeRole }) }));
vi.mock("@/domains/leave-wfh", () => ({
  useHolidayMutation: () => ({ mutateAsync: mock.mutateAsync, isPending: false }),
  useHolidays: (query: { year: number }) => {
    mock.holidayYears.push(query.year);
    return {
      data: { holidays: mock.holidays },
      isLoading: mock.isLoading,
      isError: mock.isError,
      error: mock.queryError,
      refetch: mock.refetch,
    };
  },
  holidaysFromResponse: (value: { holidays?: Array<Record<string, unknown>> }) =>
    value.holidays ?? [],
}));
vi.mock("sonner", () => ({ toast: { error: mock.toastError, success: mock.toastSuccess } }));

import { formatHolidayDate, isHolidayInMonth } from "@/domains/leave-wfh/calendar-date";
import {
  holidayCursorFromHref,
  holidayMonthRedirectSearch,
  holidaySearchFromRecord,
  HolidaysPage,
  HolidaysRoutePage,
  hrefWithHolidayCursor,
  initialHolidayCursor,
  requiredHolidayMonth,
} from "@/routes/_app/leave-wfh.holidays";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  window.history.replaceState({}, "", "/leave-wfh/holidays");
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
  mock.isLoading = false;
  mock.isError = false;
  mock.queryError = null;
  mock.holidayYears = [];
  mock.navigate.mockReset();
  mock.routeMonth = undefined;
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

  it("closes the form and clears an unfinished draft without submitting", () => {
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    fillHoliday("Draft Holiday");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mock.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue("");
  });

  it("renders loading and request failure states", () => {
    mock.isLoading = true;
    const loading = render(<HolidaysPage />);
    expect(screen.getByText("Loading holidays...")).toBeInTheDocument();
    loading.unmount();

    mock.isLoading = false;
    mock.isError = true;
    mock.queryError = new Error("Calendar unavailable");
    render(<HolidaysPage />);
    expect(screen.getByText("Could not load holidays")).toBeInTheDocument();
  });

  it("defaults a blank region to All", async () => {
    mock.mutateAsync.mockResolvedValueOnce({});
    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Founders Day" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-26" } });
    fireEvent.click(screen.getByRole("switch", { name: "Optional holiday" }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => expect(mock.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mock.mutateAsync.mock.calls[0]?.[0].input.region).toBe("All");
    expect(mock.mutateAsync.mock.calls[0]?.[0].input.optional).toBe(true);
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
    const calendarTab = screen.getByRole("tab", { name: "Calendar" });
    fireEvent.pointerDown(calendarTab, { button: 0, ctrlKey: false });
    fireEvent.click(calendarTab);
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
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Calendar" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("Regional Day")).toBeInTheDocument();
    expect(screen.getByText("Optional Day")).toBeInTheDocument();
  });

  it("round-trips a selected calendar month through the URL", () => {
    const today = new Date("2026-11-17T12:00:00.000Z");
    expect(
      holidayCursorFromHref("https://hrms.example/leave-wfh/holidays?month=2027-01", today),
    ).toEqual({ y: 2027, m: 0 });
    expect(
      holidayCursorFromHref("https://hrms.example/leave-wfh/holidays?month=invalid", today),
    ).toEqual({ y: today.getFullYear(), m: today.getMonth() });
    expect(holidayCursorFromHref("https://hrms.example/leave-wfh/holidays", today)).toEqual({
      y: today.getFullYear(),
      m: today.getMonth(),
    });
    expect(
      hrefWithHolidayCursor("https://hrms.example/leave-wfh/holidays", { y: 2026, m: 11 }).search,
    ).toBe("?month=2026-12");
    expect(holidaySearchFromRecord({ month: "2027-01" })).toEqual({ month: "2027-01" });
    expect(holidaySearchFromRecord({ month: "2027-13" })).toEqual({ month: undefined });
    expect(requiredHolidayMonth({}, today)).toBe("2026-11");
    expect(requiredHolidayMonth({ month: "2027-01" }, today)).toBe("2027-01");
    expect(holidayMonthRedirectSearch({}, today)).toEqual({ month: "2026-11" });
    expect(holidayMonthRedirectSearch({ month: "2027-01" }, today)).toBeNull();
  });

  it("preserves controlled router navigation across January and December boundaries", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
    mock.holidays = [
      {
        id: firstId,
        name: "January Boundary Day",
        date: "2027-01-01",
        region: "All",
        optional: false,
        expectedVersion: 1,
      },
    ];
    function RoutedHolidayPage() {
      const [month, setMonth] = useState("2027-01");
      return <HolidaysPage month={month} onMonthChange={setMonth} />;
    }
    render(<RoutedHolidayPage />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Calendar" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "February 2027" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();
  });

  it("keeps calendar navigation usable without a router callback", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
    render(<HolidaysPage />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Calendar" }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
  });

  it("canonicalizes a missing routed month before rendering the calendar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
    render(<HolidaysRoutePage />);

    expect(screen.getByRole("status", { name: "Loading holiday calendar" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mock.navigate).toHaveBeenCalledWith({
        to: "/leave-wfh/holidays",
        search: { month: "2026-11" },
        replace: true,
      });
    });
    expect(mock.holidayYears).toEqual([]);
  });

  it("renders a routed month and preserves it through router navigation", () => {
    mock.routeMonth = "2027-01";
    render(<HolidaysRoutePage />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Calendar" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(mock.navigate).toHaveBeenCalledWith({
      to: "/leave-wfh/holidays",
      search: { month: "2027-02" },
      replace: true,
    });
  });

  it("hydrates a non-current routed month without changing the server calendar", async () => {
    const markup = renderToString(<HolidaysPage month="2027-01" />);
    expect(mock.holidayYears.at(-1)).toBe(2027);
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = hydrateRoot(container, <HolidaysPage month="2027-01" />);
    await act(async () => undefined);
    expect(mock.holidayYears.at(-1)).toBe(2027);
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match/iu);
    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
  });

  it("falls back to the current month when rendered without a browser window", () => {
    const originalWindow = window;
    const today = new Date("2026-11-17T12:00:00.000Z");
    vi.stubGlobal("window", undefined);
    expect(initialHolidayCursor(today)).toEqual({ y: 2026, m: 10 });
    vi.stubGlobal("window", originalWindow);
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
    const conflict = Object.assign(new Error("Conflict"), {
      status: 409,
      details: { reason: "stale_version" },
    });
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

  it("keeps an editable draft for a duplicate conflict without showing stale-version recovery", async () => {
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
    const conflict = Object.assign(new Error("Holiday with the same name already exists."), {
      status: 409,
      details: { reason: "duplicate_holiday" },
    });
    Object.setPrototypeOf(conflict, (await import("@/shared/api")).ApiError.prototype);
    mock.mutateAsync.mockRejectedValueOnce(conflict);

    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Regional Day" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Duplicate Day" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mock.toastError).toHaveBeenCalledTimes(1));
    expect(mock.toastError.mock.calls[0]?.[0]).toContain(
      "Holiday with the same name already exists.",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Duplicate Day");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.queryByText("A newer version is available")).not.toBeInTheDocument();
    expect(mock.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft editable when a stale holiday was removed during refresh", async () => {
    mock.holidays = [
      {
        id: firstId,
        name: "Removed Holiday",
        date: "2026-12-01",
        region: "IN",
        optional: false,
        expectedVersion: 2,
      },
    ];
    const conflict = Object.assign(new Error("Conflict"), {
      status: 409,
      details: { reason: "stale_version" },
    });
    Object.setPrototypeOf(conflict, (await import("@/shared/api")).ApiError.prototype);
    mock.mutateAsync.mockRejectedValueOnce(conflict);
    mock.refetch.mockResolvedValueOnce({ data: { holidays: [] } });

    render(<HolidaysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Removed Holiday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mock.refetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("A newer version is available")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      finish({});
    });
    expect(mock.toastSuccess).toHaveBeenCalledTimes(1);
  });
});
