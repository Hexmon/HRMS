import type { FastifyRequest } from "fastify";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from "pdf-lib";
import sharp from "sharp";
import { conflict } from "../../platform/errors.js";

const reservedFileMetadata = new Set(["file_name", "mime_type", "size_bytes"]);

const allowedExtensions = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
} as const satisfies Record<string, readonly string[]>;

type SupportedMimeType = keyof typeof allowedExtensions;

function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return Object.prototype.hasOwnProperty.call(allowedExtensions, mimeType);
}

function hasAllowedExtension(fileName: string, mimeType: SupportedMimeType): boolean {
  const extensions = allowedExtensions[mimeType];
  return extensions.some((extension) => fileName.trim().toLowerCase().endsWith(extension));
}

function isSafeText(body: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return false;
  }
  return !body.some(
    (byte) => byte === 0 || (byte < 0x20 && ![0x09, 0x0a, 0x0d].includes(byte)),
  );
}

function csvContainsFormula(body: Buffer): boolean {
  const value = body.toString("utf8").replace(/^\uFEFF/u, "");
  let atCellStart = true;
  let quoted = false;
  let checkingPrefix = true;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (atCellStart) {
      if (character === '"') {
        quoted = true;
        atCellStart = false;
        checkingPrefix = true;
        continue;
      }
      if (character === " " || character === "\t") continue;
      if (["=", "+", "-", "@"].includes(character)) return true;
      atCellStart = false;
    } else if (quoted) {
      if (character === '"') {
        if (value[index + 1] === '"') {
          index += 1;
          checkingPrefix = false;
        } else {
          quoted = false;
        }
      } else if (checkingPrefix && character !== " " && character !== "\t") {
        if (["=", "+", "-", "@"].includes(character)) return true;
        checkingPrefix = false;
      }
    }
    if (!quoted && [",", ";", "\t", "|", "\r", "\n"].includes(character)) {
      atCellStart = true;
      checkingPrefix = true;
    }
  }
  return false;
}

const unsafePdfNames = new Set([
  "AA",
  "EmbeddedFile",
  "EmbeddedFiles",
  "GoToR",
  "ImportData",
  "JavaScript",
  "JS",
  "Launch",
  "OpenAction",
  "RichMedia",
  "SubmitForm",
  "URI",
  "XFA",
]);

function hasUnsafePdfObject(value: unknown): boolean {
  if (value instanceof PDFName) return unsafePdfNames.has(value.decodeText());
  if (value instanceof PDFStream) return hasUnsafePdfObject(value.dict);
  if (value instanceof PDFArray) {
    return value.asArray().some((item) => hasUnsafePdfObject(item));
  }
  if (value instanceof PDFDict) {
    return value.entries().some(([key, item]) =>
      unsafePdfNames.has(key.decodeText()) || hasUnsafePdfObject(item));
  }
  return false;
}

async function isDecodedPdf(body: Buffer): Promise<boolean> {
  const endMarker = body.lastIndexOf(Buffer.from("%%EOF"));
  if (
    body.subarray(0, 5).toString("ascii") !== "%PDF-" ||
    endMarker < Math.max(0, body.length - 1_024) ||
    !/^[\t\n\f\r ]*$/u.test(body.subarray(endMarker + 5).toString("ascii"))
  ) return false;
  if (/\/(?:AA|EmbeddedFile|JavaScript|JS|Launch|OpenAction|RichMedia|XFA)\b/u.test(body.toString("latin1"))) {
    return false;
  }
  try {
    const document = await PDFDocument.load(body, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    return document.getPageCount() > 0 &&
      document.context.enumerateIndirectObjects().every(([, value]) => !hasUnsafePdfObject(value));
  } catch {
    return false;
  }
}

async function isDecodedImage(body: Buffer, expectedFormat: "jpeg" | "png" | "webp"): Promise<boolean> {
  try {
    if (expectedFormat === "jpeg" &&
      (body.length < 2 || body[body.length - 2] !== 0xff || body[body.length - 1] !== 0xd9)) return false;
    const pngEnd = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    if (expectedFormat === "png" &&
      (body.length < pngEnd.length || !body.subarray(-pngEnd.length).equals(pngEnd))) return false;
    if (expectedFormat === "webp" &&
      (body.length < 12 || body.readUInt32LE(4) + 8 !== body.length)) return false;
    const image = sharp(body, {
      failOn: "warning",
      limitInputPixels: 16_777_216,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (metadata.format !== expectedFormat) return false;
    await image.raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}

export async function fileContentMatchesMimeType(
  body: Buffer,
  mimeType: string,
  fileName: string,
): Promise<boolean> {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (!isSupportedMimeType(normalizedMime)) return false;
  if (!hasAllowedExtension(fileName, normalizedMime)) return false;
  switch (normalizedMime) {
    case "application/pdf": return isDecodedPdf(body);
    case "image/jpeg": return isDecodedImage(body, "jpeg");
    case "image/png": return isDecodedImage(body, "png");
    case "image/webp": return isDecodedImage(body, "webp");
    case "text/plain": return isSafeText(body);
    case "text/csv": return isSafeText(body) && !csvContainsFormula(body);
  }
}

export async function parseSingleFileMultipartUpload(
  request: FastifyRequest,
): Promise<{ fields: Record<string, unknown>; fileBuffer?: Buffer }> {
  if (!request.isMultipart()) return { fields: request.body as Record<string, unknown> };
  const fields: Record<string, unknown> = {};
  let fileBuffer: Buffer | undefined;
  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "file") throw conflict("Unexpected multipart file field");
      if (fileBuffer !== undefined) throw conflict("Exactly one multipart file is allowed");
      fileBuffer = await part.toBuffer();
      const mimeType = part.mimetype.trim().toLowerCase();
      if (!await fileContentMatchesMimeType(fileBuffer, mimeType, part.filename)) {
        throw conflict("Uploaded file content does not match its declared type");
      }
      fields.file_name = part.filename;
      fields.mime_type = mimeType;
      fields.size_bytes = fileBuffer.length;
      continue;
    }
    if (reservedFileMetadata.has(part.fieldname)) {
      throw conflict("Multipart file metadata must come from the file part");
    }
    if (Object.prototype.hasOwnProperty.call(fields, part.fieldname)) {
      throw conflict("Duplicate multipart field");
    }
    fields[part.fieldname] = part.value;
  }
  return { fields, fileBuffer };
}
