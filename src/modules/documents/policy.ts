import type { AuthUser, DocumentClassification, DocumentMetadata } from "#shared";
import { DocumentClassifications, Roles } from "#shared";

const restricted = new Set<DocumentClassification>([
  DocumentClassifications.Medical,
  DocumentClassifications.Compensation
]);

export function canAccessDocument(actor: AuthUser, document: DocumentMetadata, permission: "read" | "write" | "verify" | "audit"): boolean {
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
