import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ activeRole: "main_admin" }) }));
vi.mock("@/domains/leave-wfh", () => ({
  useHolidayMutation: () => ({ mutateAsync: mock.mutateAsync, isPending: false }),
  useHolidays: () => ({
    data: { holidays: [] },
    isLoading: false,
    isError: false,
    refetch: mock.refetch,
  }),
  holidaysFromResponse: () => [],
}));
vi.mock("sonner", () => ({ toast: { error: mock.toastError, success: mock.toastSuccess } }));

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
});

function fillHoliday(name = "Founders Day") {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-26" } });
  fireEvent.change(screen.getByLabelText("Region"), { target: { value: "All" } });
}

describe("holiday create form retry", () => {
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
