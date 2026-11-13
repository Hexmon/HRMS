/** Serializes cells as text and prevents spreadsheet formula execution. */
export function serializeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, rows: readonly (readonly unknown[])[]): void {
  const blob = new Blob([serializeCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Spreadsheet applications may ignore leading whitespace and control characters.
  // eslint-disable-next-line no-control-regex -- Detect nonprinting prefixes before formula characters.
  if (typeof value === "string" && /^[\s\u0000-\u001f\u007f\ufeff]*[=+\-@]/u.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
