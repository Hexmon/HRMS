export const EMPLOYEE_PROOF_PURPOSES = [
  { documentType: "identity_proof", name: "Identity Proof", category: "Identity" },
  { documentType: "address_proof", name: "Address Proof", category: "Address" },
  { documentType: "education_proof", name: "Education Proof", category: "Education" },
  {
    documentType: "experience_proof",
    name: "Previous Experience Proof (if applicable)",
    category: "Experience",
  },
] as const;

export interface MissingEmployeeProof {
  id: string;
  documentType: (typeof EMPLOYEE_PROOF_PURPOSES)[number]["documentType"];
  name: string;
  category: string;
}

export function missingEmployeeProofs(
  existingDocumentTypes: readonly string[],
): MissingEmployeeProof[] {
  const existing = new Set(existingDocumentTypes.map((value) => value.trim().toLowerCase()));
  return EMPLOYEE_PROOF_PURPOSES.filter(({ documentType }) => !existing.has(documentType)).map(
    ({ documentType, name, category }) => ({
      id: `required:${documentType}`,
      documentType,
      name,
      category,
    }),
  );
}
