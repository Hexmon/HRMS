import { describe, expect, it } from "vitest";
import { apiConfig } from "@/shared/api/config";
import { privateDocumentApiPath } from "./private-document";

describe("private document URL normalization", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const path = `/api/v1/documents/${id}/content`;

  it("accepts only authenticated document content paths on the API origin", () => {
    expect(privateDocumentApiPath(path)).toBe(path);
    expect(privateDocumentApiPath(`${apiConfig.baseUrl}${path}`)).toBe(path);
    expect(privateDocumentApiPath(`https://attacker.example${path}`)).toBeNull();
    expect(privateDocumentApiPath("/api/v1/documents/not-a-uuid/content")).toBeNull();
    expect(privateDocumentApiPath("javascript:alert(1)")).toBeNull();
  });
});
