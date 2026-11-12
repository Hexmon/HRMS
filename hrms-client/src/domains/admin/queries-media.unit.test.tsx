import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  uploadCompanyLogo: vi.fn(),
}));

vi.mock("./api", () => ({
  adminApi: { uploadCompanyLogo: mock.uploadCompanyLogo },
}));

import { useUploadCompanyLogoMutation } from "./queries";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("company logo mutation refresh", () => {
  it("forwards the media CAS contract and refreshes the active admin cache", async () => {
    const company = { id: "company-1", version: 8, logo_document_id: "document-new" };
    mock.uploadCompanyLogo.mockResolvedValue({ company });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadCompanyLogoMutation(), { wrapper });
    const formData = new FormData();
    formData.set("file", new File(["logo"], "logo.png", { type: "image/png" }));

    await act(async () => {
      await result.current.mutateAsync({
        formData,
        idempotencyKey: "logo-idempotency-key",
        expectedVersion: 7,
        expectedPointerDocumentId: "document-old",
      });
    });

    expect(mock.uploadCompanyLogo).toHaveBeenCalledWith(formData, {
      formData,
      idempotencyKey: "logo-idempotency-key",
      expectedVersion: 7,
      expectedPointerDocumentId: "document-old",
    });
    expect(
      queryClient.getQueryData([
        "api",
        "admin",
        "company-profile",
        "detail",
        "current",
        {},
      ]),
    ).toEqual(company);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["api", "admin"] }),
    );
  });
});
