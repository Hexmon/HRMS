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

  it("writes formula-like XLSX cells as literal inline text and strips invalid XML controls", async () => {
    const store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;
    const result = await createGeneratedExportDocument(store, {
      actor,
      businessObjectType: "test_export",
      businessObjectId: randomUUID(),
      reportType: "test",
      format: "xlsx",
      rows: [{ name: "\ufeff=1+1", note: "hello\u0001world" }],
      columns: ["name", "note"],
      filePrefix: "test-export",
    });
    const document = store.documents.find((candidate) => candidate.id === result.download_document_id)!;
    const object = await store.objectStorage!.getObject(document.storage_key);
    const zipText = object!.body.toString("utf8");
    expect(zipText).toContain("<t>&apos;\ufeff=1+1</t>");
    expect(zipText).toContain("<t>helloworld</t>");
    expect(zipText).not.toContain("hello\u0001world");
  });
});
