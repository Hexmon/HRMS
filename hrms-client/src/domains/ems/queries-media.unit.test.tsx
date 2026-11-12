import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  attach: vi.fn(async () => ({})),
}));

vi.mock("./api", () => ({
  emsApi: { attachEmployeeDocument: mock.attach },
}));

import { useEmsDocumentMutation } from "./queries";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EMS document mutation refresh", () => {
  it("does not resolve until both EMS and document query refreshes finish", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const refreshResolvers: Array<() => void> = [];
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(
        async () => new Promise<void>((resolve) => refreshResolvers.push(resolve)),
      );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEmsDocumentMutation("employee-1"), { wrapper });
    const input = new FormData();
    input.set("document_type", "identity_proof");

    let settled = false;
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.mutateAsync({ input, idempotencyKey: "idem-1" });
      void mutation.then(() => {
        settled = true;
      });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["api", "ems"],
      ["api", "documents"],
    ]);

    await act(async () => {
      refreshResolvers.forEach((resolve) => resolve());
      await mutation;
    });
    expect(settled).toBe(true);
    expect(mock.attach).toHaveBeenCalledWith("employee-1", input, "idem-1");
  });
});
