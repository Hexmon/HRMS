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
        companyId: "foreign-company",
        role: "PlatformAdmin",
        ownerUserId: "foreign-owner",
        expected_version: 999,
      } as Parameters<typeof result.current.mutateAsync>[0]);
    });

    const [sentFormData, command] = mock.uploadCompanyLogo.mock.calls[0]!;
    expect(sentFormData).toBe(formData);
    expect(Array.from((sentFormData as FormData).keys())).toEqual(["file"]);
    expect(command).toEqual({
      idempotencyKey: "logo-idempotency-key",
      expectedVersion: 7,
      expectedPointerDocumentId: "document-old",
    });
    expect(
      queryClient.getQueryData(["api", "admin", "company-profile", "detail", "current", {}]),
    ).toEqual(company);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["api", "admin"] }));
  });

  it("leaves the cached company untouched when the media CAS command is rejected", async () => {
    mock.uploadCompanyLogo.mockRejectedValue(new Error("Company profile changed"));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const companyKey = ["api", "admin", "company-profile", "detail", "current", {}];
    const existingCompany = { id: "company-1", version: 7, logo_document_id: "document-old" };
    queryClient.setQueryData(companyKey, existingCompany);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadCompanyLogoMutation(), { wrapper });
    const formData = new FormData();
    formData.set("file", new File(["logo"], "logo.png", { type: "image/png" }));

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          formData,
          idempotencyKey: "logo-idempotency-key",
          expectedVersion: 7,
          expectedPointerDocumentId: "document-old",
        }),
      ).rejects.toThrow("Company profile changed");
    });

    expect(queryClient.getQueryData(companyKey)).toEqual(existingCompany);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
