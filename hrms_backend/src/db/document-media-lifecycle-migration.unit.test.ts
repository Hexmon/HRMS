import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("./migrations/0071_document_media_lifecycle.sql", import.meta.url)),
  "utf8",
);

describe("0071 document ownership migration", () => {
  it("uses current membership only for the mechanically proven current profile pointer", () => {
    expect(migration).toContain("employee.profile_photo_document_id=metadata.id");
    expect(migration).toContain("metadata.document_type='profile_photo'");
    const coreCandidate = migration.slice(
      migration.indexOf("ON metadata.business_object_type='core_user'"),
      migration.indexOf("UNION ALL", migration.indexOf("ON metadata.business_object_type='core_user'")),
    );
    expect(coreCandidate).toContain("employee.profile_photo_document_id=metadata.id");
    expect(coreCandidate).toContain("metadata.document_type='profile_photo'");
    expect(migration).toContain("legacy_company_owner_unverified");
  });

  it("permits ownerless rows only while quarantined", () => {
    expect(migration).toContain("documents_metadata_tenant_state_company_ck");
    expect(migration).toContain("lifecycle_state = 'quarantined'");
    expect(migration).toContain("company_id IS NOT NULL AND lifecycle_state IN ('staged','active','replaced','tombstoned')");
  });
});
