import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", () => ({ apiRequest }));

import { emsApi } from "./api";

describe("EMS employee-proof media API", () => {
  beforeEach(() => apiRequest.mockReset());

  it("lists only through the employee document endpoint with the requested purpose", async () => {
    apiRequest.mockResolvedValue({ items: [], page: 2, page_size: 20, total: 0 });
    await emsApi.listEmployeeDocuments("employee-1", {
      page: 2,
      page_size: 20,
      document_type: "identity_proof",
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/ems/employees/employee-1/documents", {
      query: { page: 2, page_size: 20, document_type: "identity_proof" },
    });
  });

  it("attaches the exact FormData instance with the caller command key", async () => {
    const form = new FormData();
    form.append("document_type", "address_proof");
    apiRequest.mockResolvedValue({ document: { id: "doc-1" } });
    await emsApi.attachEmployeeDocument("employee-1", form, "proof-command-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/ems/employees/employee-1/documents", {
      method: "POST",
      body: form,
      headers: { "Idempotency-Key": "proof-command-1" },
    });
  });

  it("propagates rejection without retrying or changing the submitted body", async () => {
    const form = new FormData();
    form.append("document_type", "education_proof");
    const stale = new Error("409 replacement changed");
    apiRequest.mockImplementationOnce(async () => {
      throw stale;
    });
    await expect(
      emsApi.attachEmployeeDocument("employee-1", form, "proof-command-stale"),
    ).rejects.toBe(stale);
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(form.get("document_type")).toBe("education_proof");
  });
});
