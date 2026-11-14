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
          code: "\u0000\ufeff+E001",
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
      "\"Name\",\"Code\",\"Delta\"\n\"' =1+1\",\"'\u0000\ufeff+E001\",\"-5\"\n",
    );
  });

  it("writes XML-safe XLSX text while preserving escaped punctuation and Unicode", async () => {
    const store = createMemoryDataStore();
    store.objectStorage = new MemoryObjectStorage();
    const actor = store.users.find((user) => user.id === seedIds.admin)!;

    const result = await createGeneratedExportDocument(store, {
      actor,
      businessObjectType: "test_export",
      businessObjectId: randomUUID(),
      reportType: "test",
      format: "xlsx",
      rows: [{
        name: "R&D <India> & \"QA\" 'Team' 🚀",
        note: "hello\u0000\u0001\u000bworld\tline\nnext\rrow",
        formula_text: "=1+1",
        xml_boundaries: "\u0009\u000a\u000d\u0020\ud7ff\ue000\ufffd🚀",
        empty: null,
        lone_surrogate: "before\ud800after",
      }],
      columns: ["name", "note", "formula_text", "xml_boundaries", "empty", "lone_surrogate"],
      filePrefix: "test-export",
    });
    const document = store.documents.find(
      (candidate) => candidate.id === result.download_document_id,
    )!;
    const object = await store.objectStorage.getObject(document.storage_key);
    const zipText = object!.body.toString("utf8");
    const worksheetStart = zipText.indexOf("<worksheet ");
    const worksheetEnd = zipText.indexOf("</worksheet>", worksheetStart);
    expect(worksheetStart).toBeGreaterThanOrEqual(0);
    expect(worksheetEnd).toBeGreaterThan(worksheetStart);
    const worksheetXml = zipText.slice(
      worksheetStart,
      worksheetEnd + "</worksheet>".length,
    );

    expect(worksheetXml).toContain("<t>R&amp;D &lt;India&gt; &amp; &quot;QA&quot; &apos;Team&apos; 🚀</t>");
    expect(worksheetXml).toContain("<t>helloworld\tline\nnext\rrow</t>");
    expect(worksheetXml).toContain("<t>=1+1</t>");
    expect(worksheetXml).toContain("<t>\t\n\r \ud7ff\ue000\ufffd🚀</t>");
    expect(worksheetXml).toContain("<t></t>");
    expect(worksheetXml).toContain("<t>beforeafter</t>");
    expect(worksheetXml).not.toMatch(/[\u0000\u0001\u000b\ud800]/u);
  });
});
