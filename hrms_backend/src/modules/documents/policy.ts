import type { AuthUser, DocumentClassification, DocumentMetadata } from "#shared";
import { DocumentClassifications, Roles } from "#shared";

const restricted = new Set<DocumentClassification>([
  DocumentClassifications.Medical,
  DocumentClassifications.Compensation
]);
const employeeProofDocumentTypes = new Set([
  "identity_proof",
  "address_proof",
  "education_proof",
  "experience_proof",
]);

export function isEmployeeProofDocumentType(documentType: string): boolean {
  return employeeProofDocumentTypes.has(documentType);
}

export function isLegacyGeneratedDocument(
  document: Pick<DocumentMetadata, "metadata" | "business_object_type" | "document_type">,
): boolean {
  return document.metadata.generated === true ||
    document.business_object_type.endsWith("_export") ||
    document.document_type.endsWith("_export");
}

export function canAccessEmployeeProofDocument(
  actor: { id: string; roles: readonly string[] },
  document: { document_type: string; owner_user_id: string | null },
  permission: "read" | "write" | "verify" | "audit" = "read",
): boolean {
  if (!isEmployeeProofDocumentType(document.document_type)) return false;
  if (permission === "verify" || permission === "audit") {
    return actor.roles.includes(Roles.Admin);
  }
  return document.owner_user_id === actor.id || actor.roles.includes(Roles.Admin);
}

export function canAccessDocument(actor: AuthUser, document: DocumentMetadata, permission: "read" | "write" | "verify" | "audit"): boolean {
  // Old generated exports may carry public storage URLs and have no durable
  // company owner. Deny every document path until private byte delivery and
  // an immutable tenant policy are installed.
  if (isLegacyGeneratedDocument(document)) {
    return false;
  }
  if (isEmployeeProofDocumentType(document.document_type)) {
    return canAccessEmployeeProofDocument(actor, document, permission);
  }
  if (actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor)) {
    return true;
  }
  if (permission === "verify") {
    return actor.roles.includes(Roles.FinanceManager) || actor.roles.includes(Roles.HRManager);
  }
  if (document.document_type === "profile_photo" && actor.roles.includes(Roles.HRManager)) {
    return true;
  }
  if (restricted.has(document.classification)) {
    return actor.roles.includes(Roles.HRManager);
  }
  if (document.owner_user_id === actor.id || document.created_by_user_id === actor.id) {
    return true;
  }
  return (
    actor.roles.includes(Roles.FinanceManager) ||
    actor.roles.includes(Roles.Director) ||
    actor.roles.includes(Roles.AssetManager)
  );
}
