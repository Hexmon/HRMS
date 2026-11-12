import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fileContentMatchesMimeType } from "../multipart-upload.js";

describe("multipart upload content validation", () => {
  it.each([
    ["text/plain", "safe.txt", Buffer.from("safe text\n")],
    ["text/csv", "safe.csv", Buffer.from("name,value\nExample,1\n")],
  ])("accepts valid %s content", async (mimeType, fileName, body) => {
    await expect(fileContentMatchesMimeType(body, mimeType, fileName)).resolves.toBe(true);
  });

  it("decodes valid PDF and image content", async () => {
    const pdf = await validPdf();
    const jpeg = await sharp(validPixels()).jpeg().toBuffer();
    const png = await sharp(validPixels()).png().toBuffer();
    const webp = await sharp(validPixels()).webp().toBuffer();
    await expect(fileContentMatchesMimeType(pdf, "application/pdf", "proof.pdf")).resolves.toBe(true);
    await expect(fileContentMatchesMimeType(jpeg, "image/jpeg", "photo.jpg")).resolves.toBe(true);
    await expect(fileContentMatchesMimeType(png, "image/png", "photo.png")).resolves.toBe(true);
    await expect(fileContentMatchesMimeType(webp, "image/webp", "photo.webp")).resolves.toBe(true);
    const appendedExecutable = Buffer.from("MZ-disguised-executable");
    await expect(fileContentMatchesMimeType(
      Buffer.concat([pdf, appendedExecutable]), "application/pdf", "proof.pdf",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.concat([jpeg, appendedExecutable]), "image/jpeg", "photo.jpg",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.concat([png, appendedExecutable]), "image/png", "photo.png",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.concat([webp, appendedExecutable]), "image/webp", "photo.webp",
    )).resolves.toBe(false);
  });

  it.each([
    ["application/pdf", "payload.pdf"],
    ["image/jpeg", "payload.jpg"],
    ["image/png", "payload.png"],
    ["image/webp", "payload.webp"],
    ["text/plain", "payload.txt"],
    ["text/csv", "payload.csv"],
  ])("rejects executable bytes declared as %s", async (mimeType, fileName) => {
    const executable = Buffer.concat([Buffer.from("%PDF-"), Buffer.from([0x4d, 0x5a, 0, 1])]);
    await expect(fileContentMatchesMimeType(executable, mimeType, fileName)).resolves.toBe(false);
  });

  it("rejects mismatched extensions, unsupported legacy Office files, unknown MIME, and CSV formulas", async () => {
    const pdf = await validPdf();
    await expect(fileContentMatchesMimeType(pdf, "application/pdf", "proof.exe")).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(Buffer.from("unknown"), "application/x-custom", "file.bin"))
      .resolves.toBe(false);
    await expect(fileContentMatchesMimeType(Buffer.from("legacy"), "application/msword", "proof.doc"))
      .resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from("legacy"), "application/vnd.ms-excel", "proof.xls",
    ))
      .resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from("office"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "proof.docx",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from("office"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "proof.xlsx",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from('name,value\nattack," =HYPERLINK(""https://evil.example"")"\n'),
      "text/csv",
      "proof.csv",
    )).resolves.toBe(false);
  });

  it("rejects invalid text and every unsafe CSV cell position while retaining safe quoting", async () => {
    await expect(fileContentMatchesMimeType(Buffer.from([0xc3, 0x28]), "text/plain", "proof.txt"))
      .resolves.toBe(false);
    await expect(fileContentMatchesMimeType(Buffer.from([0x01]), "text/plain", "proof.txt"))
      .resolves.toBe(false);
    await expect(fileContentMatchesMimeType(Buffer.from("\tline\r\n"), "text/plain", "proof.txt"))
      .resolves.toBe(true);
    for (const formula of [" =1+1", "+1+1", "-1+1", "@SUM(1,1)"]) {
      await expect(fileContentMatchesMimeType(
        Buffer.from(`name,value\nattack,${formula}\n`), "text/csv", "proof.csv",
      )).resolves.toBe(false);
    }
    await expect(fileContentMatchesMimeType(
      Buffer.from("\uFEFF=HYPERLINK(\"https://evil.example\")\n"), "text/csv", "proof.csv",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from("sep=;\nname;value\nattack;=1+1\n"), "text/csv", "proof.csv",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from("name|value\nattack|=1+1\n"), "text/csv", "proof.csv",
    )).resolves.toBe(false);
    await expect(fileContentMatchesMimeType(
      Buffer.from('name,value\n"a""b"," ordinary"\n'), "text/csv", "proof.csv",
    )).resolves.toBe(true);
  });

  it("rejects active and malformed PDF payloads", async () => {
    const pdf = await validPdf();
    const activePdf = Buffer.concat([
      pdf.subarray(0, pdf.lastIndexOf(Buffer.from("%%EOF"))),
      Buffer.from("/JavaScript\n%%EOF\n"),
    ]);
    await expect(fileContentMatchesMimeType(activePdf, "application/pdf", "proof.pdf"))
      .resolves.toBe(false);
    const compressedActiveDocument = await PDFDocument.create();
    compressedActiveDocument.addPage([100, 100]);
    compressedActiveDocument.catalog.set(PDFName.of("OpenAction"), compressedActiveDocument.context.obj({
      S: PDFName.of("JavaScript"),
      JS: PDFString.of("app.alert('unsafe')"),
    }));
    const compressedActivePdf = Buffer.from(await compressedActiveDocument.save());
    expect(compressedActivePdf.includes(Buffer.from("/OpenAction"))).toBe(false);
    await expect(fileContentMatchesMimeType(compressedActivePdf, "application/pdf", "proof.pdf"))
      .resolves.toBe(false);
    for (const attachActiveObject of [
      (document: PDFDocument) => {
        document.context.register(document.context.obj({ S: PDFName.of("JavaScript") }));
      },
      (document: PDFDocument) => {
        document.context.register(document.context.obj([PDFName.of("JavaScript")]));
      },
      (document: PDFDocument) => {
        const stream = document.context.flateStream("safe", { S: PDFName.of("JavaScript") });
        document.catalog.set(PDFName.of("Metadata"), document.context.register(stream));
      },
    ]) {
      const document = await PDFDocument.create();
      document.addPage([100, 100]);
      attachActiveObject(document);
      const encoded = Buffer.from(await document.save());
      await expect(fileContentMatchesMimeType(encoded, "application/pdf", "proof.pdf"))
        .resolves.toBe(false);
    }
    const streamedDocument = await PDFDocument.create();
    streamedDocument.addPage([100, 100]);
    const metadata = streamedDocument.context.flateStream("<safe></safe>", {
      Type: PDFName.of("Metadata"),
    });
    streamedDocument.catalog.set(PDFName.of("Metadata"), streamedDocument.context.register(metadata));
    await expect(fileContentMatchesMimeType(
      Buffer.from(await streamedDocument.save()), "application/pdf", "proof.pdf",
    )).resolves.toBe(true);
    await expect(fileContentMatchesMimeType(
      Buffer.from("%PDF-1.7\nnot-a-document\n%%EOF\n"), "application/pdf", "proof.pdf",
    )).resolves.toBe(false);
  });

  it("rejects undecodable images and decoded images with a mismatched declared format", async () => {
    await expect(fileContentMatchesMimeType(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg", "photo.jpg",
    )).resolves.toBe(false);
    const webp = await sharp(validPixels()).webp().toBuffer();
    await expect(fileContentMatchesMimeType(
      Buffer.concat([webp, Buffer.from([0xff, 0xd9])]), "image/jpeg", "photo.jpg",
    )).resolves.toBe(false);
  });

});

async function validPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([100, 100]);
  return Buffer.from(await document.save());
}

function validPixels() {
  return { create: { width: 2, height: 2, channels: 3 as const, background: "white" } };
}
