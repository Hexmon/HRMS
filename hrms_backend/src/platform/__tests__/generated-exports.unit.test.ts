import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds } from "../data-store.js";
import { createGeneratedExportDocument } from "../generated-exports.js";
import { MemoryObjectStorage } from "../object-storage.js";

describe("generated export rendering", () => {
  it("neutralizes formula-like CSV strings without corrupting typed numbers", async () => {
    const store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;

    const result = await createGeneratedExportDocument(store, {
      actor,
      businessObjectType: "test_export",
      businessObjectId: randomUUID(),
      reportType: "test",
      format: "csv",
      rows: [
        {
          name: " =1+1",
          code: "+E001",
          delta: -5,
        },
      ],
      columns: ["name", "code", "delta"],
      columnHeaders: ["Name", "Code", "Delta"],
      filePrefix: "test-export",
    });
    const document = store.documents.find(
      (candidate) => candidate.id === result.download_document_id,
    );
    const object = await store.objectStorage!.getObject(document!.storage_key);

    expect(object!.body.toString("utf8")).toBe(
      "\"Name\",\"Code\",\"Delta\"\n\"' =1+1\",\"'+E001\",\"-5\"\n",
    );
  });
});
