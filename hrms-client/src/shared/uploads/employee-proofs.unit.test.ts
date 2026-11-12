import { describe, expect, it } from "vitest";
import { isEmployeeProofPurpose, missingEmployeeProofs } from "./employee-proofs";

describe("missing employee proof cards", () => {
  it("offers every approved proof purpose to a new employee", () => {
    expect(missingEmployeeProofs([])).toEqual([
      expect.objectContaining({ documentType: "identity_proof" }),
      expect.objectContaining({ documentType: "address_proof" }),
      expect.objectContaining({ documentType: "education_proof" }),
      expect.objectContaining({ documentType: "experience_proof" }),
    ]);
  });

  it("does not offer a purpose that already has a document", () => {
    const missing = missingEmployeeProofs(["identity_proof", "IDENTITY_PROOF", "address_proof"]);

    expect(missing.map(({ documentType }) => documentType)).toEqual([
      "education_proof",
      "experience_proof",
    ]);
  });

  it("rejects profile photos and untyped records as proof purposes", () => {
    expect(isEmployeeProofPurpose("identity_proof")).toBe(true);
    expect(isEmployeeProofPurpose(" profile_photo ")).toBe(false);
    expect(isEmployeeProofPurpose("other")).toBe(false);
  });
});
