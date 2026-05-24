import { describe, expect, it } from "vitest";
import {
  compressPdfBuffer,
  defaultPdfCompressionOptions,
  isPdfUpload
} from "./pdf-compression.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "utf8");

describe("PDF compression", () => {
  it("detects PDF uploads from content and metadata", () => {
    expect(isPdfUpload("application/pdf", "statement.pdf", pdf)).toBe(true);
    expect(isPdfUpload("application/octet-stream", "statement.bin", pdf)).toBe(true);
    expect(isPdfUpload("application/pdf", "statement.txt", Buffer.from("not a pdf"))).toBe(false);
  });

  it("skips compression when disabled", async () => {
    const result = await compressPdfBuffer(pdf, {
      ...defaultPdfCompressionOptions(),
      enabled: false
    });

    expect(result).toMatchObject({
      buffer: pdf,
      compressed: false,
      attempted: false,
      reason: "disabled"
    });
  });

  it("fails open when Ghostscript is unavailable and configured to do so", async () => {
    const result = await compressPdfBuffer(pdf, {
      ...defaultPdfCompressionOptions(),
      enabled: true,
      binary: "hawkaii-missing-gs",
      minBytes: 0,
      failOpen: true
    });

    expect(result.buffer).toEqual(pdf);
    expect(result.compressed).toBe(false);
    expect(result.attempted).toBe(true);
    expect(result.reason).toMatch(/^failed:/u);
  });

  it("throws when Ghostscript is unavailable and fail-open is disabled", async () => {
    await expect(
      compressPdfBuffer(pdf, {
        ...defaultPdfCompressionOptions(),
        enabled: true,
        binary: "hawkaii-missing-gs",
        minBytes: 0,
        failOpen: false
      })
    ).rejects.toThrow();
  });
});
