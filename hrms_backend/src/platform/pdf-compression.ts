import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export type PdfCompressionQuality = "screen" | "ebook" | "printer" | "prepress" | "default";

export interface PdfCompressionOptions {
  enabled: boolean;
  binary: string;
  quality: PdfCompressionQuality;
  minBytes: number;
  timeoutMs: number;
  failOpen: boolean;
}

export interface PdfCompressionResult {
  buffer: Buffer;
  compressed: boolean;
  attempted: boolean;
  originalSize: number;
  outputSize: number;
  reason: string;
}

export function defaultPdfCompressionOptions(): PdfCompressionOptions {
  return {
    enabled: false,
    binary: "gs",
    quality: "ebook",
    minBytes: 128 * 1024,
    timeoutMs: 30_000,
    failOpen: true
  };
}

export function isPdfUpload(mimeType: string, fileName: string, body: Buffer): boolean {
  const declaredPdf = mimeType.toLowerCase() === "application/pdf";
  const namedPdf = fileName.toLowerCase().endsWith(".pdf");
  const magicPdf = body.subarray(0, 5).toString("utf8") === "%PDF-";
  return magicPdf || (declaredPdf && namedPdf);
}

export async function compressPdfBuffer(
  input: Buffer,
  options: PdfCompressionOptions
): Promise<PdfCompressionResult> {
  if (!options.enabled) {
    return skipped(input, "disabled");
  }
  if (input.length < options.minBytes) {
    return skipped(input, "below_min_size");
  }

  const directory = await mkdtemp(join(tmpdir(), "hawkaii-hrms-pdf-"));
  const inputPath = join(directory, "input.pdf");
  const outputPath = join(directory, "output.pdf");
  try {
    await writeFile(inputPath, input);
    await runGhostscript(options, inputPath, outputPath);
    const output = await readFile(outputPath);
    if (output.length <= 0) {
      return unchanged(input, "empty_output");
    }
    if (output.length >= input.length) {
      return unchanged(input, "not_smaller");
    }
    return {
      buffer: output,
      compressed: true,
      attempted: true,
      originalSize: input.length,
      outputSize: output.length,
      reason: "compressed"
    };
  } catch (error) {
    if (!options.failOpen) {
      throw error;
    }
    return unchanged(input, `failed:${error instanceof Error ? error.message : "unknown"}`);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function skipped(input: Buffer, reason: string): PdfCompressionResult {
  return {
    buffer: input,
    compressed: false,
    attempted: false,
    originalSize: input.length,
    outputSize: input.length,
    reason
  };
}

function unchanged(input: Buffer, reason: string): PdfCompressionResult {
  return {
    buffer: input,
    compressed: false,
    attempted: true,
    originalSize: input.length,
    outputSize: input.length,
    reason
  };
}

function runGhostscript(
  options: PdfCompressionOptions,
  inputPath: string,
  outputPath: string
): Promise<void> {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    `-dPDFSETTINGS=/${options.quality}`,
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dSAFER",
    `-sOutputFile=${outputPath}`,
    inputPath
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(options.binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Ghostscript timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      const details = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(`Ghostscript exited with ${code}${details ? `: ${details}` : ""}`));
    });
  });
}
